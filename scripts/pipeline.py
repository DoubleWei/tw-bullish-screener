"""Main entry: fetch → analyze → aggregate → write."""
from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from analyze_llm import analyze_news
from backtest import run_backtest
from calibrate import calibrate, load_params
from fetch_news import fetch_all
from fetch_prices import fetch_technicals, fetch_chart_data_batch
from map_to_tickers import (
    aggregate_industries,
    build_recommendations,
    build_recommendations_v2,
    build_recommendations_launchpad,
)
from writers import write_latest

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pipeline")

TPE = timezone(timedelta(hours=8))
ROOT = Path(__file__).resolve().parent
PUBLIC_DATA = ROOT.parent / "public" / "data"
CONFIG = ROOT / "config"
WINDOW_HOURS = 24
NEXT_RUN_HOURS = 6
STRATEGY_PARAMS_PATH = CONFIG / "strategy_params.json"


def _read_calibration(params_path: Path) -> dict:
    """Read strategy_params.json and return calibration data for the frontend payload."""
    if not params_path.exists():
        return {"current_weights": {}, "calibration_count": 0, "last_updated": "", "history": []}
    sp = json.loads(params_path.read_text(encoding="utf-8"))
    return {
        "current_weights": {
            "momentum":  {k: sp["momentum"][k]  for k in ("chips_weight", "tech_weight", "news_weight")  if "momentum"  in sp},
            "launchpad": {k: sp["launchpad"][k] for k in ("raw_weight", "news_weight", "strong_threshold", "moderate_threshold") if "launchpad" in sp},
        },
        "calibration_count": sp.get("calibration_count", 0),
        "last_updated":      sp.get("last_updated", ""),
        "history":           sp.get("calibration_history", []),
    }


def _market_label(score: float) -> str:
    return "偏多" if score > 0.2 else "偏空" if score < -0.2 else "中性"


def main() -> int:
    started = time.time()
    now = datetime.now(TPE)
    log.info("== Pipeline start: %s ==", now.isoformat())

    industry_map = json.loads((CONFIG / "industry_map.json").read_text(encoding="utf-8"))
    industry_codes = list(industry_map["industries"].keys())
    prompt_template = (CONFIG / "prompts" / "industry_analysis.md").read_text(encoding="utf-8")
    sources_cfg = json.loads((CONFIG / "rss_sources.json").read_text(encoding="utf-8"))

    # Load dynamic strategy weights (auto-calibrated)
    strategy_params = load_params(STRATEGY_PARAMS_PATH) if STRATEGY_PARAMS_PATH.exists() else {}
    mom_params = strategy_params.get("momentum", {})
    lp_params  = strategy_params.get("launchpad", {})

    # ── 1. Fetch TWSE full-market data (chips pipeline) ───────────────────────
    chips_mode = False
    candidates: list[dict] = []
    prices: dict = {}
    try:
        from calc_chips import screen_candidates
        from fetch_twse import fetch_all_prices, fetch_institutional_history, fetch_margin_latest

        log.info("Fetching TWSE full-market data…")
        prices       = fetch_all_prices()
        inst_history = fetch_institutional_history(n_days=10)
        margin_data  = fetch_margin_latest()

        if prices and inst_history:
            candidates = screen_candidates(prices, inst_history, margin_data, max_candidates=100)
            chips_mode = bool(candidates)
            log.info("Chips mode: %d candidates from %d stocks", len(candidates), len(prices))
        else:
            log.warning("TWSE data incomplete — falling back to news-only mode")
    except Exception as exc:
        log.warning("TWSE fetch failed (%s) — falling back to news-only mode", exc)

    # ── 2. Fetch news ─────────────────────────────────────────────────────────
    news = fetch_all(CONFIG / "rss_sources.json", window_hours=WINDOW_HOURS)
    if not news:
        log.warning("No news fetched; aborting")
        return 1

    # ── 3. Analyze news with Gemini ───────────────────────────────────────────
    analyses = analyze_news([n.to_dict() for n in news], industry_codes, prompt_template)

    enriched_news = []
    for n in news:
        a = analyses.get(n.id, {})
        enriched_news.append({
            **n.to_dict(),
            "sentiment_score":    a.get("sentiment_score", 0.0),
            "sentiment_label":    a.get("sentiment_label", "NEUTRAL"),
            "affected_industries": a.get("affected_industries", []),
            "impact_reason_zh":   a.get("impact_reason_zh", ""),
        })

    # ── 4. Aggregate industry signals ─────────────────────────────────────────
    industries = aggregate_industries(list(analyses.values()))
    industries_out = [
        {
            "industry_code":    code,
            "industry_name_zh": industry_map["industries"].get(code, {}).get("name_zh", code),
            "sentiment_score":  ind["sentiment_score"],
            "signal":           ind["signal"],
            "news_count":       ind["news_count"],
            "summary_zh":       ind["summary_zh"],
            "key_drivers":      ind["key_drivers"],
        }
        for code, ind in industries.items()
    ]

    bullish = sum(1 for i in industries.values() if i["signal"] == "BULLISH")
    bearish = sum(1 for i in industries.values() if i["signal"] == "BEARISH")
    neutral = sum(1 for i in industries.values() if i["signal"] == "NEUTRAL")
    total   = max(bullish + bearish + neutral, 1)
    overall = sum(i["sentiment_score"] for i in industries.values()) / total
    overall_news_score = max(0.0, round(overall, 3))

    # ── 5. Build recommendations ──────────────────────────────────────────────
    recommendations_launchpad: list[dict] = []

    if chips_mode:
        from calc_launchpad import screen_launchpad_candidates

        candidate_tickers = [c["ticker"] for c in candidates]
        tech_data = fetch_technicals(candidate_tickers)

        # Strategy A: 作多動能 (ongoing momentum)
        recommendations = build_recommendations_v2(
            candidates, industries, industry_map, tech_data, overall_news_score,
            params=mom_params,
        )

        # Strategy B: 即將起漲 (early launchpad)
        lp_candidates = screen_launchpad_candidates(candidates, tech_data, max_results=30)
        recommendations_launchpad = build_recommendations_launchpad(
            lp_candidates, industries, industry_map, tech_data, overall_news_score,
            params=lp_params,
        )
        log.info("Launchpad recommendations: %d", len(recommendations_launchpad))

        schema_version = "2.0"
    else:
        all_tickers = [
            t["code"]
            for meta in industry_map["industries"].values()
            for t in meta["tickers"]
        ]
        tech_data = fetch_technicals(all_tickers)
        recommendations = build_recommendations(industries, industry_map, tech_data)
        schema_version = "1.1"

    # ── 5b. Fetch and write per-ticker chart data ─────────────────────────────
    if chips_mode:
        try:
            chart_recs = recommendations[:20] + recommendations_launchpad[:10]
            chart_data = fetch_chart_data_batch(chart_recs)
            if chart_data:
                charts_dir = PUBLIC_DATA / "charts"
                charts_dir.mkdir(parents=True, exist_ok=True)
                for ticker, cdata in chart_data.items():
                    (charts_dir / f"{ticker}.json").write_text(
                        json.dumps(cdata, ensure_ascii=False),
                        encoding="utf-8",
                    )
                log.info("Wrote chart data for %d tickers", len(chart_data))
        except Exception as exc:
            log.warning("Chart data fetch failed (non-fatal): %s", exc)

    # ── 6. Write output ───────────────────────────────────────────────────────
    meta: dict = {
        "pipeline_version":     "1.0.0",
        "ai_engine":            os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        "total_news_fetched":   len(news),
        "total_news_analyzed":  len(analyses),
        "rss_sources_count":    sum(1 for s in sources_cfg if s.get("enabled", True)),
        "tickers_with_technicals": len(tech_data),
        "elapsed_seconds":      round(time.time() - started, 1),
    }
    if chips_mode:
        meta["total_stocks_scanned"] = len(prices)
        meta["chips_candidates"]     = len(candidates)

    payload = {
        "schema_version": schema_version,
        "generated_at":   now.isoformat(),
        "next_update_at": (now + timedelta(hours=NEXT_RUN_HOURS)).isoformat(),
        "window": {
            "from":  (now - timedelta(hours=WINDOW_HOURS)).isoformat(),
            "to":    now.isoformat(),
            "hours": WINDOW_HOURS,
        },
        "market_sentiment": {
            "overall_score":      round(overall, 3),
            "label":              _market_label(overall),
            "bullish_industries": bullish,
            "bearish_industries": bearish,
            "neutral_industries": neutral,
        },
        "industries":               industries_out,
        "news":                     enriched_news,
        "recommendations":          recommendations,
        "recommendations_launchpad": recommendations_launchpad,
        "meta":                     meta,
        "calibration":              _read_calibration(STRATEGY_PARAMS_PATH),
    }

    path = write_latest(payload, PUBLIC_DATA)
    log.info(
        "Wrote %s (news=%d, industries=%d, recs=%d, tech=%d, chips_mode=%s)",
        path, len(enriched_news), len(industries_out), len(recommendations), len(tech_data), chips_mode,
    )

    # ── 7. Backtest + auto-calibrate ─────────────────────────────────────────
    try:
        bt_results = run_backtest(
            history_dir=PUBLIC_DATA / "history",
            output_path=PUBLIC_DATA / "backtest_results.json",
        )
        if bt_results and STRATEGY_PARAMS_PATH.exists():
            cal = calibrate(bt_results, STRATEGY_PARAMS_PATH)
            if cal["changed"]:
                log.info("Strategy calibrated: %s", cal["log"])
            else:
                log.info("Calibration: %s", cal["log"])
    except Exception as exc:
        log.warning("Backtest/calibrate failed (non-fatal): %s", exc)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

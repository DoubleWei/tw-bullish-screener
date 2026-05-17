"""Main entry: fetch → analyze → aggregate → write."""
from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from analyze_llm import analyze_news
from fetch_news import fetch_all
from map_to_tickers import aggregate_industries, build_recommendations
from writers import write_latest

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pipeline")

TPE = timezone(timedelta(hours=8))
ROOT = Path(__file__).resolve().parent
PUBLIC_DATA = ROOT.parent / "public" / "data"
CONFIG = ROOT / "config"
WINDOW_HOURS = 24
NEXT_RUN_HOURS = 6


def _market_label(score: float) -> str:
    return "偏多" if score > 0.2 else "偏空" if score < -0.2 else "中性"


def main() -> int:
    started = time.time()
    now = datetime.now(TPE)
    log.info("== Pipeline start: %s ==", now.isoformat())

    news = fetch_all(CONFIG / "rss_sources.json", window_hours=WINDOW_HOURS)
    if not news:
        log.warning("No news fetched; aborting")
        return 1

    industry_map = json.loads((CONFIG / "industry_map.json").read_text(encoding="utf-8"))
    industry_codes = list(industry_map["industries"].keys())
    prompt_template = (CONFIG / "prompts" / "industry_analysis.md").read_text(encoding="utf-8")

    analyses = analyze_news([n.to_dict() for n in news], industry_codes, prompt_template)

    enriched_news = []
    for n in news:
        a = analyses.get(n.id, {})
        enriched_news.append({
            **n.to_dict(),
            "sentiment_score": a.get("sentiment_score", 0.0),
            "sentiment_label": a.get("sentiment_label", "NEUTRAL"),
            "affected_industries": a.get("affected_industries", []),
            "impact_reason_zh": a.get("impact_reason_zh", ""),
        })

    industries = aggregate_industries(list(analyses.values()))
    industries_out = [
        {
            "industry_code": code,
            "industry_name_zh": industry_map["industries"].get(code, {}).get("name_zh", code),
            "sentiment_score": ind["sentiment_score"],
            "signal": ind["signal"],
            "news_count": ind["news_count"],
            "summary_zh": ind["summary_zh"],
            "key_drivers": ind["key_drivers"],
        }
        for code, ind in industries.items()
    ]

    recommendations = build_recommendations(industries, industry_map)

    bullish = sum(1 for i in industries.values() if i["signal"] == "BULLISH")
    bearish = sum(1 for i in industries.values() if i["signal"] == "BEARISH")
    neutral = sum(1 for i in industries.values() if i["signal"] == "NEUTRAL")
    overall = sum(i["sentiment_score"] for i in industries.values()) / max(bullish + bearish + neutral, 1)

    sources = json.loads((CONFIG / "rss_sources.json").read_text(encoding="utf-8"))
    payload = {
        "schema_version": "1.0",
        "generated_at": now.isoformat(),
        "next_update_at": (now + timedelta(hours=NEXT_RUN_HOURS)).isoformat(),
        "window": {
            "from": (now - timedelta(hours=WINDOW_HOURS)).isoformat(),
            "to": now.isoformat(),
            "hours": WINDOW_HOURS,
        },
        "market_sentiment": {
            "overall_score": round(overall, 3),
            "label": _market_label(overall),
            "bullish_industries": bullish,
            "bearish_industries": bearish,
            "neutral_industries": neutral,
        },
        "industries": industries_out,
        "news": enriched_news,
        "recommendations": recommendations,
        "meta": {
            "pipeline_version": "0.1.0",
            "ai_engine": os.environ.get("GEMINI_MODEL", "gemini-3-pro-latest"),
            "total_news_fetched": len(news),
            "total_news_analyzed": len(analyses),
            "rss_sources_count": sum(1 for s in sources if s.get("enabled", True)),
            "elapsed_seconds": round(time.time() - started, 1),
        },
    }

    path = write_latest(payload, PUBLIC_DATA)
    log.info("Wrote %s (news=%d, industries=%d, recs=%d)", path, len(enriched_news), len(industries_out), len(recommendations))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Aggregate news analyses → industry signals → ticker recommendations."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

BULLISH_THRESHOLD = 0.4
STRONG_THRESHOLD = 0.75
MODERATE_THRESHOLD = 0.5

NEWS_WEIGHT = 0.6
TECH_WEIGHT = 0.4

# v2 weights (chips-first pipeline)
CHIPS_WEIGHT_V2 = 0.40
TECH_WEIGHT_V2  = 0.30
NEWS_WEIGHT_V2  = 0.30
STRONG_THRESHOLD_V2   = 0.68
MODERATE_THRESHOLD_V2 = 0.44

# Launchpad weights: raw launchpad score carries most of the weight
LAUNCHPAD_RAW_WEIGHT  = 0.70
LAUNCHPAD_NEWS_WEIGHT = 0.30
LAUNCHPAD_STRONG_THRESHOLD   = 0.50
LAUNCHPAD_MODERATE_THRESHOLD = 0.30


def aggregate_industries(analyses: list[dict]) -> dict[str, dict]:
    bucket: dict[str, list[dict]] = defaultdict(list)
    for a in analyses:
        for code in a.get("affected_industries", []):
            bucket[code].append(a)

    out: dict[str, dict] = {}
    for code, items in bucket.items():
        avg = sum(x["sentiment_score"] for x in items) / len(items)
        signal = "BULLISH" if avg >= BULLISH_THRESHOLD else ("BEARISH" if avg <= -BULLISH_THRESHOLD else "NEUTRAL")
        top = max(items, key=lambda x: abs(x["sentiment_score"]))
        out[code] = {
            "sentiment_score": round(avg, 3),
            "signal": signal,
            "news_count": len(items),
            "summary_zh": top.get("impact_reason_zh", ""),
            "key_drivers": [],
            "news_ids": [x["news_id"] for x in items],
        }
    return out


def build_recommendations(
    industries: dict[str, dict],
    industry_map: dict,
    tech_data: dict[str, dict[str, Any]] | None = None,
) -> list[dict]:
    recs: list[dict] = []
    seen: set[str] = set()
    tech_data = tech_data or {}

    for code, ind in industries.items():
        if ind["signal"] != "BULLISH":
            continue
        meta = industry_map["industries"].get(code)
        if not meta:
            continue

        for t in meta["tickers"]:
            if t["code"] in seen:
                continue
            seen.add(t["code"])

            news_boost = 1 + 0.05 * min(ind["news_count"], 5)
            news_score = min(1.0, ind["sentiment_score"] * t["weight"] * news_boost)

            tech = tech_data.get(t["code"])
            if tech:
                composite = round(news_score * NEWS_WEIGHT + tech["tech_score"] * TECH_WEIGHT, 3)
            else:
                composite = round(news_score, 3)

            strength = (
                "STRONG" if composite >= STRONG_THRESHOLD else
                "MODERATE" if composite >= MODERATE_THRESHOLD else
                "WEAK"
            )

            rec: dict = {
                "ticker":             t["code"],
                "name_zh":            t["name_zh"],
                "industry_code":      code,
                "industry_name_zh":   meta["name_zh"],
                "news_score":         round(news_score, 3),
                "bullish_score":      composite,
                "signal_strength":    strength,
                "trigger_news_ids":   ind["news_ids"][:5],
                "reason_zh":          ind["summary_zh"],
                "related_industries": [code],
            }
            if tech:
                rec["technical"] = tech

            recs.append(rec)

    recs.sort(key=lambda r: r["bullish_score"], reverse=True)
    for i, r in enumerate(recs, 1):
        r["rank"] = i
    return recs


def _build_ticker_index(industry_map: dict) -> dict[str, dict]:
    """Build {ticker_code: {industry_code, industry_name_zh, weight}} reverse index."""
    index: dict[str, dict] = {}
    for ind_code, meta in industry_map.get("industries", {}).items():
        for t in meta.get("tickers", []):
            index[t["code"]] = {
                "industry_code":    ind_code,
                "industry_name_zh": meta.get("name_zh", ind_code),
                "weight":           t.get("weight", 1.0),
            }
    return index


def build_recommendations_v2(
    candidates: list[dict],
    industries: dict[str, dict],
    industry_map: dict,
    tech_data: dict[str, Any],
    overall_news_score: float = 0.0,
    params: dict | None = None,
) -> list[dict]:
    """
    Build recommendations from chips-screened candidates.
    composite = chips × w_chips + tech × w_tech + news × w_news
    Weights default to module constants; pass params dict from strategy_params.json to override.
    """
    p = params or {}
    w_chips      = p.get("chips_weight",      CHIPS_WEIGHT_V2)
    w_tech       = p.get("tech_weight",       TECH_WEIGHT_V2)
    w_news       = p.get("news_weight",       NEWS_WEIGHT_V2)
    thr_strong   = p.get("strong_threshold",   STRONG_THRESHOLD_V2)
    thr_moderate = p.get("moderate_threshold", MODERATE_THRESHOLD_V2)

    ticker_index = _build_ticker_index(industry_map)
    recs: list[dict] = []

    for cand in candidates:
        code        = cand["ticker"]
        chips       = cand["chips"]
        chips_score = chips["chips_score"]

        idx = ticker_index.get(code)
        if idx:
            ind = industries.get(idx["industry_code"])
            if ind and ind["sentiment_score"] > 0:
                news_boost = 1 + 0.05 * min(ind["news_count"], 5)
                news_score = min(1.0, ind["sentiment_score"] * idx["weight"] * news_boost)
            else:
                news_score = max(0.0, overall_news_score)
            industry_code    = idx["industry_code"]
            industry_name_zh = idx["industry_name_zh"]
            trigger_news_ids = (ind["news_ids"][:5] if ind else [])
            reason_zh        = (ind["summary_zh"] if ind and ind.get("summary_zh") else "")
        else:
            news_score       = max(0.0, overall_news_score)
            industry_code    = "GENERAL"
            industry_name_zh = "綜合"
            trigger_news_ids = []
            reason_zh        = ""

        tech       = tech_data.get(code)
        tech_score = tech["tech_score"] if tech else 0.0

        composite = round(
            chips_score * w_chips + tech_score * w_tech + news_score * w_news,
            3,
        )
        strength = (
            "STRONG"   if composite >= thr_strong else
            "MODERATE" if composite >= thr_moderate else
            "WEAK"
        )

        rec: dict = {
            "ticker":             code,
            "name_zh":            cand["name_zh"],
            "price":              cand["price"],
            "industry_code":      industry_code,
            "industry_name_zh":   industry_name_zh,
            "news_score":         round(news_score, 3),
            "bullish_score":      composite,
            "signal_strength":    strength,
            "trigger_news_ids":   trigger_news_ids,
            "reason_zh":          reason_zh,
            "related_industries": [industry_code],
            "chips":              chips,
        }
        if tech:
            rec["technical"] = tech

        recs.append(rec)

    recs.sort(key=lambda r: r["bullish_score"], reverse=True)
    for i, r in enumerate(recs, 1):
        r["rank"] = i
    return recs


def build_recommendations_launchpad(
    lp_candidates: list[dict],
    industries: dict[str, dict],
    industry_map: dict,
    tech_data: dict[str, Any],
    overall_news_score: float = 0.0,
    params: dict | None = None,
) -> list[dict]:
    """
    Build recommendations from launchpad-screened candidates.
    composite = launchpad_raw × w_raw + news × w_news
    Weights default to module constants; pass params dict to override.
    """
    lp = params or {}
    w_raw        = lp.get("raw_weight",        LAUNCHPAD_RAW_WEIGHT)
    w_news_lp    = lp.get("news_weight",       LAUNCHPAD_NEWS_WEIGHT)
    thr_strong_lp   = lp.get("strong_threshold",   LAUNCHPAD_STRONG_THRESHOLD)
    thr_moderate_lp = lp.get("moderate_threshold", LAUNCHPAD_MODERATE_THRESHOLD)

    ticker_index = _build_ticker_index(industry_map)
    recs: list[dict] = []

    for cand in lp_candidates:
        code          = cand["ticker"]
        chips         = cand["chips"]
        launchpad_raw = cand["launchpad_score"]
        lp_tech_sigs  = cand.get("launchpad_tech_signals", [])
        lp_chips_sigs = cand.get("launchpad_chips_signals", [])

        idx = ticker_index.get(code)
        if idx:
            ind = industries.get(idx["industry_code"])
            if ind and ind["sentiment_score"] > 0:
                news_boost = 1 + 0.05 * min(ind["news_count"], 5)
                news_score = min(1.0, ind["sentiment_score"] * idx["weight"] * news_boost)
            else:
                news_score = max(0.0, overall_news_score)
            industry_code    = idx["industry_code"]
            industry_name_zh = idx["industry_name_zh"]
            trigger_news_ids = (ind["news_ids"][:5] if ind else [])
            reason_zh        = (ind["summary_zh"] if ind and ind.get("summary_zh") else "")
        else:
            news_score       = max(0.0, overall_news_score)
            industry_code    = "GENERAL"
            industry_name_zh = "綜合"
            trigger_news_ids = []
            reason_zh        = ""

        composite = round(
            launchpad_raw * w_raw + news_score * w_news_lp,
            3,
        )
        strength = (
            "STRONG"   if composite >= thr_strong_lp else
            "MODERATE" if composite >= thr_moderate_lp else
            "WEAK"
        )

        # Override chips/tech signals with launchpad-specific signals
        lp_chips = {**chips, "signals": lp_chips_sigs}
        tech = tech_data.get(code)
        lp_tech: dict | None = ({**tech, "signals": lp_tech_sigs} if tech else None)

        rec: dict = {
            "ticker":             code,
            "name_zh":            cand["name_zh"],
            "price":              cand["price"],
            "industry_code":      industry_code,
            "industry_name_zh":   industry_name_zh,
            "news_score":         round(news_score, 3),
            "bullish_score":      composite,
            "signal_strength":    strength,
            "trigger_news_ids":   trigger_news_ids,
            "reason_zh":          reason_zh,
            "related_industries": [industry_code],
            "chips":              lp_chips,
        }
        if lp_tech:
            rec["technical"] = lp_tech

        recs.append(rec)

    recs.sort(key=lambda r: r["bullish_score"], reverse=True)
    for i, r in enumerate(recs, 1):
        r["rank"] = i
    return recs

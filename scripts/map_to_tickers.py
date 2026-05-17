"""Aggregate news analyses → industry signals → ticker recommendations."""
from __future__ import annotations

from collections import defaultdict

BULLISH_THRESHOLD = 0.4
STRONG_THRESHOLD = 0.75
MODERATE_THRESHOLD = 0.5


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


def build_recommendations(industries: dict[str, dict], industry_map: dict) -> list[dict]:
    recs: list[dict] = []
    seen: set[str] = set()

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
            score = min(1.0, ind["sentiment_score"] * t["weight"] * news_boost)
            strength = "STRONG" if score >= STRONG_THRESHOLD else ("MODERATE" if score >= MODERATE_THRESHOLD else "WEAK")

            recs.append({
                "ticker": t["code"],
                "name_zh": t["name_zh"],
                "industry_code": code,
                "industry_name_zh": meta["name_zh"],
                "bullish_score": round(score, 3),
                "signal_strength": strength,
                "trigger_news_ids": ind["news_ids"][:5],
                "reason_zh": ind["summary_zh"],
                "related_industries": [code],
            })

    recs.sort(key=lambda r: r["bullish_score"], reverse=True)
    for i, r in enumerate(recs, 1):
        r["rank"] = i
    return recs

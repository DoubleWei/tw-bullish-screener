"""Gemini-based industry sentiment analysis (batched, structured output)."""
from __future__ import annotations

import json
import logging
import os
import re
import time

from google import genai
from google.genai import types

log = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-2.5-flash"
BATCH_SIZE = 50   # one batch covers ~50 articles → 1 API call per run (vs 3-4 previously)
BATCH_SLEEP = 8   # seconds between batches when there are multiple (avoids RPM burst)

ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "analyses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "news_id": {"type": "string"},
                    "sentiment_score": {"type": "number"},
                    "sentiment_label": {"type": "string", "enum": ["BULLISH", "NEUTRAL", "BEARISH"]},
                    "affected_industries": {"type": "array", "items": {"type": "string"}},
                    "impact_reason_zh": {"type": "string"},
                },
                "required": ["news_id", "sentiment_score", "sentiment_label", "affected_industries", "impact_reason_zh"],
            },
        }
    },
    "required": ["analyses"],
}


def _build_prompt(batch: list[dict], industry_codes: list[str], template: str) -> str:
    news_block = "\n\n".join(f"[{n['id']}] {n['title']}\n{n['snippet']}" for n in batch)
    return template.format(industries=", ".join(industry_codes), news=news_block)


def _parse_retry_after(exc: Exception) -> float:
    """Extract suggested wait time from a 429 error message (default 45s)."""
    m = re.search(r"retry in ([\d.]+)s", str(exc), re.IGNORECASE)
    return float(m.group(1)) + 3 if m else 45.0


def _call_gemini(client: genai.Client, model: str, prompt: str) -> list[dict]:
    """Call Gemini once; on 429, wait the suggested time and retry once."""
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=ANALYSIS_SCHEMA,
        temperature=0.2,
    )
    for attempt in range(2):
        try:
            response = client.models.generate_content(model=model, contents=prompt, config=config)
            return json.loads(response.text).get("analyses", [])
        except Exception as exc:
            is_429 = "429" in str(exc) or "RESOURCE_EXHAUSTED" in str(exc)
            if is_429 and attempt == 0:
                wait = _parse_retry_after(exc)
                log.warning("Gemini 429 — waiting %.0fs then retrying", wait)
                time.sleep(wait)
            else:
                log.error("Gemini call failed (attempt %d): %s", attempt + 1, exc)
                return []
    return []


def analyze_news(
    news: list[dict],
    industry_codes: list[str],
    prompt_template: str,
    *,
    model: str | None = None,
    api_key: str | None = None,
) -> dict[str, dict]:
    """Return {news_id: analysis_dict}."""
    api_key = api_key or os.environ["GEMINI_API_KEY"]
    model = model or os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)

    client = genai.Client(api_key=api_key)
    results: dict[str, dict] = {}

    batches = list(range(0, len(news), BATCH_SIZE))
    for idx, i in enumerate(batches):
        batch = news[i:i + BATCH_SIZE]
        prompt = _build_prompt(batch, industry_codes, prompt_template)
        for a in _call_gemini(client, model, prompt):
            results[a["news_id"]] = a
        if idx < len(batches) - 1:
            time.sleep(BATCH_SLEEP)

    log.info("Analyzed %d / %d news (model=%s)", len(results), len(news), model)
    return results

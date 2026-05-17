"""Gemini-based industry sentiment analysis (batched, structured output)."""
from __future__ import annotations

import json
import logging
import os

from google import genai
from google.genai import types

log = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-3-pro-latest"
BATCH_SIZE = 15

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

    for i in range(0, len(news), BATCH_SIZE):
        batch = news[i:i + BATCH_SIZE]
        prompt = _build_prompt(batch, industry_codes, prompt_template)
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=ANALYSIS_SCHEMA,
                    temperature=0.2,
                ),
            )
            for a in json.loads(response.text).get("analyses", []):
                results[a["news_id"]] = a
        except Exception:
            log.exception("Gemini batch %d-%d failed", i, i + len(batch))

    log.info("Analyzed %d / %d news (model=%s)", len(results), len(news), model)
    return results

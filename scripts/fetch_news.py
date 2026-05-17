"""RSS news fetcher with dedup and time-window filtering."""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

import feedparser
from bs4 import BeautifulSoup
from dateutil import parser as date_parser

TPE = timezone(timedelta(hours=8))
DEFAULT_WINDOW_HOURS = 24
SNIPPET_MAX_CHARS = 280

log = logging.getLogger(__name__)


@dataclass
class RawNews:
    id: str
    title: str
    url: str
    source: str
    published_at: str
    snippet: str

    def to_dict(self) -> dict:
        return asdict(self)


def _hash_url(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = date_parser.parse(value)
    except (ValueError, TypeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TPE)


def _clean(html_or_text: str) -> str:
    if not html_or_text:
        return ""
    return BeautifulSoup(html_or_text, "html.parser").get_text(" ", strip=True)[:SNIPPET_MAX_CHARS]


def fetch_one(source: dict, since: datetime) -> Iterable[RawNews]:
    parsed = feedparser.parse(source["url"])
    if parsed.bozo and not parsed.entries:
        log.warning("Feed %s failed: %s", source["id"], parsed.bozo_exception)
        return []

    out: list[RawNews] = []
    for entry in parsed.entries:
        url = entry.get("link")
        if not url:
            continue
        published = _parse_dt(entry.get("published") or entry.get("updated"))
        if not published or published < since:
            continue
        out.append(RawNews(
            id=_hash_url(url),
            title=entry.get("title", "").strip(),
            url=url,
            source=source["name"],
            published_at=published.isoformat(),
            snippet=_clean(entry.get("summary") or entry.get("description") or ""),
        ))
    return out


def fetch_all(sources_path: Path, window_hours: int = DEFAULT_WINDOW_HOURS) -> list[RawNews]:
    sources = json.loads(sources_path.read_text(encoding="utf-8"))
    since = datetime.now(TPE) - timedelta(hours=window_hours)

    seen: set[str] = set()
    results: list[RawNews] = []
    for src in sources:
        if not src.get("enabled", True):
            continue
        try:
            for news in fetch_one(src, since):
                if news.id in seen:
                    continue
                seen.add(news.id)
                results.append(news)
        except Exception:
            log.exception("Source %s failed", src["id"])

    active = sum(1 for s in sources if s.get("enabled", True))
    log.info("Fetched %d unique news from %d sources", len(results), active)
    return results

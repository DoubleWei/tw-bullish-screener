"""Write latest snapshot + rotate history dir."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

log = logging.getLogger(__name__)
TPE = timezone(timedelta(hours=8))
HISTORY_RETENTION_DAYS = 30


def write_latest(payload: dict, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    latest = output_dir / "latest_signals.json"
    latest.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    history = output_dir / "history"
    history.mkdir(exist_ok=True)
    name = datetime.now(TPE).strftime("%Y-%m-%dT%H") + ".json"
    (history / name).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    _rotate(history)
    return latest


def _rotate(history_dir: Path) -> None:
    cutoff = datetime.now(TPE) - timedelta(days=HISTORY_RETENTION_DAYS)
    for f in history_dir.glob("*.json"):
        try:
            day = datetime.strptime(f.stem.split("T")[0], "%Y-%m-%d").replace(tzinfo=TPE)
            if day < cutoff:
                f.unlink()
                log.info("Removed old snapshot %s", f.name)
        except ValueError:
            continue

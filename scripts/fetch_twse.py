"""Fetch Taiwan Stock Exchange open data: prices, institutional flows, margin trading."""
from __future__ import annotations

import logging
import time
from datetime import date, timedelta

import requests

log = logging.getLogger("fetch_twse")

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; tw-bullish-screener/1.0)"}
TIMEOUT = 25

# openapi.twse.com.tw — returns latest trading day, no date param needed
STOCK_DAY_ALL_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"

# www.twse.com.tw — date-specific data
T86_URL    = "https://www.twse.com.tw/fund/T86"
MARGIN_URL = "https://www.twse.com.tw/exchangeReport/MI_MARGN"


# ---------------------------------------------------------------------------
# Current-day prices for ALL listed stocks
# ---------------------------------------------------------------------------

def fetch_all_prices() -> dict[str, dict]:
    """Return {ticker: {price, open, high, low, volume(lots), name_zh}} for all TWSE stocks."""
    log.info("Fetching all TWSE prices…")
    try:
        resp = requests.get(STOCK_DAY_ALL_URL, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        rows = resp.json()
    except Exception as exc:
        log.error("fetch_all_prices failed: %s", exc)
        return {}

    result: dict[str, dict] = {}
    for row in rows:
        code = row.get("Code", "").strip()
        if not code or not code.isdigit():
            continue
        try:
            def _f(key: str) -> float:
                v = row.get(key, "0").replace(",", "").strip()
                return float(v) if v and v not in ("--", "X", "") else 0.0

            result[code] = {
                "name_zh": row.get("Name", "").strip(),
                "price":   _f("ClosingPrice"),
                "open":    _f("OpeningPrice"),
                "high":    _f("HighestPrice"),
                "low":     _f("LowestPrice"),
                "volume":  int(_f("TradeVolume")) // 1000,  # shares → lots (張)
            }
        except (ValueError, KeyError):
            pass

    log.info("Fetched prices for %d stocks", len(result))
    return result


# ---------------------------------------------------------------------------
# Institutional investor flows (三大法人) — one day per request
# ---------------------------------------------------------------------------

def _fetch_institutional_day(date_str: str) -> dict[str, dict] | None:
    """Fetch T86 三大法人 for one date (YYYYMMDD). Returns None on holiday/no data."""
    try:
        resp = requests.get(
            T86_URL,
            params={"response": "json", "date": date_str, "selectType": "ALL"},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:
        log.debug("T86 %s failed: %s", date_str, exc)
        return None

    if payload.get("stat") != "OK" or not payload.get("data"):
        return None

    result: dict[str, dict] = {}
    for row in payload["data"]:
        if len(row) < 18:
            continue
        code = row[0].strip()
        if not code.isdigit():
            continue
        try:
            def _i(s: str) -> int:
                return int(s.replace(",", "").replace("--", "0").strip() or 0)

            # Column layout (0-based):
            # 0 code, 1 name, 2-4 外資(買/賣/淨), 5-7 外資自營(買/賣/淨),
            # 8-10 投信(買/賣/淨), 11-13 自營(自行買/賣/淨), 14-16 自營(避險買/賣/淨), 17 合計
            foreign_net = _i(row[4])  // 1000   # shares → lots
            trust_net   = _i(row[10]) // 1000
            dealer_net  = (_i(row[13]) + _i(row[16])) // 1000

            result[code] = {
                "foreign_net": foreign_net,
                "trust_net":   trust_net,
                "dealer_net":  dealer_net,
                "total_net":   foreign_net + trust_net + dealer_net,
            }
        except (ValueError, IndexError):
            pass

    return result or None


def fetch_institutional_history(n_days: int = 10) -> dict[str, list[dict]]:
    """
    Fetch last n_days trading days of institutional flows.
    Returns {ticker: [day0(newest), day1, ...]}.
    """
    days_data: list[dict[str, dict]] = []
    check_date = date.today()
    attempts = 0

    while len(days_data) < n_days and attempts < 35:
        check_date -= timedelta(days=1)
        attempts += 1
        if check_date.weekday() >= 5:       # skip weekends
            continue
        date_str = check_date.strftime("%Y%m%d")
        day = _fetch_institutional_day(date_str)
        if day:
            days_data.append(day)
            log.debug("T86 %s: %d stocks", date_str, len(day))
        time.sleep(0.35)                    # polite rate limiting

    log.info("Institutional history: %d trading days fetched", len(days_data))

    # Transpose to {ticker: [day0, day1, ...]}
    history: dict[str, list[dict]] = {}
    for day in days_data:
        for code, flows in day.items():
            history.setdefault(code, []).append(flows)
    return history


# ---------------------------------------------------------------------------
# Margin trading (融資融券)
# ---------------------------------------------------------------------------

def fetch_margin_latest() -> dict[str, dict]:
    """Return {ticker: {margin_balance(lots), margin_net(lots)}} for latest available day."""
    for offset in range(1, 8):
        check_date = date.today() - timedelta(days=offset)
        if check_date.weekday() >= 5:
            continue
        date_str = check_date.strftime("%Y%m%d")
        try:
            resp = requests.get(
                MARGIN_URL,
                params={"response": "json", "date": date_str, "selectType": "ALL"},
                headers=HEADERS,
                timeout=TIMEOUT,
            )
            resp.raise_for_status()
            payload = resp.json()
        except Exception as exc:
            log.debug("Margin %s failed: %s", date_str, exc)
            continue

        if payload.get("stat") != "OK" or not payload.get("data"):
            continue

        fields = payload.get("fields", [])
        try:
            bal_idx = fields.index("融資餘額")
            buy_idx = fields.index("融資買進")
            sel_idx = fields.index("融資賣出")
        except ValueError:
            bal_idx, buy_idx, sel_idx = 5, 2, 3

        result: dict[str, dict] = {}
        for row in payload["data"]:
            code = row[0].strip()
            if not code.isdigit():
                continue
            try:
                def _i(s: str) -> int:
                    return int(s.replace(",", "").strip() or 0)
                result[code] = {
                    "margin_balance": _i(row[bal_idx]),
                    "margin_net":     _i(row[buy_idx]) - _i(row[sel_idx]),
                }
            except (ValueError, IndexError):
                pass

        log.info("Margin data: %d stocks (%s)", len(result), date_str)
        return result

    log.warning("Could not fetch margin data")
    return {}

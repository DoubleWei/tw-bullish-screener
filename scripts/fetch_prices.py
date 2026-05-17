"""Fetch Taiwan stock daily OHLCV and compute technical indicators via yfinance."""
from __future__ import annotations

import logging
from typing import Any

import pandas as pd

log = logging.getLogger("fetch_prices")

LOOKBACK_DAYS = 95  # enough for 60 MA + extra buffer


def _rsi(close: pd.Series, window: int = 14) -> float:
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(window).mean()
    loss = (-delta.clip(upper=0)).rolling(window).mean()
    rs = gain / loss
    return float((100 - 100 / (1 + rs)).iloc[-1])


def _macd_hist(close: pd.Series) -> float:
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    return float((macd - macd.ewm(span=9, adjust=False).mean()).iloc[-1])


def _tech_score(
    price: float,
    ma5: float,
    ma20: float,
    ma60: float,
    rsi: float,
    macd_hist: float,
    vol_ratio: float,
) -> tuple[float, list[str]]:
    score = 0.0
    signals: list[str] = []

    # Price vs MAs (0.30 max)
    if price > ma5:
        score += 0.10
    if price > ma20:
        score += 0.10
        signals.append("站穩月線")
    if price > ma60:
        score += 0.10
        signals.append("站穩季線")

    # MA alignment (0.15 max)
    if ma5 > ma20 > ma60:
        score += 0.15
        signals.append("多頭排列")
    elif ma5 > ma20:
        score += 0.05

    # Volume (0.20 max)
    if vol_ratio >= 2.0:
        score += 0.20
        signals.append(f"爆量 {vol_ratio:.1f}×")
    elif vol_ratio >= 1.5:
        score += 0.10
        signals.append(f"量增 {vol_ratio:.1f}×")

    # RSI (0.20 max)
    if 50 <= rsi <= 70:
        score += 0.20
        signals.append(f"RSI {rsi:.0f}")
    elif 40 <= rsi < 50:
        score += 0.10
    elif rsi > 70:
        score += 0.05  # overbought — modest

    # MACD histogram (0.15 max)
    if macd_hist > 0:
        score += 0.15
        signals.append("MACD ↑")

    return round(min(score, 1.0), 3), signals[:4]


def fetch_technicals(tickers: list[str]) -> dict[str, dict[str, Any]]:
    """Return {ticker_code: technical_dict} for tickers with sufficient data."""
    try:
        import yfinance as yf  # lazy import — pipeline degrades gracefully if unavailable
    except ImportError:
        log.warning("yfinance not installed — skipping technical enrichment")
        return {}

    results: dict[str, dict] = {}

    for code in tickers:
        symbol = f"{code}.TW"
        try:
            hist = yf.Ticker(symbol).history(period=f"{LOOKBACK_DAYS}d", interval="1d")
            if hist.empty or len(hist) < 65:
                log.debug("%s: insufficient data (%d rows)", symbol, len(hist))
                continue

            close = hist["Close"].astype(float)
            volume = hist["Volume"].astype(float)

            price = float(close.iloc[-1])
            ma5   = float(close.rolling(5).mean().iloc[-1])
            ma20  = float(close.rolling(20).mean().iloc[-1])
            ma60  = float(close.rolling(60).mean().iloc[-1])
            rsi   = _rsi(close)
            mhist = _macd_hist(close)

            # vol_ratio: today vs prior-5-day average
            prior5 = float(volume.iloc[-6:-1].mean())
            vol_ratio = float(volume.iloc[-1]) / prior5 if prior5 > 0 else 1.0

            tscore, tsignals = _tech_score(price, ma5, ma20, ma60, rsi, mhist, vol_ratio)

            results[code] = {
                "price":      round(price, 2),
                "ma5":        round(ma5, 2),
                "ma20":       round(ma20, 2),
                "ma60":       round(ma60, 2),
                "rsi":        round(rsi, 1),
                "macd_hist":  round(mhist, 4),
                "vol_ratio":  round(vol_ratio, 2),
                "tech_score": tscore,
                "signals":    tsignals,
            }
            log.debug("%s tech_score=%.2f signals=%s", code, tscore, tsignals)

        except Exception as exc:
            log.warning("Failed to fetch %s: %s", symbol, exc)

    log.info("Technicals computed for %d/%d tickers", len(results), len(tickers))
    return results

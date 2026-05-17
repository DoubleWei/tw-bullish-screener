"""Fetch Taiwan stock daily OHLCV and compute technical indicators via yfinance."""
from __future__ import annotations

import logging
from typing import Any

import pandas as pd

log = logging.getLogger("fetch_prices")

# 180 calendar days ≈ 125 trading days — enough for 120-day price position
LOOKBACK_DAYS = 180


def _rsi(close: pd.Series, window: int = 14) -> float:
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(window).mean()
    loss = (-delta.clip(upper=0)).rolling(window).mean()
    rs = gain / loss
    return float((100 - 100 / (1 + rs)).iloc[-1])


def _macd_series(close: pd.Series) -> pd.Series:
    """Return MACD histogram series."""
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd  = ema12 - ema26
    return macd - macd.ewm(span=9, adjust=False).mean()


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


def _fetch_one(code: str) -> tuple[str, dict | None]:
    """Download yfinance history for a single Taiwan stock and compute indicators."""
    try:
        import yfinance as yf
    except ImportError:
        return code, None

    symbol = f"{code}.TW"
    try:
        hist = yf.Ticker(symbol).history(period=f"{LOOKBACK_DAYS}d", interval="1d")
        if hist.empty or len(hist) < 65:
            log.debug("%s: insufficient data (%d rows)", symbol, len(hist))
            return code, None

        close  = hist["Close"].astype(float)
        volume = hist["Volume"].astype(float)
        n      = len(close)

        price = float(close.iloc[-1])
        ma5   = float(close.rolling(5).mean().iloc[-1])
        ma10  = float(close.rolling(10).mean().iloc[-1])
        ma20  = float(close.rolling(20).mean().iloc[-1])
        ma60  = float(close.rolling(60).mean().iloc[-1])
        rsi   = _rsi(close)

        macd_h_series = _macd_series(close)
        mhist = float(macd_h_series.iloc[-1])

        prior5    = float(volume.iloc[-6:-1].mean())
        vol_ratio = float(volume.iloc[-1]) / prior5 if prior5 > 0 else 1.0

        tscore, tsignals = _tech_score(price, ma5, ma20, ma60, rsi, mhist, vol_ratio)

        # ── Launchpad indicators ───────────────────────────────────────────────

        # Distance from 20-day MA (positive = above, negative = below)
        bias_pct = round((price - ma20) / ma20 * 100, 2) if ma20 > 0 else 0.0

        # 10-day cumulative return (%)
        gain_10d = round((price / float(close.iloc[-11]) - 1) * 100, 2) if n >= 11 else 0.0

        # Position within 120-day price range (0 = bottom, 100 = top)
        if n >= 120:
            w = close.iloc[-120:]
            lo, hi = float(w.min()), float(w.max())
            price_position_120d = round((price - lo) / (hi - lo) * 100, 1) if hi > lo else 50.0
        else:
            price_position_120d = 50.0

        # Spread between highest and lowest of ma5/10/20/60 (%)
        ma_vals = [ma5, ma10, ma20, ma60]
        ma_min  = min(ma_vals)
        ma_convergence_pct = round((max(ma_vals) - ma_min) / ma_min * 100, 2) if ma_min > 0 else 100.0

        # 5MA just crossed above 20MA today (golden cross)
        ma5_s  = close.rolling(5).mean()
        ma20_s = close.rolling(20).mean()
        ma5_cross_ma20 = bool(
            n >= 2
            and float(ma5_s.iloc[-2]) < float(ma20_s.iloc[-2])
            and float(ma5_s.iloc[-1]) >= float(ma20_s.iloc[-1])
        )

        # MACD histogram just turned positive (bearish→bullish bar flip)
        macd_just_positive = bool(
            n >= 2
            and float(macd_h_series.iloc[-2]) <= 0
            and float(macd_h_series.iloc[-1]) > 0
        )

        return code, {
            "price":      round(price, 2),
            "ma5":        round(ma5, 2),
            "ma10":       round(ma10, 2),
            "ma20":       round(ma20, 2),
            "ma60":       round(ma60, 2),
            "rsi":        round(rsi, 1),
            "macd_hist":  round(mhist, 4),
            "vol_ratio":  round(vol_ratio, 2),
            "tech_score": tscore,
            "signals":    tsignals,
            # Launchpad-specific indicators
            "bias_pct":            bias_pct,
            "gain_10d":            gain_10d,
            "price_position_120d": price_position_120d,
            "ma_convergence_pct":  ma_convergence_pct,
            "ma5_cross_ma20":      ma5_cross_ma20,
            "macd_just_positive":  macd_just_positive,
        }
    except Exception as exc:
        log.warning("Failed to fetch %s: %s", symbol, exc)
        return code, None


def fetch_technicals(tickers: list[str]) -> dict[str, dict[str, Any]]:
    """Return {ticker_code: technical_dict} for tickers with sufficient data."""
    try:
        import yfinance as yf  # noqa: F401
    except ImportError:
        log.warning("yfinance not installed — skipping technical enrichment")
        return {}

    from concurrent.futures import ThreadPoolExecutor, as_completed

    results: dict[str, dict] = {}
    workers = min(10, max(1, len(tickers)))

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_fetch_one, code): code for code in tickers}
        for fut in as_completed(futures):
            code, data = fut.result()
            if data:
                results[code] = data
                log.debug("%s tech_score=%.2f signals=%s", code, data["tech_score"], data["signals"])

    log.info("Technicals computed for %d/%d tickers", len(results), len(tickers))
    return results

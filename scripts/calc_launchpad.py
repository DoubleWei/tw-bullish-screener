"""
即將起漲 (Launchpad) 策略：尋找「剛打完底、剛開始發動」的底部反轉股。

設計原則：避免追高、尋找籌碼沉澱後的第一根突破。

安全閥（硬性排除）：
  bias_pct        ≤ 8%   股價未偏離月線太遠（未過熱）
  gain_10d        ≤ 20%  近10日累積漲幅未過大
  price_position  ≤ 65%  未處於半年高位

技術訊號評分（滿分 0.68）：
  均線糾結 (ma_convergence < 3%)     +0.20  籌碼沉澱，蓄勢待發
  量增突破 (糾結 + vol_ratio ≥ 1.5)  +0.10  突破確認
  MA5 今日穿越 MA20 (黃金交叉)        +0.18  趨勢剛翻多
  MACD 柱狀圖今日由負轉正             +0.15  動能剛切換
  單純量增 (vol_ratio ≥ 1.5，無糾結)  +0.07  有人點火
  RSI 甜區 40-60                      +0.05  健康狀態

籌碼新鮮度評分（滿分 0.35）：
  投信今日首次買超 (consec = 1)        +0.20  法人剛開始佈局
  投信連買第2日   (consec = 2)         +0.12  確認建倉
  外資今日首次買超 (consec = 1)        +0.15  外資剛初登場
  外資連買第2日   (consec = 2)         +0.08  確認方向

強訊號門檻：最終分數 ≥ 0.50
中訊號門檻：最終分數 ≥ 0.30
"""
from __future__ import annotations

import logging

log = logging.getLogger("calc_launchpad")

# ── Safety filter thresholds ──────────────────────────────────────────────────
MAX_BIAS_ABS       = 8.0   # |bias_pct| must be ≤ this
MAX_GAIN_10D       = 20.0  # 10-day gain must be ≤ this
MAX_PRICE_POSITION = 65.0  # 120-day position must be ≤ this

# ── Output strength thresholds (for the final composite score) ────────────────
LAUNCHPAD_STRONG_THRESHOLD   = 0.50
LAUNCHPAD_MODERATE_THRESHOLD = 0.30


def launchpad_tech_chips_signals(
    tech: dict, chips: dict
) -> tuple[list[str], list[str]]:
    """Return (tech_signals, chips_signals) for a launchpad candidate."""
    tech_sigs: list[str] = []
    chips_sigs: list[str] = []

    ma_conv   = tech.get("ma_convergence_pct", 100.0)
    vol_ratio = tech.get("vol_ratio", 1.0)

    if ma_conv < 3.0:
        tech_sigs.append("均線糾結")
        if vol_ratio >= 1.5:
            tech_sigs.append(f"量增突破{vol_ratio:.1f}×")
    elif vol_ratio >= 1.5:
        tech_sigs.append(f"量增{vol_ratio:.1f}×")

    if tech.get("ma5_cross_ma20"):
        tech_sigs.append("黃金交叉")
    if tech.get("macd_just_positive"):
        tech_sigs.append("MACD轉多")

    trust_consec   = chips.get("trust_consec_buy", 0)
    foreign_consec = chips.get("foreign_consec_buy", 0)

    if trust_consec == 1:
        chips_sigs.append("投信初登場")
    elif trust_consec == 2:
        chips_sigs.append("投信連買2日")

    if foreign_consec == 1:
        chips_sigs.append("外資初登場")
    elif foreign_consec == 2:
        chips_sigs.append("外資連買2日")

    return tech_sigs[:4], chips_sigs[:3]


def launchpad_raw_score(tech: dict, chips: dict) -> tuple[float, bool]:
    """
    Compute raw launchpad score and whether it passes the safety filter.
    Returns (raw_score, passes_safety).
    """
    # ── Safety filter ──────────────────────────────────────────────────────────
    bias_abs  = abs(tech.get("bias_pct", 999.0))
    gain_10d  = tech.get("gain_10d", 999.0)
    position  = tech.get("price_position_120d", 100.0)

    if bias_abs > MAX_BIAS_ABS or gain_10d > MAX_GAIN_10D or position > MAX_PRICE_POSITION:
        return 0.0, False

    score: float = 0.0

    # ── Technical freshness ────────────────────────────────────────────────────
    ma_conv   = tech.get("ma_convergence_pct", 100.0)
    vol_ratio = tech.get("vol_ratio", 1.0)

    if ma_conv < 3.0:
        score += 0.20
        if vol_ratio >= 1.5:
            score += 0.10
    elif vol_ratio >= 1.5:
        score += 0.07

    if tech.get("ma5_cross_ma20"):
        score += 0.18
    if tech.get("macd_just_positive"):
        score += 0.15

    rsi = tech.get("rsi", 50.0)
    if 40 <= rsi <= 60:
        score += 0.05
    elif rsi < 40:
        score += 0.02

    # ── Chips freshness ────────────────────────────────────────────────────────
    trust_consec   = chips.get("trust_consec_buy", 0)
    foreign_consec = chips.get("foreign_consec_buy", 0)

    if trust_consec == 1:
        score += 0.20
    elif trust_consec == 2:
        score += 0.12

    if foreign_consec == 1:
        score += 0.15
    elif foreign_consec == 2:
        score += 0.08

    return round(min(score, 1.0), 3), True


def screen_launchpad_candidates(
    candidates: list[dict],
    tech_data: dict,
    max_results: int = 30,
) -> list[dict]:
    """
    Filter chips candidates through launchpad criteria.
    Each result dict extends the original candidate with:
      launchpad_score, launchpad_tech_signals, launchpad_chips_signals
    """
    results: list[dict] = []

    for cand in candidates:
        code  = cand["ticker"]
        chips = cand["chips"]
        tech  = tech_data.get(code, {})

        if not tech:
            continue

        raw_score, passes = launchpad_raw_score(tech, chips)
        if not passes or raw_score <= 0:
            log.debug(
                "%s: excluded (bias=%.1f%% gain10d=%.1f%% pos=%.1f%% score=%.2f)",
                code,
                abs(tech.get("bias_pct", 999)),
                tech.get("gain_10d", 999),
                tech.get("price_position_120d", 100),
                raw_score,
            )
            continue

        tech_sigs, chips_sigs = launchpad_tech_chips_signals(tech, chips)

        results.append({
            **cand,
            "launchpad_score":        raw_score,
            "launchpad_tech_signals": tech_sigs,
            "launchpad_chips_signals": chips_sigs,
        })

    results.sort(key=lambda x: x["launchpad_score"], reverse=True)
    log.info(
        "screen_launchpad_candidates: %d/%d passed → top %d",
        len(results), len(candidates), min(len(results), max_results),
    )
    return results[:max_results]

"""
籌碼面大戶訊號分析：從全市場掃描出法人即將做多的候選股。

評分邏輯（滿分 1.0）：
  投信連買 ≥5日       0.35   最可靠訊號：投信有法規約束，不能短進短出
  投信連買 3-4日      0.22
  投信連買 1-2日      0.08
  外資連買 ≥7日       0.25   規模大、方向性強
  外資連買 5-6日      0.18
  外資連買 3-4日      0.10
  外資連買 1-2日      0.04
  外資投信共振（同日買）0.20   兩大法人同時買超，最強確認訊號
  投信3日累計 ≥2000張  0.10   量能確認
  投信3日累計 ≥500張   0.05
  融資退場（散戶出清） 0.10   籌碼集中度指標
"""
from __future__ import annotations

import logging

log = logging.getLogger("calc_chips")

# 候選股篩選門檻
MIN_PRICE   = 10.0     # 排除雞蛋水餃股
MAX_PRICE   = 5000.0   # 避免過高股價失真
MIN_VOLUME  = 500      # 日均成交量 ≥ 500 張
MIN_CHIPS_SCORE = 0.18 # 至少有微弱訊號才列入候選

# 複合分數門檻
STRONG_THRESHOLD   = 0.68
MODERATE_THRESHOLD = 0.44


def _count_consecutive(history: list[dict], field: str) -> int:
    """Count consecutive days (newest-first) where field > 0."""
    count = 0
    for day in history:
        if day.get(field, 0) > 0:
            count += 1
        else:
            break
    return count


def calc_chips_score(history: list[dict], margin: dict) -> tuple[float, list[str]]:
    """
    Calculate chips score (0-1) and signal labels.
    history: list of daily institutional flows, newest-first.
    """
    if not history:
        return 0.0, []

    score = 0.0
    signals: list[str] = []

    trust_consec   = _count_consecutive(history, "trust_net")
    foreign_consec = _count_consecutive(history, "foreign_net")

    # ── 投信連買 (0.35 max) ────────────────────────────────────────────────
    if trust_consec >= 5:
        score += 0.35
        signals.append(f"投信連買{trust_consec}日")
    elif trust_consec >= 3:
        score += 0.22
        signals.append(f"投信連買{trust_consec}日")
    elif trust_consec >= 1:
        score += 0.08

    # ── 外資連買 (0.25 max) ────────────────────────────────────────────────
    if foreign_consec >= 7:
        score += 0.25
        signals.append(f"外資連買{foreign_consec}日")
    elif foreign_consec >= 5:
        score += 0.18
        signals.append(f"外資連買{foreign_consec}日")
    elif foreign_consec >= 3:
        score += 0.10
        signals.append(f"外資連買{foreign_consec}日")
    elif foreign_consec >= 1:
        score += 0.04

    # ── 外資投信共振 (0.20 max) ────────────────────────────────────────────
    today = history[0]
    if today.get("trust_net", 0) > 0 and today.get("foreign_net", 0) > 0:
        score += 0.20
        signals.append("外資投信共振")

    # ── 投信買超量能 (0.10 max) ────────────────────────────────────────────
    trust_3d = sum(d.get("trust_net", 0) for d in history[:3])
    if trust_3d >= 2000:
        score += 0.10
        signals.append(f"投信3日+{trust_3d:,}張")
    elif trust_3d >= 500:
        score += 0.05

    # ── 融資退場 (0.10 max) ────────────────────────────────────────────────
    if margin.get("margin_net", 0) < -200:
        score += 0.10
        signals.append("融資退場")

    return round(min(score, 1.0), 3), signals[:4]


def _is_valid_stock(code: str, price_data: dict) -> bool:
    """Return True if the stock passes basic liquidity/price filters."""
    if not (code.isdigit() and len(code) == 4):
        return False
    if code.startswith("0"):            # ETFs (0050, 006208, …)
        return False
    price = price_data.get("price", 0)
    if not (MIN_PRICE <= price <= MAX_PRICE):
        return False
    if price_data.get("volume", 0) < MIN_VOLUME:
        return False
    return True


def screen_candidates(
    prices:       dict[str, dict],
    inst_history: dict[str, list[dict]],
    margin_data:  dict[str, dict],
    max_candidates: int = 60,
) -> list[dict]:
    """
    Scan all TWSE stocks and return top candidates ranked by chips_score.
    Each candidate dict: {ticker, name_zh, price, volume, chips}.
    """
    candidates: list[dict] = []

    for code, price_data in prices.items():
        if not _is_valid_stock(code, price_data):
            continue

        history = inst_history.get(code, [])
        if not history:
            continue

        margin = margin_data.get(code, {})
        chips_score, chips_signals = calc_chips_score(history, margin)

        if chips_score < MIN_CHIPS_SCORE:
            continue

        trust_consec   = _count_consecutive(history, "trust_net")
        foreign_consec = _count_consecutive(history, "foreign_net")
        trust_buy_3d   = sum(d.get("trust_net",   0) for d in history[:3])
        foreign_buy_3d = sum(d.get("foreign_net", 0) for d in history[:3])

        candidates.append({
            "ticker":   code,
            "name_zh":  price_data.get("name_zh", code),
            "price":    price_data["price"],
            "volume":   price_data["volume"],
            "chips": {
                "trust_consec_buy":   trust_consec,
                "foreign_consec_buy": foreign_consec,
                "trust_buy_3d":       trust_buy_3d,
                "foreign_buy_3d":     foreign_buy_3d,
                "chips_score":        chips_score,
                "signals":            chips_signals,
            },
        })

    candidates.sort(key=lambda x: x["chips"]["chips_score"], reverse=True)
    log.info(
        "screen_candidates: %d passed from %d stocks → top %d",
        len(candidates), len(prices), min(len(candidates), max_candidates),
    )
    return candidates[:max_candidates]

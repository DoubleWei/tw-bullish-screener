"""
策略自動校準：根據回測結果調整評分權重，讓策略持續進化。

校準邏輯（每次 pipeline 跑完後執行）：
  1. 收集最近 N 個有 D+3 實際資料的快照
  2. 計算各分量（chips/tech/news）對「跑贏大盤」的判別力
     判別力 = mean(分量分數 | 贏家) - mean(分量分數 | 輸家)
     正值 → 該分量能區分贏家 → 應增加其權重
  3. 根據判別力方向，以固定步長調整權重（每次 ±STEP）
  4. 寫回 config/strategy_params.json 並記錄校準歷史

保護機制：
  - 每個權重限制在 [MIN_WEIGHT, MAX_WEIGHT]
  - 調整後重新正規化使總和為 1
  - 至少需要 MIN_SNAPS 個快照、MIN_STOCK_SAMPLES 個股票樣本才觸發
  - 每次只記錄、不自動放寬安全閥（max_bias_abs 等）
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

log = logging.getLogger("calibrate")
TPE = timezone(timedelta(hours=8))

MIN_WEIGHT       = 0.10
MAX_WEIGHT       = 0.70
STEP             = 0.05
MIN_SNAPS        = 3    # 最少有幾個快照有 D+3 資料才校準
MIN_STOCK_SAMPLES = 10  # 贏家 + 輸家至少各 N 才計算判別力
EVAL_KEY         = "d3"


def load_params(params_path: Path) -> dict:
    return json.loads(params_path.read_text(encoding="utf-8"))


def save_params(params: dict, params_path: Path) -> None:
    params_path.write_text(json.dumps(params, ensure_ascii=False, indent=2), encoding="utf-8")


def _discriminability(stocks: list[dict]) -> dict[str, float]:
    """
    分量判別力：各分量在「跑贏大盤的股票」vs「落後大盤的股票」之間的平均差距。
    回傳 {'chips': Δ, 'tech': Δ, 'news': Δ}，正值代表該分量對贏家更有預測力。
    """
    winners, losers = [], []
    for s in stocks:
        alpha = (s.get("alphas") or {}).get(EVAL_KEY)
        if alpha is None:
            continue
        (winners if alpha > 0 else losers).append(s)

    if len(winners) < MIN_STOCK_SAMPLES // 2 or len(losers) < MIN_STOCK_SAMPLES // 2:
        return {}

    def mean(lst: list[dict], key: str) -> float:
        vals = [x.get(key) for x in lst if x.get(key) is not None]
        return sum(vals) / len(vals) if vals else 0.0

    return {
        "chips": mean(winners, "chips_score") - mean(losers, "chips_score"),
        "tech":  mean(winners, "tech_score")  - mean(losers, "tech_score"),
        "news":  mean(winners, "news_score")  - mean(losers, "news_score"),
    }


def _adjust_weights(
    current: dict[str, float],
    disc: dict[str, float],
    weight_keys: list[str],
) -> tuple[dict[str, float], list[str]]:
    """
    按判別力方向以 STEP 調整對應權重，再正規化。
    回傳 (更新後的 params dict, 異動說明 list)。
    """
    new_w = dict(current)
    changes: list[str] = []

    for comp, delta in disc.items():
        wk = f"{comp}_weight"
        if wk not in new_w or abs(delta) < 0.02:
            continue
        direction = 1 if delta > 0 else -1
        old = new_w[wk]
        new = round(max(MIN_WEIGHT, min(MAX_WEIGHT, old + direction * STEP)), 3)
        if new != old:
            new_w[wk] = new
            changes.append(f"{wk}: {old:.3f} → {new:.3f}  (判別力={delta:+.4f})")

    # Normalise so weights sum to 1
    total = sum(new_w[k] for k in weight_keys if k in new_w)
    if total > 0:
        for k in weight_keys:
            if k in new_w:
                new_w[k] = round(new_w[k] / total, 3)

    return new_w, changes


def _snap_perf(snapshots: list[dict], strategy: str) -> dict:
    """Aggregate performance metrics across snapshots for history record."""
    alphas, beat_rates, avg_returns = [], [], []
    for r in snapshots:
        s = (r.get(strategy, {}).get("summary") or {}).get(EVAL_KEY) or {}
        if s.get("avg_alpha")  is not None: alphas.append(s["avg_alpha"])
        if s.get("beat_rate")  is not None: beat_rates.append(s["beat_rate"])
        if s.get("avg_return") is not None: avg_returns.append(s["avg_return"])
    avg = lambda lst: round(sum(lst) / len(lst), 4) if lst else None
    return {
        "snapshots":    len(snapshots),
        "avg_alpha":    avg(alphas),
        "avg_beat_rate": avg(beat_rates),
        "avg_return":   avg(avg_returns),
    }


def calibrate(backtest_results: list[dict], params_path: Path) -> dict:
    """
    根據回測結果更新 strategy_params.json。
    回傳 {'changed': bool, 'log': list[str], 'params': dict}。
    """
    params = load_params(params_path)
    change_log: list[str] = []

    # 只取有 D+3 資料的快照
    valid = [r for r in backtest_results if (r.get("momentum", {}).get("summary") or {}).get(EVAL_KEY)]
    log.info("Calibrate: %d/%d snapshots have %s data", len(valid), len(backtest_results), EVAL_KEY)

    if len(valid) < MIN_SNAPS:
        msg = f"資料不足（{len(valid)}/{MIN_SNAPS} 快照），跳過校準"
        log.info(msg)
        return {"changed": False, "log": [msg], "params": params}

    recent = valid[-5:]  # 最近 5 個快照

    # 記錄校準前的原始績效與判別力，供歷史紀錄使用
    weights_before = {
        "momentum": {k: params["momentum"][k] for k in ("chips_weight", "tech_weight", "news_weight")},
        "launchpad": {k: params["launchpad"][k] for k in ("raw_weight", "news_weight")},
    }
    disc_record: dict[str, dict] = {}

    # ── 作多動能校準 ──────────────────────────────────────────────────────────
    mom_stocks = [s for r in recent for s in r["momentum"]["stocks"]]
    mom_disc   = _discriminability(mom_stocks)
    log.info("Momentum discriminability: %s", mom_disc)
    if mom_disc:
        disc_record["momentum"] = {k: round(v, 4) for k, v in mom_disc.items()}

    if mom_disc:
        new_mom, mom_changes = _adjust_weights(
            params["momentum"], mom_disc,
            ["chips_weight", "tech_weight", "news_weight"],
        )
        if mom_changes:
            params["momentum"].update(new_mom)
            change_log.extend(f"[動能] {c}" for c in mom_changes)

    # ── 即將起漲校準（raw_weight vs news_weight）────────────────────────────
    lp_stocks = [s for r in recent for s in (r.get("launchpad") or {}).get("stocks", [])]
    if len(lp_stocks) >= MIN_STOCK_SAMPLES:
        lp_disc = _discriminability(lp_stocks)
        log.info("Launchpad discriminability: %s", lp_disc)
        if lp_disc:
            disc_record["launchpad"] = {k: round(v, 4) for k, v in lp_disc.items()}

        if lp_disc:
            proxy = {
                "chips": (lp_disc.get("chips", 0) + lp_disc.get("tech", 0)) / 2,
                "news":  lp_disc.get("news", 0),
            }
            lp_w_now = {
                "chips_weight": params["launchpad"]["raw_weight"],
                "news_weight":  params["launchpad"]["news_weight"],
            }
            new_lp, lp_changes = _adjust_weights(
                lp_w_now, proxy, ["chips_weight", "news_weight"],
            )
            if lp_changes:
                params["launchpad"]["raw_weight"]  = new_lp["chips_weight"]
                params["launchpad"]["news_weight"] = new_lp["news_weight"]
                change_log.extend(f"[起漲] {c.replace('chips_weight','raw_weight')}" for c in lp_changes)

    # ── 整體命中率警示 ────────────────────────────────────────────────────────
    beat_rates = [
        (r["momentum"]["summary"].get(EVAL_KEY) or {}).get("beat_rate")
        for r in valid[-3:]
    ]
    beat_rates = [b for b in beat_rates if b is not None]

    if len(beat_rates) >= 3:
        avg_beat = sum(beat_rates) / len(beat_rates)
        if avg_beat < 0.45:
            change_log.append(
                f"[警示] 近3次beat_rate平均={avg_beat:.1%}（<45%），策略整體偏弱，建議人工複查"
            )
        elif avg_beat >= 0.60:
            change_log.append(f"[良好] 近3次beat_rate平均={avg_beat:.1%}，策略表現穩健")

    # ── 寫回（含完整歷史紀錄）────────────────────────────────────────────────
    if change_log:
        now = datetime.now(TPE).isoformat()
        params["last_updated"] = now
        params["calibration_count"] = params.get("calibration_count", 0) + 1

        history_entry = {
            "at":              now,
            "snapshots_used":  len(recent),
            # 觸發校準的績效依據
            "performance": {
                "momentum":  _snap_perf(recent, "momentum"),
                "launchpad": _snap_perf(recent, "launchpad"),
            },
            # 各分量的判別力（正值 = 贏家比輸家分數高 → 應加重）
            "discriminability": disc_record,
            # 調整前後的權重對比
            "weights_before": weights_before,
            "weights_after": {
                "momentum": {k: params["momentum"][k] for k in ("chips_weight", "tech_weight", "news_weight")},
                "launchpad": {k: params["launchpad"][k] for k in ("raw_weight", "news_weight")},
            },
            # 人讀的摘要
            "changes": change_log,
        }

        history = params.setdefault("calibration_history", [])
        history.append(history_entry)
        params["calibration_history"] = history[-20:]  # 保留最近 20 次
        save_params(params, params_path)
        log.info("Calibration applied (%d changes): %s", len(change_log), change_log)
        return {"changed": True, "log": change_log, "params": params}

    log.info("Calibration: weights already optimal, no changes")
    return {"changed": False, "log": ["權重已最佳化，本次無調整"], "params": params}

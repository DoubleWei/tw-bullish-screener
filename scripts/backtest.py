"""
回測引擎：讀取 history/ 快照，對照實際股價，計算策略表現。

每次 pipeline 跑完後自動呼叫，結果寫入 public/data/backtest_results.json。

評估窗口：D+1、D+2、D+3（可設定 EVAL_DAYS）
評估指標：avg_return、avg_alpha（超額報酬）、hit_rate（上漲比例）、beat_rate（跑贏指數比例）
"""
from __future__ import annotations

import json
import logging
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path

log = logging.getLogger("backtest")
TPE = timezone(timedelta(hours=8))
EVAL_DAYS = 3


def _fetch_prices(tickers: list[str], start: str, end: str) -> dict[str, dict[str, float]]:
    """Return {date_str: {ticker_or_^TWII: close_price}}."""
    try:
        warnings.filterwarnings("ignore")
        import yfinance as yf

        tw_tickers = [t + ".TW" for t in tickers] + ["^TWII"]
        raw = yf.download(tw_tickers, start=start, end=end, auto_adjust=True, progress=False)
        if raw.empty:
            return {}

        close = raw["Close"]
        result: dict[str, dict[str, float]] = {}
        for date in close.index:
            date_str = date.strftime("%Y-%m-%d")
            row: dict[str, float] = {}
            for tw_tk in tw_tickers:
                key = "^TWII" if tw_tk == "^TWII" else tw_tk.replace(".TW", "")
                try:
                    val = float(close[tw_tk].loc[date])
                    if val == val and val > 0:  # not NaN, positive
                        row[key] = val
                except Exception:
                    pass
            result[date_str] = row
        return result
    except Exception as exc:
        log.warning("Price fetch failed: %s", exc)
        return {}


def _pct_change(prices: dict, ticker: str, base: str, to: str) -> float | None:
    p0 = prices.get(base, {}).get(ticker)
    p1 = prices.get(to, {}).get(ticker)
    if p0 and p1 and p0 > 0:
        return round((p1 - p0) / p0 * 100, 3)
    return None


def _eval_snapshot(
    snap: dict,
    prices: dict[str, dict[str, float]],
    trading_dates: list[str],
    base_date: str,
) -> dict | None:
    forward = [d for d in trading_dates if d > base_date]
    if not forward:
        return None

    d_map = {i + 1: forward[i] for i in range(min(EVAL_DAYS, len(forward)))}
    twii_ret = {f"d{i}": _pct_change(prices, "^TWII", base_date, d) for i, d in d_map.items()}

    def eval_stocks(recs: list[dict]) -> list[dict]:
        out = []
        for r in recs:
            tk = r["ticker"]
            chips = r.get("chips") or {}
            tech  = r.get("technical") or {}
            entry: dict = {
                "ticker":         tk,
                "rank":           r.get("rank"),
                "bullish_score":  r.get("bullish_score"),
                "signal_strength": r.get("signal_strength"),
                "chips_score":    chips.get("chips_score"),
                "tech_score":     tech.get("tech_score"),
                "news_score":     r.get("news_score"),
                "returns": {},
                "alphas":  {},
            }
            for i, d in d_map.items():
                ret  = _pct_change(prices, tk, base_date, d)
                twii = twii_ret.get(f"d{i}")
                entry["returns"][f"d{i}"] = ret
                entry["alphas"][f"d{i}"] = (
                    round(ret - twii, 3) if ret is not None and twii is not None else None
                )
            out.append(entry)
        return out

    def summary(stocks: list[dict]) -> dict:
        result = {}
        for key in [f"d{i}" for i in d_map]:
            rets   = [s["returns"][key] for s in stocks if s["returns"].get(key) is not None]
            alphas = [s["alphas"][key]  for s in stocks if s["alphas"].get(key)  is not None]
            if not rets:
                result[key] = None
                continue
            result[key] = {
                "n":          len(rets),
                "avg_return": round(sum(rets) / len(rets), 3),
                "avg_alpha":  round(sum(alphas) / len(alphas), 3) if alphas else None,
                "hit_rate":   round(sum(1 for v in rets if v > 0) / len(rets), 3),
                "beat_rate":  round(sum(1 for a in alphas if a > 0) / len(alphas), 3) if alphas else None,
                "twii":       twii_ret.get(key),
            }
        return result

    mom_stocks = eval_stocks(snap.get("recommendations", [])[:20])
    lp_stocks  = eval_stocks(snap.get("recommendations_launchpad", []))

    return {
        "generated_at":   snap.get("generated_at", ""),
        "schema_version": snap.get("schema_version", ""),
        "base_date":      base_date,
        "eval_dates":     {f"d{i}": d for i, d in d_map.items()},
        "twii_returns":   twii_ret,
        "momentum":  {"stocks": mom_stocks, "summary": summary(mom_stocks)},
        "launchpad": {"stocks": lp_stocks,  "summary": summary(lp_stocks)},
    }


def run_backtest(history_dir: Path, output_path: Path, n_recent: int = 15) -> list[dict]:
    """
    Backtest the N most-recent history snapshots.
    Writes results to output_path and returns the list (newest-first).
    """
    history_dir = Path(history_dir)
    files = sorted(history_dir.glob("*.json"), reverse=True)[:n_recent]
    if not files:
        log.warning("No history snapshots found in %s", history_dir)
        return []

    results: list[dict] = []
    # Batch-fetch prices across all snapshots to minimise API calls
    all_tickers: set[str] = set()
    snaps: list[tuple[Path, dict]] = []
    for f in files:
        try:
            snap = json.loads(f.read_text(encoding="utf-8"))
            snaps.append((f, snap))
            all_tickers.update(r["ticker"] for r in snap.get("recommendations", [])[:20])
            all_tickers.update(r["ticker"] for r in snap.get("recommendations_launchpad", []))
        except Exception as exc:
            log.warning("Skip %s: %s", f.name, exc)

    if not snaps:
        return []

    # Determine fetch window: earliest snapshot -3 days → today +1
    dates = [datetime.fromisoformat(s.get("generated_at", "")) for _, s in snaps if s.get("generated_at")]
    if not dates:
        return []
    start = (min(dates) - timedelta(days=5)).strftime("%Y-%m-%d")
    end   = (datetime.now(TPE) + timedelta(days=2)).strftime("%Y-%m-%d")

    log.info("Fetching prices for %d tickers (%s → %s)…", len(all_tickers), start, end)
    prices = _fetch_prices(list(all_tickers), start, end)
    trading_dates = sorted(prices.keys())

    if not trading_dates:
        log.warning("No price data returned")
        return []

    for f, snap in snaps:
        generated_at = snap.get("generated_at", "")
        if not generated_at:
            continue
        snap_date = datetime.fromisoformat(generated_at).strftime("%Y-%m-%d")
        base_candidates = [d for d in trading_dates if d <= snap_date]
        if not base_candidates:
            continue
        base_date = base_candidates[-1]

        ev = _eval_snapshot(snap, prices, trading_dates, base_date)
        if ev:
            ev["snapshot_file"] = f.name
            results.append(ev)
            d3 = ev["momentum"]["summary"].get("d3") or {}
            log.info(
                "  %s base=%s mom_alpha_d3=%s beat_rate=%s",
                f.name, base_date,
                d3.get("avg_alpha"), d3.get("beat_rate"),
            )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            {"last_run": datetime.now(TPE).isoformat(), "n_snapshots": len(results), "results": results},
            ensure_ascii=False, indent=2,
        ),
        encoding="utf-8",
    )
    log.info("Backtest done: %d snapshots → %s", len(results), output_path)
    return results

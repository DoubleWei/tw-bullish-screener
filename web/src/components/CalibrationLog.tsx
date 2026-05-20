import { History } from 'lucide-react'
import type { CalibrationData, CalibrationEntry, CalibrationWeights } from '../types/signals'
import { SectionTitle, EmptyState } from './MarketHeatmap'

const fmt = (v: number | null | undefined, suffix = '') =>
  v != null ? `${v > 0 ? '+' : ''}${v.toFixed(3)}${suffix}` : '—'

const pct = (v: number | null | undefined) =>
  v != null ? `${(v * 100).toFixed(1)}%` : '—'

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('zh-TW', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function WeightBar({ label, value, max = 0.7 }: { label: string; value?: number; max?: number }) {
  const v = value ?? 0
  const pctWidth = Math.round((v / max) * 100)
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-slate-400">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-800">
        <div
          className="h-1.5 rounded-full bg-rose-500/70 transition-all"
          style={{ width: `${pctWidth}%` }}
        />
      </div>
      <span className="w-10 text-right font-mono text-slate-300">{(v * 100).toFixed(1)}%</span>
    </div>
  )
}

function DiscBar({ label, value }: { label: string; value: number }) {
  const abs = Math.abs(value)
  const isPos = value >= 0
  const barPct = Math.min(100, Math.round(abs * 500))  // scale: 0.2 = 100%
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 shrink-0 text-slate-400">{label}</span>
      <div className="relative flex-1 h-1.5 rounded-full bg-slate-800">
        <div
          className={`h-1.5 rounded-full transition-all ${isPos ? 'bg-rose-400/80' : 'bg-emerald-400/80'}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <span className={`w-16 text-right font-mono text-[10px] ${isPos ? 'text-rose-300' : 'text-emerald-300'}`}>
        {value > 0 ? '+' : ''}{value.toFixed(4)}
      </span>
    </div>
  )
}

function WeightDiff({ before, after }: { before?: CalibrationWeights; after?: CalibrationWeights }) {
  const keys: { key: keyof CalibrationWeights; label: string }[] = [
    { key: 'chips_weight', label: '籌碼' },
    { key: 'tech_weight',  label: '技術' },
    { key: 'news_weight',  label: '新聞' },
    { key: 'raw_weight',   label: '起漲原始' },
  ]
  const rows = keys.filter(({ key }) => before?.[key] != null || after?.[key] != null)
  if (!rows.length) return null
  return (
    <div className="space-y-0.5">
      {rows.map(({ key, label }) => {
        const b = before?.[key] as number | undefined
        const a = after?.[key]  as number | undefined
        const changed = b != null && a != null && b !== a
        return (
          <div key={key} className="flex items-center gap-2 text-xs font-mono">
            <span className="w-16 text-slate-500">{label}</span>
            <span className={changed ? 'text-slate-400 line-through' : 'text-slate-400'}>
              {b != null ? `${(b * 100).toFixed(1)}%` : '—'}
            </span>
            {changed && (
              <>
                <span className="text-slate-600">→</span>
                <span className="text-rose-300">{`${((a as number) * 100).toFixed(1)}%`}</span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CalibrationCard({ entry }: { entry: CalibrationEntry }) {
  const mom  = entry.performance?.momentum
  const lp   = entry.performance?.launchpad
  const disc = entry.discriminability

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-semibold text-slate-200">{fmtDate(entry.at)}</span>
        <span className="text-[10px] text-slate-500">使用 {entry.snapshots_used} 個快照</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* 績效基準 */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">觸發績效（動能 D+3）</p>
          <div className="text-xs space-y-0.5">
            <div className="flex justify-between">
              <span className="text-slate-400">超額報酬</span>
              <span className={`font-mono ${(mom?.avg_alpha ?? 0) >= 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                {fmt(mom?.avg_alpha, '%')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">跑贏指數</span>
              <span className="font-mono text-slate-300">{pct(mom?.avg_beat_rate)}</span>
            </div>
          </div>
          {lp?.avg_alpha != null && (
            <div className="text-xs space-y-0.5 pt-1 border-t border-slate-800">
              <p className="text-[10px] text-slate-500">起漲策略</p>
              <div className="flex justify-between">
                <span className="text-slate-400">超額報酬</span>
                <span className={`font-mono ${(lp.avg_alpha ?? 0) >= 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                  {fmt(lp.avg_alpha, '%')}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 判別力 */}
        {disc?.momentum && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">分量判別力（動能）</p>
            <div className="space-y-1">
              <DiscBar label="籌碼" value={disc.momentum.chips} />
              <DiscBar label="技術" value={disc.momentum.tech} />
              <DiscBar label="新聞" value={disc.momentum.news} />
            </div>
            <p className="text-[9px] text-slate-600">紅=贏家分高→加重，綠=輸家分高→減重</p>
          </div>
        )}

        {/* 權重變化 */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">動能權重變化</p>
          <WeightDiff before={entry.weights_before?.momentum} after={entry.weights_after?.momentum} />
        </div>

        {entry.weights_before?.launchpad && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">起漲權重變化</p>
            <WeightDiff before={entry.weights_before.launchpad} after={entry.weights_after?.launchpad} />
          </div>
        )}
      </div>

      {/* Changes summary */}
      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-800/60">
        {entry.changes.map((c, i) => (
          <span
            key={i}
            className={`rounded px-2 py-0.5 text-[10px] ring-1 ${
              c.startsWith('[警示]') ? 'bg-amber-500/10 text-amber-300 ring-amber-500/20' :
              c.startsWith('[良好]') ? 'bg-rose-500/10 text-rose-300 ring-rose-500/20' :
              'bg-slate-700/50 text-slate-300 ring-slate-600/30'
            }`}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  )
}

export function CalibrationLog({ calibration }: { calibration?: CalibrationData }) {
  if (!calibration) {
    return (
      <section>
        <SectionTitle icon={<History className="h-4 w-4" />}>策略校準紀錄</SectionTitle>
        <EmptyState>尚未載入校準資料</EmptyState>
      </section>
    )
  }

  const { current_weights, calibration_count, last_updated, history } = calibration
  const sorted = [...history].reverse()

  return (
    <section className="space-y-6">
      <SectionTitle icon={<History className="h-4 w-4" />}>策略校準紀錄</SectionTitle>

      {/* Current weights */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            作多動能 · 目前權重
          </p>
          <div className="space-y-2">
            <WeightBar label="籌碼" value={current_weights.momentum?.chips_weight} />
            <WeightBar label="技術" value={current_weights.momentum?.tech_weight} />
            <WeightBar label="新聞" value={current_weights.momentum?.news_weight} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            即將起漲 · 目前權重
          </p>
          <div className="space-y-2">
            <WeightBar label="起漲分" value={current_weights.launchpad?.raw_weight} />
            <WeightBar label="新聞"   value={current_weights.launchpad?.news_weight} />
          </div>
          <div className="flex gap-4 text-[10px] text-slate-500 pt-1 border-t border-slate-800">
            <span>STRONG ≥ {((current_weights.launchpad?.strong_threshold ?? 0.5) * 100).toFixed(0)}%</span>
            <span>MODERATE ≥ {((current_weights.launchpad?.moderate_threshold ?? 0.3) * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span>累計校準次數：<span className="font-mono text-slate-300">{calibration_count}</span></span>
        {last_updated && (
          <span>上次校準：<span className="font-mono text-slate-300">{fmtDate(last_updated)}</span></span>
        )}
      </div>

      {/* History */}
      {sorted.length === 0 ? (
        <EmptyState>
          尚無校準紀錄——需累積 ≥3 個快照有 D+3 實際股價後，每次 pipeline 執行時自動校準
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {sorted.map((entry, i) => (
            <CalibrationCard key={i} entry={entry} />
          ))}
        </div>
      )}
    </section>
  )
}

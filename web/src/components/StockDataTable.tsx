import { useState, useMemo } from 'react'
import { BarChart2, ChevronUp, ChevronDown, SlidersHorizontal } from 'lucide-react'
import type { Recommendation, SignalStrength } from '../types/signals'
import { SectionTitle, EmptyState } from './MarketHeatmap'

const STRENGTH_STYLES: Record<SignalStrength, string> = {
  STRONG:   'bg-rose-500/20 text-rose-300 ring-rose-500/40',
  MODERATE: 'bg-rose-500/10 text-rose-400 ring-rose-500/25',
  WEAK:     'bg-slate-500/15 text-slate-400 ring-slate-500/25',
}
const STRENGTH_LABELS: Record<SignalStrength, string> = {
  STRONG: '強訊號', MODERATE: '中等', WEAK: '弱訊號',
}

type SortKey = 'bullish_score' | 'chips_score' | 'tech_score' | 'news_score' | 'price' | 'rsi' | 'vol_ratio'
type SortDir = 'desc' | 'asc'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'bullish_score', label: '綜合' },
  { key: 'chips_score',   label: '籌碼' },
  { key: 'tech_score',    label: '技術' },
  { key: 'news_score',    label: '新聞' },
  { key: 'price',         label: '股價' },
  { key: 'rsi',           label: 'RSI'  },
  { key: 'vol_ratio',     label: '量比' },
]

function getSortValue(r: Recommendation, key: SortKey): number {
  switch (key) {
    case 'bullish_score': return r.bullish_score
    case 'chips_score':   return r.chips?.chips_score    ?? -1
    case 'tech_score':    return r.technical?.tech_score ?? -1
    case 'news_score':    return r.news_score ?? 0
    case 'price':         return r.price ?? 0
    case 'rsi':           return r.technical?.rsi        ?? 0
    case 'vol_ratio':     return r.technical?.vol_ratio  ?? 0
  }
}

function rsiColor(rsi: number): string {
  if (rsi > 70) return 'text-amber-300'
  if (rsi >= 50) return 'text-rose-300'
  if (rsi >= 30) return 'text-slate-300'
  return 'text-emerald-300'
}

function ColHeader({
  sortKey, thisKey, sortDir, onSort, label, className = '',
}: {
  sortKey: SortKey; thisKey: SortKey; sortDir: SortDir
  onSort: (k: SortKey) => void; label: string; className?: string
}) {
  const active = sortKey === thisKey
  return (
    <th
      onClick={() => onSort(thisKey)}
      className={`px-3 py-2.5 text-right cursor-pointer select-none whitespace-nowrap transition-colors hover:text-slate-300 ${
        active ? 'text-slate-200' : 'text-slate-500'
      } ${className}`}
    >
      <span className="inline-flex items-center justify-end gap-0.5">
        {label}
        {active && (sortDir === 'desc'
          ? <ChevronDown className="h-3 w-3" />
          : <ChevronUp   className="h-3 w-3" />
        )}
      </span>
    </th>
  )
}

export function StockDataTable({ recommendations }: { recommendations: Recommendation[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('bullish_score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [activeStrengths, setActiveStrengths] = useState<Set<SignalStrength>>(
    new Set<SignalStrength>(['STRONG', 'MODERATE', 'WEAK'])
  )
  const [filterIndustry, setFilterIndustry] = useState('ALL')

  const industries = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of recommendations) {
      if (!seen.has(r.industry_code))
        seen.set(r.industry_code, r.industry_name_zh ?? r.industry_code)
    }
    return [...seen.entries()].map(([code, name]) => ({ code, name }))
  }, [recommendations])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const toggleStrength = (s: SignalStrength) => {
    setActiveStrengths(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next.size === 0 ? prev : next
    })
  }

  const processed = useMemo(() => {
    return recommendations
      .filter(r => activeStrengths.has(r.signal_strength))
      .filter(r => filterIndustry === 'ALL' || r.industry_code === filterIndustry)
      .slice()
      .sort((a, b) => {
        const va = getSortValue(a, sortKey)
        const vb = getSortValue(b, sortKey)
        return sortDir === 'desc' ? vb - va : va - vb
      })
  }, [recommendations, sortKey, sortDir, activeStrengths, filterIndustry])

  if (recommendations.length === 0) return (
    <section>
      <SectionTitle icon={<BarChart2 className="h-4 w-4" />}>股票數據</SectionTitle>
      <EmptyState>目前無股票數據</EmptyState>
    </section>
  )

  return (
    <section>
      <SectionTitle icon={<BarChart2 className="h-4 w-4" />}>股票數據</SectionTitle>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-slate-900/60 rounded-lg border border-slate-800 mb-3">
        <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />

        <div className="flex gap-1">
          {(['STRONG', 'MODERATE', 'WEAK'] as SignalStrength[]).map(s => (
            <button
              key={s}
              onClick={() => toggleStrength(s)}
              className={`rounded-full px-2 py-0.5 text-[11px] ring-1 transition-opacity ${
                activeStrengths.has(s) ? STRENGTH_STYLES[s] : 'text-slate-600 ring-slate-700 opacity-50'
              }`}
            >
              {STRENGTH_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-slate-700 flex-shrink-0 hidden sm:block" />

        <select
          value={filterIndustry}
          onChange={e => setFilterIndustry(e.target.value)}
          className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 ring-1 ring-slate-700 focus:outline-none"
        >
          <option value="ALL">全部產業</option>
          {industries.map(i => (
            <option key={i.code} value={i.code}>{i.name}</option>
          ))}
        </select>

        <div className="flex gap-1 ml-auto">
          <span className="text-[10px] text-slate-600 self-center hidden sm:inline">排序</span>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => handleSort(opt.key)}
              className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] ring-1 transition ${
                sortKey === opt.key
                  ? 'bg-slate-700 text-slate-200 ring-slate-500'
                  : 'text-slate-500 ring-slate-700 hover:text-slate-300'
              }`}
            >
              {opt.label}
              {sortKey === opt.key && (sortDir === 'desc'
                ? <ChevronDown className="h-3 w-3" />
                : <ChevronUp   className="h-3 w-3" />
              )}
            </button>
          ))}
        </div>

        {processed.length < recommendations.length && (
          <span className="text-[10px] text-slate-500">{processed.length}/{recommendations.length}</span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[760px] text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2.5 text-left w-8">#</th>
              <th className="px-3 py-2.5 text-left">代碼 / 名稱</th>
              <th className="px-3 py-2.5 text-left hidden md:table-cell">產業</th>
              <ColHeader sortKey={sortKey} thisKey="price"         sortDir={sortDir} onSort={handleSort} label="股價" />
              <ColHeader sortKey={sortKey} thisKey="bullish_score" sortDir={sortDir} onSort={handleSort} label="綜合" />
              <ColHeader sortKey={sortKey} thisKey="chips_score"   sortDir={sortDir} onSort={handleSort} label="籌碼" />
              <ColHeader sortKey={sortKey} thisKey="tech_score"    sortDir={sortDir} onSort={handleSort} label="技術" />
              <ColHeader sortKey={sortKey} thisKey="news_score"    sortDir={sortDir} onSort={handleSort} label="新聞" className="hidden sm:table-cell" />
              <ColHeader sortKey={sortKey} thisKey="rsi"           sortDir={sortDir} onSort={handleSort} label="RSI"  className="hidden sm:table-cell" />
              <ColHeader sortKey={sortKey} thisKey="vol_ratio"     sortDir={sortDir} onSort={handleSort} label="量比" className="hidden sm:table-cell" />
              <th className="px-3 py-2.5 text-center whitespace-nowrap text-slate-500">訊號強度</th>
              <th className="px-3 py-2.5 text-left hidden lg:table-cell text-slate-500">籌碼 / 技術訊號</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {processed.map((r, i) => {
              const tech  = r.technical
              const chips = r.chips
              const newsScore = r.news_score ?? r.bullish_score
              return (
                <tr key={r.ticker} className="hover:bg-slate-900/40 transition">
                  <td className="px-3 py-2.5 font-mono text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono font-semibold text-rose-300 flex-shrink-0">{r.ticker}</span>
                      <span className="text-slate-100">{r.name_zh}</span>
                    </div>
                    {r.reason_zh && (
                      <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-1 max-w-[200px]" title={r.reason_zh}>
                        {r.reason_zh}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 hidden md:table-cell whitespace-nowrap">
                    {r.industry_name_zh ?? r.industry_code}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                    {r.price != null
                      ? (r.price >= 100 ? r.price.toFixed(1) : r.price.toFixed(2))
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-300">
                    {r.bullish_score.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-rose-400">
                    {chips ? chips.chips_score.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-sky-400">
                    {tech ? tech.tech_score.toFixed(2) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-400 hidden sm:table-cell">
                    {newsScore.toFixed(2)}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono hidden sm:table-cell ${tech ? rsiColor(tech.rsi) : 'text-slate-500'}`}>
                    {tech ? tech.rsi.toFixed(1) : '—'}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono hidden sm:table-cell ${tech && tech.vol_ratio >= 1.5 ? 'text-amber-300' : 'text-slate-300'}`}>
                    {tech ? `${tech.vol_ratio.toFixed(1)}×` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ring-1 whitespace-nowrap ${STRENGTH_STYLES[r.signal_strength]}`}>
                      {STRENGTH_LABELS[r.signal_strength]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {chips?.signals.map(sig => (
                        <span key={sig} className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-400 ring-1 ring-rose-500/20">
                          {sig}
                        </span>
                      ))}
                      {tech?.signals.map(sig => (
                        <span key={sig} className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300 ring-1 ring-sky-500/20">
                          {sig}
                        </span>
                      ))}
                      {!chips?.signals.length && !tech?.signals.length && (
                        <span className="text-slate-600">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

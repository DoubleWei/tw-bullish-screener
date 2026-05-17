import { useState, useMemo } from 'react'
import { TrendingUp, Star, ChevronUp, ChevronDown, SlidersHorizontal } from 'lucide-react'
import type { Recommendation, SignalStrength, TechnicalData, ChipsData } from '../types/signals'
import { SectionTitle, EmptyState } from './MarketHeatmap'

// ── Styles ──────────────────────────────────────────────────────────────────

const STRENGTH_STYLES: Record<SignalStrength, string> = {
  STRONG:   'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40',
  MODERATE: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25',
  WEAK:     'bg-slate-500/15 text-slate-400 ring-slate-500/25',
}
const STRENGTH_LABELS: Record<SignalStrength, string> = {
  STRONG: '強訊號', MODERATE: '中等', WEAK: '弱訊號',
}

// ── Sort / filter types ──────────────────────────────────────────────────────

type SortKey = 'bullish_score' | 'chips_score' | 'tech_score' | 'news_score' | 'price'
type SortDir = 'desc' | 'asc'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'bullish_score', label: '綜合' },
  { key: 'chips_score',   label: '籌碼' },
  { key: 'tech_score',    label: '技術' },
  { key: 'news_score',    label: '新聞' },
  { key: 'price',         label: '股價' },
]

function getSortValue(r: Recommendation, key: SortKey): number {
  switch (key) {
    case 'bullish_score': return r.bullish_score
    case 'chips_score':   return r.chips?.chips_score ?? -1
    case 'tech_score':    return r.technical?.tech_score ?? -1
    case 'news_score':    return r.news_score ?? 0
    case 'price':         return r.price ?? 0
  }
}

// ── Badge components ─────────────────────────────────────────────────────────

function rsiColor(rsi: number): string {
  if (rsi > 70) return 'text-amber-300 bg-amber-500/10 ring-amber-500/20'
  if (rsi >= 50) return 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/20'
  if (rsi >= 30) return 'text-slate-400 bg-slate-700/40 ring-slate-600/20'
  return 'text-rose-300 bg-rose-500/10 ring-rose-500/20'
}

function ChipsBadges({ chips }: { chips: ChipsData }) {
  return (
    <>
      {chips.signals.map((sig) => (
        <span key={sig} className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400 ring-1 ring-emerald-500/20">
          {sig}
        </span>
      ))}
    </>
  )
}

function TechBadges({ tech }: { tech: TechnicalData }) {
  const rsiAlreadyShown = tech.signals.some((s) => s.includes('RSI'))
  const volAlreadyShown = tech.signals.some((s) => s.includes('量'))
  return (
    <>
      {tech.signals.map((sig) => (
        <span key={sig} className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300 ring-1 ring-sky-500/20">
          {sig}
        </span>
      ))}
      {!rsiAlreadyShown && (
        <span className={`rounded px-1.5 py-0.5 text-[10px] ring-1 ${rsiColor(tech.rsi)}`}>
          RSI {tech.rsi}
        </span>
      )}
      {!volAlreadyShown && tech.vol_ratio >= 1.3 && (
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300 ring-1 ring-amber-500/20">
          Vol {tech.vol_ratio.toFixed(1)}×
        </span>
      )}
    </>
  )
}

// ── Filter bar ───────────────────────────────────────────────────────────────

interface FilterBarProps {
  allStrengths: SignalStrength[]
  activeStrengths: Set<SignalStrength>
  onToggleStrength: (s: SignalStrength) => void
  industries: { code: string; name: string }[]
  filterIndustry: string
  onFilterIndustry: (c: string) => void
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  total: number
  filtered: number
}

function FilterBar({
  allStrengths, activeStrengths, onToggleStrength,
  industries, filterIndustry, onFilterIndustry,
  sortKey, sortDir, onSort,
  total, filtered,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-slate-900/60 rounded-lg border border-slate-800 mb-3">
      <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />

      {/* Signal strength toggles */}
      <div className="flex gap-1">
        {allStrengths.map((s) => (
          <button
            key={s}
            onClick={() => onToggleStrength(s)}
            className={`rounded-full px-2 py-0.5 text-[11px] ring-1 transition-opacity ${
              activeStrengths.has(s) ? STRENGTH_STYLES[s] : 'text-slate-600 ring-slate-700 opacity-50'
            }`}
          >
            {STRENGTH_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-slate-700 flex-shrink-0 hidden sm:block" />

      {/* Industry dropdown */}
      <select
        value={filterIndustry}
        onChange={(e) => onFilterIndustry(e.target.value)}
        className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 ring-1 ring-slate-700 focus:outline-none"
      >
        <option value="ALL">全部產業</option>
        {industries.map((i) => (
          <option key={i.code} value={i.code}>{i.name}</option>
        ))}
      </select>

      {/* Sort buttons */}
      <div className="flex gap-1 ml-auto">
        <span className="text-[10px] text-slate-600 self-center hidden sm:inline">排序</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onSort(opt.key)}
            className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] ring-1 transition ${
              sortKey === opt.key
                ? 'bg-slate-700 text-slate-200 ring-slate-500'
                : 'text-slate-500 ring-slate-700 hover:text-slate-300'
            }`}
          >
            {opt.label}
            {sortKey === opt.key && (
              sortDir === 'desc'
                ? <ChevronDown className="h-3 w-3" />
                : <ChevronUp className="h-3 w-3" />
            )}
          </button>
        ))}
      </div>

      {/* Count */}
      {filtered < total && (
        <span className="text-[10px] text-slate-500 ml-1">{filtered}/{total}</span>
      )}
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────

function RecommendationRow({ rec: r, rank }: { rec: Recommendation; rank: number }) {
  const tech = r.technical
  const chips = r.chips
  const newsScore = r.news_score ?? r.bullish_score

  return (
    <div className="px-3 py-3 transition hover:bg-slate-900/40">
      {/* Line 1 */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-5 flex-shrink-0 text-center">
          {rank <= 3
            ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            : <span className="font-mono text-xs text-slate-500">{rank}</span>}
        </div>

        <div className="flex-1 flex items-baseline gap-1.5 min-w-0 overflow-hidden">
          <span className="font-mono text-sm font-semibold text-emerald-300 flex-shrink-0">{r.ticker}</span>
          {r.price != null && (
            <span className="font-mono text-xs text-slate-400 flex-shrink-0">{r.price >= 100 ? r.price.toFixed(1) : r.price.toFixed(2)}</span>
          )}
          <span className="text-sm text-slate-100 flex-shrink-0">{r.name_zh}</span>
          <span className="hidden sm:block text-xs text-slate-500 truncate">{r.industry_name_zh ?? r.industry_code}</span>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden md:flex items-center gap-3">
            {chips && (
              <div className="text-right">
                <div className="text-[9px] uppercase text-slate-500">籌碼</div>
                <div className="font-mono text-xs text-emerald-400">{chips.chips_score.toFixed(2)}</div>
              </div>
            )}
            {!chips && (
              <div className="text-right">
                <div className="text-[9px] uppercase text-slate-500">新聞</div>
                <div className="font-mono text-xs text-slate-400">{newsScore.toFixed(2)}</div>
              </div>
            )}
            {tech && (
              <div className="text-right">
                <div className="text-[9px] uppercase text-slate-500">技術</div>
                <div className="font-mono text-xs text-sky-400">{tech.tech_score.toFixed(2)}</div>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[9px] uppercase text-slate-500">綜合</div>
            <div className="font-mono text-sm font-bold text-emerald-300">{r.bullish_score.toFixed(2)}</div>
          </div>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ring-1 ${STRENGTH_STYLES[r.signal_strength]}`}>
            {STRENGTH_LABELS[r.signal_strength]}
          </span>
        </div>
      </div>

      {/* Line 2 */}
      <div className="mt-1.5 ml-7 flex flex-wrap items-center gap-1.5 min-w-0">
        {chips && <ChipsBadges chips={chips} />}
        {tech && <TechBadges tech={tech} />}
        {r.reason_zh && (
          <span className="text-[11px] text-slate-500 truncate max-w-[260px]" title={r.reason_zh}>
            {(chips || tech) && '· '}
            {r.reason_zh}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

export function RecommendationTable({ recommendations }: { recommendations: Recommendation[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('bullish_score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [activeStrengths, setActiveStrengths] = useState<Set<SignalStrength>>(
    new Set<SignalStrength>(['STRONG', 'MODERATE', 'WEAK'])
  )
  const [filterIndustry, setFilterIndustry] = useState<string>('ALL')

  const industries = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of recommendations) {
      if (!seen.has(r.industry_code)) {
        seen.set(r.industry_code, r.industry_name_zh ?? r.industry_code)
      }
    }
    return [...seen.entries()].map(([code, name]) => ({ code, name }))
  }, [recommendations])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const toggleStrength = (s: SignalStrength) => {
    setActiveStrengths((prev) => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next.size === 0 ? prev : next  // keep at least one active
    })
  }

  const processed = useMemo(() => {
    return recommendations
      .filter((r) => activeStrengths.has(r.signal_strength))
      .filter((r) => filterIndustry === 'ALL' || r.industry_code === filterIndustry)
      .slice()
      .sort((a, b) => {
        const va = getSortValue(a, sortKey)
        const vb = getSortValue(b, sortKey)
        return sortDir === 'desc' ? vb - va : va - vb
      })
  }, [recommendations, sortKey, sortDir, activeStrengths, filterIndustry])

  if (recommendations.length === 0) return (
    <section>
      <SectionTitle icon={<TrendingUp className="h-4 w-4" />}>作多推薦清單</SectionTitle>
      <EmptyState>目前沒有偵測到強烈作多訊號</EmptyState>
    </section>
  )

  return (
    <section>
      <SectionTitle icon={<TrendingUp className="h-4 w-4" />}>作多推薦清單</SectionTitle>
      <FilterBar
        allStrengths={['STRONG', 'MODERATE', 'WEAK']}
        activeStrengths={activeStrengths}
        onToggleStrength={toggleStrength}
        industries={industries}
        filterIndustry={filterIndustry}
        onFilterIndustry={setFilterIndustry}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        total={recommendations.length}
        filtered={processed.length}
      />
      {processed.length === 0 ? (
        <EmptyState>目前篩選條件下無符合股票</EmptyState>
      ) : (
        <div className="overflow-y-auto rounded-lg border border-slate-800 divide-y divide-slate-800 max-h-[70vh]">
          {processed.map((r, i) => (
            <RecommendationRow key={r.ticker} rec={r} rank={i + 1} />
          ))}
        </div>
      )}
    </section>
  )
}

import { useState, useMemo } from 'react'
import { TrendingUp, Rocket, Star, ChevronUp, ChevronDown, SlidersHorizontal, BarChart2 } from 'lucide-react'
import type { Recommendation, SignalStrength, TechnicalData, ChipsData } from '../types/signals'
import { SectionTitle, EmptyState } from './MarketHeatmap'
import { StockChart } from './StockChart'

// ── Styles ──────────────────────────────────────────────────────────────────

const STRENGTH_STYLES: Record<SignalStrength, string> = {
  STRONG:   'bg-rose-500/20 text-rose-300 ring-rose-500/40',
  MODERATE: 'bg-rose-500/10 text-rose-400 ring-rose-500/25',
  WEAK:     'bg-slate-500/15 text-slate-400 ring-slate-500/25',
}
const STRENGTH_LABELS: Record<SignalStrength, string> = {
  STRONG: '強訊號', MODERATE: '中等', WEAK: '弱訊號',
}

// ── Strategy selector ────────────────────────────────────────────────────────

type Strategy = 'momentum' | 'launchpad'

const STRATEGIES: { id: Strategy; label: string; desc: string }[] = [
  { id: 'momentum',  label: '作多動能', desc: '法人持續買超、技術面強勢的動能股' },
  { id: 'launchpad', label: '即將起漲', desc: '剛打底、尚未過熱、初次法人進場的起漲點' },
]

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
  if (rsi >= 50) return 'text-rose-300 bg-rose-500/10 ring-rose-500/20'
  if (rsi >= 30) return 'text-slate-400 bg-slate-700/40 ring-slate-600/20'
  return 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/20'
}

function ChipsBadges({ chips }: { chips: ChipsData }) {
  return (
    <>
      {chips.signals.map((sig) => (
        <span key={sig} className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-400 ring-1 ring-rose-500/20">
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

// ── Launchpad extra info row ─────────────────────────────────────────────────

function LaunchpadMetaBadges({ tech }: { tech: TechnicalData }) {
  const badges: { label: string; cls: string }[] = []

  if (tech.bias_pct != null) {
    const v = tech.bias_pct
    const cls = Math.abs(v) <= 3
      ? 'text-rose-400 bg-rose-500/10 ring-rose-500/20'
      : 'text-amber-300 bg-amber-500/10 ring-amber-500/20'
    badges.push({ label: `乖離 ${v > 0 ? '+' : ''}${v.toFixed(1)}%`, cls })
  }
  if (tech.price_position_120d != null) {
    const v = tech.price_position_120d
    const cls = v <= 40
      ? 'text-rose-400 bg-rose-500/10 ring-rose-500/20'
      : v <= 60
      ? 'text-slate-300 bg-slate-700/40 ring-slate-600/20'
      : 'text-amber-300 bg-amber-500/10 ring-amber-500/20'
    badges.push({ label: `半年位階 ${v.toFixed(0)}%`, cls })
  }
  if (tech.gain_10d != null && Math.abs(tech.gain_10d) >= 1) {
    const v = tech.gain_10d
    const cls = v > 0 ? 'text-rose-400 bg-rose-500/10 ring-rose-500/20' : 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/20'
    badges.push({ label: `10日 ${v > 0 ? '+' : ''}${v.toFixed(1)}%`, cls })
  }

  return (
    <>
      {badges.map(b => (
        <span key={b.label} className={`rounded px-1.5 py-0.5 text-[10px] ring-1 ${b.cls}`}>
          {b.label}
        </span>
      ))}
    </>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────

function RecommendationRow({
  rec: r, rank, showLaunchpadMeta,
}: { rec: Recommendation; rank: number; showLaunchpadMeta: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const tech = r.technical
  const chips = r.chips
  const newsScore = r.news_score ?? r.bullish_score

  return (
    <div className="px-3 py-3 transition hover:bg-slate-900/40">
      {/* Line 1 — clickable to expand chart */}
      <div className="flex items-center gap-2 min-w-0 cursor-pointer select-none" onClick={() => setExpanded(v => !v)}>
        <div className="w-5 flex-shrink-0 text-center">
          {rank <= 3
            ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            : <span className="font-mono text-xs text-slate-500">{rank}</span>}
        </div>

        <div className="flex-1 flex items-baseline gap-1.5 min-w-0 overflow-hidden">
          <span className="font-mono text-sm font-semibold text-rose-300 flex-shrink-0">{r.ticker}</span>
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
                <div className="font-mono text-xs text-rose-400">{chips.chips_score.toFixed(2)}</div>
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
            <div className="font-mono text-sm font-bold text-rose-300">{r.bullish_score.toFixed(2)}</div>
          </div>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ring-1 ${STRENGTH_STYLES[r.signal_strength]}`}>
            {STRENGTH_LABELS[r.signal_strength]}
          </span>
          <BarChart2 className={`h-3.5 w-3.5 flex-shrink-0 transition-colors ${expanded ? 'text-rose-400' : 'text-slate-700 hover:text-slate-500'}`} />
        </div>
      </div>

      {/* Line 2 — signals + optional launchpad meta */}
      <div className="mt-1.5 ml-7 flex flex-wrap items-center gap-1.5 min-w-0">
        {chips && <ChipsBadges chips={chips} />}
        {tech && <TechBadges tech={tech} />}
        {showLaunchpadMeta && tech && <LaunchpadMetaBadges tech={tech} />}
        {r.reason_zh && (
          <span className="text-[11px] text-slate-500 truncate max-w-[260px]" title={r.reason_zh}>
            {(chips || tech) && '· '}
            {r.reason_zh}
          </span>
        )}
      </div>

      {/* Expanded chart panel */}
      {expanded && (
        <div className="mt-2 ml-5 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5">
          <StockChart ticker={r.ticker} name_zh={r.name_zh} />
        </div>
      )}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

export function RecommendationTable({
  recommendations,
  recommendationsLaunchpad,
}: {
  recommendations: Recommendation[]
  recommendationsLaunchpad?: Recommendation[]
}) {
  const [strategy, setStrategy] = useState<Strategy>('momentum')
  const [sortKey, setSortKey] = useState<SortKey>('bullish_score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [activeStrengths, setActiveStrengths] = useState<Set<SignalStrength>>(
    new Set<SignalStrength>(['STRONG', 'MODERATE', 'WEAK'])
  )
  const [filterIndustry, setFilterIndustry] = useState<string>('ALL')

  const source = strategy === 'launchpad' && recommendationsLaunchpad
    ? recommendationsLaunchpad
    : recommendations

  const hasLaunchpad = (recommendationsLaunchpad?.length ?? 0) > 0

  const industries = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of source) {
      if (!seen.has(r.industry_code)) {
        seen.set(r.industry_code, r.industry_name_zh ?? r.industry_code)
      }
    }
    return [...seen.entries()].map(([code, name]) => ({ code, name }))
  }, [source])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const toggleStrength = (s: SignalStrength) => {
    setActiveStrengths((prev) => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next.size === 0 ? prev : next
    })
  }

  const handleStrategyChange = (s: Strategy) => {
    setStrategy(s)
    setSortKey('bullish_score')
    setSortDir('desc')
    setFilterIndustry('ALL')
    setActiveStrengths(new Set(['STRONG', 'MODERATE', 'WEAK']))
  }

  const processed = useMemo(() => {
    return source
      .filter((r) => activeStrengths.has(r.signal_strength))
      .filter((r) => filterIndustry === 'ALL' || r.industry_code === filterIndustry)
      .slice()
      .sort((a, b) => {
        const va = getSortValue(a, sortKey)
        const vb = getSortValue(b, sortKey)
        return sortDir === 'desc' ? vb - va : va - vb
      })
  }, [source, sortKey, sortDir, activeStrengths, filterIndustry])

  const currentStrategy = STRATEGIES.find(s => s.id === strategy)!
  const isLaunchpad = strategy === 'launchpad'
  const titleIcon = isLaunchpad
    ? <Rocket className="h-4 w-4" />
    : <TrendingUp className="h-4 w-4" />

  const isEmpty = source.length === 0

  return (
    <section>
      {/* Section header with strategy selector */}
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
          {titleIcon}
          {isLaunchpad ? '即將起漲' : '作多推薦清單'}
        </h2>
        {/* Strategy selector pills — always clickable */}
        <div className="flex gap-1 rounded-lg bg-slate-900/60 p-1 ring-1 ring-slate-800">
          {STRATEGIES.map(s => (
            <button
              key={s.id}
              onClick={() => handleStrategyChange(s.id)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                strategy === s.id
                  ? 'bg-slate-700 text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {s.id === 'launchpad' ? <Rocket className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
              {s.label}
              {s.id === 'launchpad' && (
                <span className={`rounded-full px-1.5 text-[10px] ${
                  strategy === 'launchpad' ? 'bg-slate-600 text-slate-300' : 'bg-slate-800 text-slate-500'
                }`}>
                  {recommendationsLaunchpad?.length ?? 0}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Strategy detail card */}
      {isLaunchpad ? (
        <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs space-y-2">
          <p className="text-slate-300 font-medium">找尋「剛打底、尚未過熱」的起漲點，而非已漲多準備崩跌的末升段</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            <div>
              <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1.5">安全閥</span>
              <span className="text-rose-300/80">乖離月線 ≤8%</span>
              <span className="text-slate-600 mx-1">·</span>
              <span className="text-rose-300/80">10日漲幅 ≤20%</span>
              <span className="text-slate-600 mx-1">·</span>
              <span className="text-rose-300/80">半年位階 ≤65%</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1.5">關鍵訊號</span>
              <span className="text-sky-300/80">均線糾結突破</span>
              <span className="text-slate-600 mx-1">·</span>
              <span className="text-sky-300/80">黃金交叉</span>
              <span className="text-slate-600 mx-1">·</span>
              <span className="text-sky-300/80">MACD轉正</span>
              <span className="text-slate-600 mx-1">·</span>
              <span className="text-rose-300/80">法人初次登場</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1.5">評分公式</span>
              <span className="text-slate-400 font-mono">起漲分×70% + 新聞×30%</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs space-y-2">
          <p className="text-slate-300 font-medium">法人持續布局、技術面處於強勢多頭格局的動能股</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            <div>
              <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1.5">關鍵訊號</span>
              <span className="text-rose-300/80">投信/外資連買</span>
              <span className="text-slate-600 mx-1">·</span>
              <span className="text-rose-300/80">共振買超</span>
              <span className="text-slate-600 mx-1">·</span>
              <span className="text-sky-300/80">多頭排列</span>
              <span className="text-slate-600 mx-1">·</span>
              <span className="text-sky-300/80">爆量突破</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1.5">評分公式</span>
              <span className="text-slate-400 font-mono">籌碼×40% + 技術×30% + 新聞×30%</span>
            </div>
          </div>
        </div>
      )}

      {isEmpty ? (
        <EmptyState>
          {isLaunchpad
            ? '目前無符合起漲條件的股票（需籌碼候選 + 技術面剛發動）'
            : '目前沒有偵測到強烈作多訊號'}
        </EmptyState>
      ) : (
        <>
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
            total={source.length}
            filtered={processed.length}
          />
          {processed.length === 0 ? (
            <EmptyState>目前篩選條件下無符合股票</EmptyState>
          ) : (
            <div className="overflow-y-auto rounded-lg border border-slate-800 divide-y divide-slate-800 max-h-[70vh]">
              {processed.map((r, i) => (
                <RecommendationRow
                  key={r.ticker}
                  rec={r}
                  rank={i + 1}
                  showLaunchpadMeta={isLaunchpad}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

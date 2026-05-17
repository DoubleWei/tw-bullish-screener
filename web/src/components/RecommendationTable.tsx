import { TrendingUp, Star } from 'lucide-react'
import type { Recommendation, SignalStrength, TechnicalData, ChipsData } from '../types/signals'
import { SectionTitle, EmptyState } from './MarketHeatmap'

const STRENGTH_STYLES: Record<SignalStrength, string> = {
  STRONG:   'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40',
  MODERATE: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25',
  WEAK:     'bg-slate-500/15 text-slate-400 ring-slate-500/25',
}

const STRENGTH_LABELS: Record<SignalStrength, string> = {
  STRONG: '強訊號', MODERATE: '中等', WEAK: '弱訊號',
}

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
        <span
          key={sig}
          className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400 ring-1 ring-emerald-500/20"
        >
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
        <span
          key={sig}
          className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-300 ring-1 ring-sky-500/20"
        >
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

function RecommendationRow({ rec: r }: { rec: Recommendation }) {
  const tech = r.technical
  const chips = r.chips
  const newsScore = r.news_score ?? r.bullish_score

  return (
    <div className="px-3 py-3 transition hover:bg-slate-900/40">
      {/* Line 1: rank · ticker · price · name · industry · scores · strength */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-5 flex-shrink-0 text-center">
          {r.rank <= 3
            ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            : <span className="font-mono text-xs text-slate-500">{r.rank}</span>}
        </div>

        <div className="flex-1 flex items-baseline gap-1.5 min-w-0 overflow-hidden">
          <span className="font-mono text-sm font-semibold text-emerald-300 flex-shrink-0">{r.ticker}</span>
          {r.price != null && (
            <span className="font-mono text-xs text-slate-400 flex-shrink-0">{r.price.toFixed(r.price >= 100 ? 1 : 2)}</span>
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

      {/* Line 2: chips badges (green) + tech badges (blue) + AI reason */}
      <div className="mt-1.5 ml-7 flex flex-wrap items-center gap-1.5 min-w-0">
        {chips && <ChipsBadges chips={chips} />}
        {tech && <TechBadges tech={tech} />}
        {r.reason_zh && (
          <span
            className="text-[11px] text-slate-500 truncate max-w-[260px]"
            title={r.reason_zh}
          >
            {(chips || tech) && '· '}
            {r.reason_zh}
          </span>
        )}
      </div>
    </div>
  )
}

export function RecommendationTable({ recommendations }: { recommendations: Recommendation[] }) {
  return (
    <section>
      <SectionTitle icon={<TrendingUp className="h-4 w-4" />}>作多推薦清單</SectionTitle>
      {recommendations.length === 0 ? (
        <EmptyState>目前沒有偵測到強烈作多訊號</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800 divide-y divide-slate-800">
          {recommendations.map((r) => (
            <RecommendationRow key={r.ticker} rec={r} />
          ))}
        </div>
      )}
    </section>
  )
}

import type { ReactNode } from 'react'
import { Flame } from 'lucide-react'
import type { Industry } from '../types/signals'
import { fmtScore } from '../lib/format'

export function MarketHeatmap({ industries }: { industries: Industry[] }) {
  const sorted = [...industries].sort((a, b) => b.sentiment_score - a.sentiment_score)

  return (
    <section>
      <SectionTitle icon={<Flame className="h-4 w-4" />}>產業熱力圖</SectionTitle>
      {sorted.length === 0 ? (
        <EmptyState>本期分析新聞未影響任何已追蹤產業</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((ind) => <Tile key={ind.industry_code} industry={ind} />)}
        </div>
      )}
    </section>
  )
}

function Tile({ industry }: { industry: Industry }) {
  const { sentiment_score: s, signal } = industry
  const alpha = 0.12 + Math.min(Math.abs(s), 1) * 0.5

  const bg =
    signal === 'BULLISH' ? `rgba(244, 63, 94, ${alpha})`
    : signal === 'BEARISH' ? `rgba(16, 185, 129, ${alpha})`
    : 'rgba(100, 116, 139, 0.12)'
  const ring =
    signal === 'BULLISH' ? 'ring-rose-500/40'
    : signal === 'BEARISH' ? 'ring-emerald-500/40'
    : 'ring-slate-700/60'
  const scoreColor =
    signal === 'BULLISH' ? 'text-rose-300'
    : signal === 'BEARISH' ? 'text-emerald-300'
    : 'text-slate-400'

  return (
    <div
      className={`rounded-lg p-4 ring-1 transition hover:scale-[1.02] ${ring}`}
      style={{ background: bg }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-slate-100">{industry.industry_name_zh}</span>
        <span className={`font-mono text-sm ${scoreColor}`}>{fmtScore(s)}</span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs text-slate-400">
        {industry.summary_zh || '—'}
      </p>
      <div className="mt-2 text-[10px] text-slate-500">{industry.news_count} 則新聞</div>
    </div>
  )
}

export function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
      {icon}{children}
    </h2>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}

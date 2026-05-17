import type { SentimentLabel } from '../types/signals'
import { fmtScore } from '../lib/format'

const STYLES: Record<SentimentLabel, string> = {
  BULLISH: 'bg-rose-500/15 text-rose-400 ring-rose-500/30',
  NEUTRAL: 'bg-slate-500/15 text-slate-400 ring-slate-500/30',
  BEARISH: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30',
}

const LABELS: Record<SentimentLabel, string> = {
  BULLISH: '利多', NEUTRAL: '中性', BEARISH: '利空',
}

export function SentimentBadge({ label, score }: { label: SentimentLabel; score?: number }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STYLES[label]}`}>
      {LABELS[label]}
      {score !== undefined && <span className="font-mono opacity-80">{fmtScore(score)}</span>}
    </span>
  )
}

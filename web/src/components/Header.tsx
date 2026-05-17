import { Activity, RefreshCw } from 'lucide-react'
import type { SignalsPayload } from '../types/signals'
import { formatTime, relativeTime, fmtScore } from '../lib/format'

export function Header({ data }: { data: SignalsPayload }) {
  const { market_sentiment: ms, generated_at, meta } = data
  const labelClass =
    ms.label === '偏多' ? 'text-emerald-400'
    : ms.label === '偏空' ? 'text-rose-400'
    : 'text-slate-300'
  const totalInds = ms.bullish_industries + ms.neutral_industries + ms.bearish_industries

  return (
    <header className="border-b border-slate-800 bg-slate-950/85 backdrop-blur">
      <div className="mx-auto max-w-7xl px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
              <Activity className="h-3.5 w-3.5" />
              <span>Taiwan Bullish Signal Screener</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold">
              <span className="text-slate-100">台股作多潛力股</span>
              <span className={`ml-2 ${labelClass}`}>· {ms.label}</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-end gap-4 sm:gap-6 text-xs">
            <Stat label="整體情緒" value={fmtScore(ms.overall_score)} valueClass={`font-mono ${labelClass}`} />
            <Stat label="利多 / 全部" value={`${ms.bullish_industries} / ${totalInds}`} valueClass="font-mono text-emerald-300" />
            {meta.chips_candidates != null && (
              <Stat label="籌碼候選" value={`${meta.chips_candidates}`} valueClass="font-mono text-emerald-400" className="hidden sm:block" />
            )}
            <Stat label="分析新聞" value={`${meta.total_news_analyzed}`} valueClass="font-mono text-slate-100" className="hidden sm:block" />
            <div className="flex items-center gap-1.5 text-slate-500" title={formatTime(generated_at)}>
              <RefreshCw className="h-3 w-3" />
              <span>{relativeTime(generated_at)}更新</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

function Stat({ label, value, valueClass, className = '' }: { label: string; value: string; valueClass: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${valueClass}`}>{value}</div>
    </div>
  )
}

import { useState } from 'react'
import { Activity, RefreshCw, Loader2, PlayCircle } from 'lucide-react'
import type { SignalsPayload } from '../types/signals'
import { formatTime, relativeTime, fmtScore } from '../lib/format'

// Injected at build time via VITE_GH_PAT secret; undefined on local dev without .env.local
const GH_PAT = import.meta.env.VITE_GH_PAT as string | undefined
const DISPATCH_URL =
  'https://api.github.com/repos/DoubleWei/tw-bullish-screener/actions/workflows/update_data.yml/dispatches'
const ACTIONS_URL =
  'https://github.com/DoubleWei/tw-bullish-screener/actions/workflows/update_data.yml'

type TriggerState = 'idle' | 'pending' | 'done' | 'error'

function TriggerButton() {
  const [state, setState] = useState<TriggerState>('idle')

  const trigger = async () => {
    if (state === 'pending') return

    if (!GH_PAT) {
      window.open(ACTIONS_URL, '_blank', 'noopener,noreferrer')
      return
    }

    setState('pending')
    try {
      const res = await fetch(DISPATCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GH_PAT}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      })
      if (res.status === 204 || res.ok) {
        setState('done')
        setTimeout(() => setState('idle'), 6000)
      } else {
        setState('error')
        setTimeout(() => setState('idle'), 4000)
      }
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 4000)
    }
  }

  const label =
    state === 'pending' ? '觸發中…' :
    state === 'done'    ? '已觸發 ✓' :
    state === 'error'   ? '失敗，請重試' :
    '觸發更新'

  const cls =
    state === 'done'  ? 'text-emerald-400 ring-emerald-500/40 bg-emerald-500/5' :
    state === 'error' ? 'text-rose-400 ring-rose-500/40 bg-rose-500/5' :
    'text-slate-400 ring-slate-600 hover:text-slate-200 hover:ring-slate-400 hover:bg-slate-800/60'

  return (
    <button
      onClick={trigger}
      disabled={state === 'pending'}
      title={GH_PAT ? '手動觸發資料更新 pipeline' : '前往 GitHub Actions 手動觸發'}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs ring-1 transition-all disabled:cursor-not-allowed disabled:opacity-60 ${cls}`}
    >
      {state === 'pending'
        ? <Loader2   className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
        : <PlayCircle className="h-3.5 w-3.5 flex-shrink-0" />
      }
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

export function Header({ data }: { data: SignalsPayload }) {
  const { market_sentiment: ms, generated_at, meta } = data
  const labelClass =
    ms.label === '偏多' ? 'text-rose-400'
    : ms.label === '偏空' ? 'text-emerald-400'
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
            <Stat label="利多 / 全部" value={`${ms.bullish_industries} / ${totalInds}`} valueClass="font-mono text-rose-300" />
            {meta.chips_candidates != null && (
              <Stat label="籌碼候選" value={`${meta.chips_candidates}`} valueClass="font-mono text-rose-400" className="hidden sm:block" />
            )}
            <Stat label="分析新聞" value={`${meta.total_news_analyzed}`} valueClass="font-mono text-slate-100" className="hidden sm:block" />
            <div className="flex items-center gap-1.5 text-slate-500" title={formatTime(generated_at)}>
              <RefreshCw className="h-3 w-3" />
              <span>{relativeTime(generated_at)}更新</span>
            </div>
            <TriggerButton />
          </div>
        </div>
      </div>
    </header>
  )
}

function Stat({ label, value, valueClass, className = '' }: {
  label: string; value: string; valueClass: string; className?: string
}) {
  return (
    <div className={className}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${valueClass}`}>{value}</div>
    </div>
  )
}

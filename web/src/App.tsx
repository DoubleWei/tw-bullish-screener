import type { ReactNode } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useSignals } from './hooks/useSignals'
import { Header } from './components/Header'
import { MarketHeatmap } from './components/MarketHeatmap'
import { NewsWall } from './components/NewsWall'
import { RecommendationTable } from './components/RecommendationTable'

export default function App() {
  const { data, error, loading } = useSignals()

  if (loading) return (
    <Fullscreen>
      <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      <p className="mt-4 text-slate-500">載入訊號資料中…</p>
    </Fullscreen>
  )

  if (error || !data) return (
    <Fullscreen>
      <AlertCircle className="h-8 w-8 text-rose-400" />
      <p className="mt-4 text-slate-300">資料載入失敗</p>
      <p className="mt-1 font-mono text-sm text-slate-500">{error?.message ?? 'unknown'}</p>
    </Fullscreen>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header data={data} />
      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <MarketHeatmap industries={data.industries} />
        <div className="grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <RecommendationTable recommendations={data.recommendations} />
          </div>
          <div className="lg:col-span-2">
            <NewsWall news={data.news} />
          </div>
        </div>
      </main>
      <footer className="mx-auto max-w-7xl border-t border-slate-800 px-6 py-4 text-center text-xs text-slate-500">
        Powered by <span className="font-mono text-slate-400">{data.meta.ai_engine}</span>
        {' '}· pipeline {data.meta.elapsed_seconds}s ·{' '}
        <a
          href="https://github.com/DoubleWei/tw-bullish-screener"
          target="_blank" rel="noopener noreferrer"
          className="hover:text-slate-300"
        >
          GitHub
        </a>
      </footer>
    </div>
  )
}

function Fullscreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950">
      {children}
    </div>
  )
}

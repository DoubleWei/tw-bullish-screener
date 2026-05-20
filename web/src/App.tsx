import { useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useSignals } from './hooks/useSignals'
import { Header } from './components/Header'
import { MarketHeatmap } from './components/MarketHeatmap'
import { NewsWall } from './components/NewsWall'
import { RecommendationTable } from './components/RecommendationTable'
import { NewsTable } from './components/NewsTable'
import { StockDataTable } from './components/StockDataTable'
import { CalibrationLog } from './components/CalibrationLog'

type TabId = 'overview' | 'news' | 'stocks' | 'calibration'

export default function App() {
  const { data, error, loading } = useSignals()
  const [activeTab, setActiveTab] = useState<TabId>('overview')

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

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview',     label: '市場概覽' },
    { id: 'news',         label: `新聞列表 (${data.news.length})` },
    { id: 'stocks',       label: `股票數據 (${data.recommendations.length})` },
    { id: 'calibration',  label: `校準紀錄 (${data.calibration?.calibration_count ?? 0})` },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Sticky header + tab nav as one unit */}
      <div className="sticky top-0 z-10">
        <Header data={data} />
        <nav className="border-b border-slate-800 bg-slate-950/95 backdrop-blur">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeTab === tab.id
                      ? 'border-emerald-400 text-emerald-300'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </div>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {activeTab === 'overview' && (
          <>
            <MarketHeatmap industries={data.industries} />
            <div className="grid gap-8 xl:grid-cols-5">
              <div className="xl:col-span-3">
                  <RecommendationTable
                  recommendations={data.recommendations}
                  recommendationsLaunchpad={data.recommendations_launchpad}
                />
              </div>
              <div className="xl:col-span-2">
                <NewsWall news={data.news} />
              </div>
            </div>
          </>
        )}
        {activeTab === 'news'        && <NewsTable      news={data.news} />}
        {activeTab === 'stocks'      && <StockDataTable recommendations={data.recommendations} />}
        {activeTab === 'calibration' && <CalibrationLog calibration={data.calibration} />}
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

import { TrendingUp, Star } from 'lucide-react'
import type { Recommendation, SignalStrength } from '../types/signals'
import { SectionTitle, EmptyState } from './MarketHeatmap'

const STRENGTH_STYLES: Record<SignalStrength, string> = {
  STRONG:   'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40',
  MODERATE: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25',
  WEAK:     'bg-slate-500/15 text-slate-400 ring-slate-500/25',
}

const STRENGTH_LABELS: Record<SignalStrength, string> = {
  STRONG: '強訊號', MODERATE: '中等', WEAK: '弱訊號',
}

export function RecommendationTable({ recommendations }: { recommendations: Recommendation[] }) {
  return (
    <section>
      <SectionTitle icon={<TrendingUp className="h-4 w-4" />}>作多推薦清單</SectionTitle>
      {recommendations.length === 0 ? (
        <EmptyState>目前沒有偵測到強烈作多訊號</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/60 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left w-8">#</th>
                <th className="px-3 py-2 text-left">代號</th>
                <th className="px-3 py-2 text-left">名稱</th>
                <th className="px-3 py-2 text-left">產業</th>
                <th className="px-3 py-2 text-right">分數</th>
                <th className="px-3 py-2 text-left">強度</th>
                <th className="px-3 py-2 text-left">理由</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {recommendations.map((r) => (
                <tr key={r.ticker} className="transition hover:bg-slate-900/40">
                  <td className="px-3 py-3">
                    {r.rank <= 3
                      ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      : <span className="font-mono text-slate-500">{r.rank}</span>}
                  </td>
                  <td className="px-3 py-3 font-mono font-semibold text-emerald-300">{r.ticker}</td>
                  <td className="px-3 py-3 text-slate-100">{r.name_zh}</td>
                  <td className="px-3 py-3 text-slate-400">{r.industry_name_zh ?? r.industry_code}</td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-300">{r.bullish_score.toFixed(2)}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ring-1 ${STRENGTH_STYLES[r.signal_strength]}`}>
                      {STRENGTH_LABELS[r.signal_strength]}
                    </span>
                  </td>
                  <td className="px-3 py-3 max-w-xs truncate text-slate-400" title={r.reason_zh}>
                    {r.reason_zh}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

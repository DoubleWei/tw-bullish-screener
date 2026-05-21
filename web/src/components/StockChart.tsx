import {
  ResponsiveContainer, ComposedChart, Area, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import { Loader2 } from 'lucide-react'
import { useChartData } from '../hooks/useChartData'
import type { ChartSignalType } from '../types/signals'

interface Props { ticker: string; name_zh: string }

const SIG_COLOR: Record<ChartSignalType, string> = {
  golden_cross:  '#fbbf24',
  macd_positive: '#34d399',
  volume_surge:  '#fb7185',
}

function fmtDate(d: string) {
  const [, m, day] = d.split('-')
  return `${+m}/${+day}`
}

export function StockChart({ ticker }: Props) {
  const { data, loading, error } = useChartData(ticker)

  if (loading) return (
    <div className="flex items-center justify-center h-40 gap-2 text-xs text-slate-500">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      載入圖表…
    </div>
  )

  if (error || !data || !data.series.length) return (
    <div className="flex items-center justify-center h-14 text-[11px] text-slate-600">
      {!data || error === 'HTTP 404'
        ? '尚無圖表資料（下次 pipeline 執行後產生）'
        : `圖表載入失敗：${error}`}
    </div>
  )

  const { series, signals, selection_reasons } = data

  const allPrices = series.flatMap(d =>
    [d.close, d.ma5, d.ma20, d.ma60].filter((v): v is number => v != null)
  )
  const pMin = Math.min(...allPrices) * 0.987
  const pMax = Math.max(...allPrices) * 1.013
  const maxVol = Math.max(...series.map(d => d.volume), 1)

  return (
    <div className="space-y-1.5">
      {/* Selection reasons */}
      {selection_reasons.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-slate-500">選股原因：</span>
          {selection_reasons.map((r, i) => (
            <span key={i} className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-400 ring-1 ring-rose-500/20">
              {r}
            </span>
          ))}
        </div>
      )}

      {/* Price + volume chart */}
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={series} margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(30,41,59,0.8)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: '#475569' }}
            tickFormatter={fmtDate}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="price"
            orientation="right"
            domain={[pMin, pMax]}
            tick={{ fontSize: 9, fill: '#475569' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => v >= 100 ? v.toFixed(0) : v.toFixed(1)}
            width={38}
          />
          <YAxis yAxisId="vol" domain={[0, maxVol * 5]} hide />

          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11, padding: '4px 8px' }}
            labelStyle={{ color: '#94a3b8', marginBottom: 2 }}
            formatter={(val: unknown, name: string) => {
              const v = val as number | null
              if (v == null) return ['-', name]
              if (name === 'volume') return [v.toLocaleString(), '量']
              const label = name === 'close' ? '收' : name === 'ma5' ? 'MA5' : name === 'ma20' ? 'MA20' : name === 'ma60' ? 'MA60' : name
              return [v.toFixed(2), label]
            }}
          />

          {/* Volume bars — occupy bottom 20% via domain scale trick */}
          <Bar yAxisId="vol" dataKey="volume" fill="rgba(100,116,139,0.2)" radius={[1, 1, 0, 0]} isAnimationActive={false} />

          {/* Price area */}
          <Area
            yAxisId="price"
            type="linear"
            dataKey="close"
            stroke="#f43f5e"
            strokeWidth={1.5}
            fill="rgba(244,63,94,0.05)"
            dot={false}
            activeDot={{ r: 3, fill: '#f43f5e' }}
            isAnimationActive={false}
          />

          {/* MA lines */}
          <Line yAxisId="price" type="linear" dataKey="ma5"  stroke="#38bdf8" strokeWidth={1}   dot={false} connectNulls isAnimationActive={false} />
          <Line yAxisId="price" type="linear" dataKey="ma20" stroke="#f59e0b" strokeWidth={1}   dot={false} connectNulls isAnimationActive={false} />
          <Line yAxisId="price" type="linear" dataKey="ma60" stroke="#818cf8" strokeWidth={0.8} dot={false} connectNulls isAnimationActive={false} strokeDasharray="4 2" />

          {/* Signal annotations */}
          {signals.map((sig, i) => (
            <ReferenceLine
              key={i}
              yAxisId="price"
              x={sig.date}
              stroke={SIG_COLOR[sig.type] ?? '#94a3b8'}
              strokeDasharray="3 3"
              strokeWidth={1}
              label={{ value: sig.label, position: 'insideTopRight', fontSize: 8, fill: SIG_COLOR[sig.type] ?? '#94a3b8', dy: i * 11 }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-slate-500">
        {([['#f43f5e', '收盤'], ['#38bdf8', 'MA5'], ['#f59e0b', 'MA20'], ['#818cf8', 'MA60']] as [string, string][]).map(([color, label]) => (
          <span key={label} className="flex items-center gap-1">
            <span className="inline-block w-3 h-px" style={{ background: color }} />
            {label}
          </span>
        ))}
        {[...new Set(signals.map(s => s.type))].map(type => (
          <span key={type} className="flex items-center gap-1">
            <span className="inline-block w-px h-2.5" style={{ background: SIG_COLOR[type] }} />
            {type === 'golden_cross' ? '黃金交叉' : type === 'macd_positive' ? 'MACD轉正' : '爆量'}
          </span>
        ))}
      </div>
    </div>
  )
}

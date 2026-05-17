import { useState, useMemo } from 'react'
import { Newspaper, ChevronUp, ChevronDown, SlidersHorizontal, Search, ExternalLink } from 'lucide-react'
import type { News, SentimentLabel } from '../types/signals'
import { SentimentBadge } from './SentimentBadge'
import { SectionTitle, EmptyState } from './MarketHeatmap'
import { relativeTime, formatTime } from '../lib/format'

type SortKey = 'sentiment_score' | 'published_at'
type SortDir = 'desc' | 'asc'

const SENTIMENT_STYLES: Record<SentimentLabel, string> = {
  BULLISH: 'bg-rose-500/20 text-rose-300 ring-rose-500/40',
  NEUTRAL: 'bg-slate-500/15 text-slate-400 ring-slate-500/25',
  BEARISH: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40',
}
const SENTIMENT_LABELS: Record<SentimentLabel, string> = {
  BULLISH: '利多', NEUTRAL: '中性', BEARISH: '利空',
}

export function NewsTable({ news }: { news: News[] }) {
  const [sortKey, setSortKey]     = useState<SortKey>('sentiment_score')
  const [sortDir, setSortDir]     = useState<SortDir>('desc')
  const [activeLabels, setActiveLabels] = useState<Set<SentimentLabel>>(
    new Set<SentimentLabel>(['BULLISH', 'NEUTRAL', 'BEARISH'])
  )
  const [filterIndustry, setFilterIndustry] = useState('ALL')
  const [search, setSearch] = useState('')

  const industries = useMemo(() => {
    const seen = new Set<string>()
    for (const n of news) {
      for (const code of n.affected_industries) seen.add(code)
    }
    return [...seen].sort()
  }, [news])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const toggleLabel = (l: SentimentLabel) => {
    setActiveLabels(prev => {
      const next = new Set(prev)
      next.has(l) ? next.delete(l) : next.add(l)
      return next.size === 0 ? prev : next
    })
  }

  const processed = useMemo(() => {
    const q = search.trim().toLowerCase()
    return news
      .filter(n => activeLabels.has(n.sentiment_label))
      .filter(n => filterIndustry === 'ALL' || n.affected_industries.includes(filterIndustry))
      .filter(n => !q || n.title.toLowerCase().includes(q) || (n.impact_reason_zh ?? '').toLowerCase().includes(q))
      .slice()
      .sort((a, b) => {
        if (sortKey === 'published_at') {
          const diff = new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
          return sortDir === 'desc' ? diff : -diff
        }
        return sortDir === 'desc' ? b.sentiment_score - a.sentiment_score : a.sentiment_score - b.sentiment_score
      })
  }, [news, activeLabels, filterIndustry, search, sortKey, sortDir])

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return null
    return sortDir === 'desc'
      ? <ChevronDown className="h-3 w-3 inline ml-0.5 align-middle" />
      : <ChevronUp   className="h-3 w-3 inline ml-0.5 align-middle" />
  }

  if (news.length === 0) return (
    <section>
      <SectionTitle icon={<Newspaper className="h-4 w-4" />}>新聞列表</SectionTitle>
      <EmptyState>尚無新聞資料</EmptyState>
    </section>
  )

  return (
    <section>
      <SectionTitle icon={<Newspaper className="h-4 w-4" />}>新聞列表</SectionTitle>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-slate-900/60 rounded-lg border border-slate-800 mb-3">
        <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />

        <div className="flex gap-1">
          {(['BULLISH', 'NEUTRAL', 'BEARISH'] as SentimentLabel[]).map(l => (
            <button
              key={l}
              onClick={() => toggleLabel(l)}
              className={`rounded-full px-2 py-0.5 text-[11px] ring-1 transition-opacity ${
                activeLabels.has(l) ? SENTIMENT_STYLES[l] : 'text-slate-600 ring-slate-700 opacity-50'
              }`}
            >
              {SENTIMENT_LABELS[l]}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-slate-700 flex-shrink-0 hidden sm:block" />

        <select
          value={filterIndustry}
          onChange={e => setFilterIndustry(e.target.value)}
          className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 ring-1 ring-slate-700 focus:outline-none"
        >
          <option value="ALL">全部產業</option>
          {industries.map(code => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 ring-1 ring-slate-700 flex-1 min-w-[140px] max-w-xs">
          <Search className="h-3 w-3 text-slate-500 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜尋標題 / 影響說明"
            className="bg-transparent text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none w-full"
          />
        </div>

        <div className="flex gap-1 ml-auto">
          <span className="text-[10px] text-slate-600 self-center hidden sm:inline">排序</span>
          {([
            { key: 'sentiment_score' as SortKey, label: '情緒分' },
            { key: 'published_at'    as SortKey, label: '時間'   },
          ]).map(opt => (
            <button
              key={opt.key}
              onClick={() => handleSort(opt.key)}
              className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] ring-1 transition ${
                sortKey === opt.key
                  ? 'bg-slate-700 text-slate-200 ring-slate-500'
                  : 'text-slate-500 ring-slate-700 hover:text-slate-300'
              }`}
            >
              {opt.label}
              {sortKey === opt.key && (sortDir === 'desc'
                ? <ChevronDown className="h-3 w-3" />
                : <ChevronUp   className="h-3 w-3" />
              )}
            </button>
          ))}
        </div>

        {processed.length < news.length && (
          <span className="text-[10px] text-slate-500">{processed.length}/{news.length}</span>
        )}
      </div>

      {processed.length === 0 ? (
        <EmptyState>沒有符合條件的新聞</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 text-left w-8">#</th>
                <th className="px-3 py-2.5 text-left">標題</th>
                <th className="px-3 py-2.5 text-left w-24">來源</th>
                <th
                  className={`px-3 py-2.5 text-left w-24 cursor-pointer select-none whitespace-nowrap hover:text-slate-300 transition-colors ${sortKey === 'published_at' ? 'text-slate-200' : ''}`}
                  onClick={() => handleSort('published_at')}
                >
                  時間 <SortIcon k="published_at" />
                </th>
                <th
                  className={`px-3 py-2.5 text-center w-36 cursor-pointer select-none whitespace-nowrap hover:text-slate-300 transition-colors ${sortKey === 'sentiment_score' ? 'text-slate-200' : ''}`}
                  onClick={() => handleSort('sentiment_score')}
                >
                  情緒 / 評分 <SortIcon k="sentiment_score" />
                </th>
                <th className="px-3 py-2.5 text-left hidden lg:table-cell">受影響產業</th>
                <th className="px-3 py-2.5 text-left hidden xl:table-cell">影響說明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {processed.map((n, i) => (
                <tr key={n.id} className="hover:bg-slate-900/40 transition">
                  <td className="px-3 py-2.5 font-mono text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2.5 max-w-[260px]">
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-start gap-1 text-slate-100 hover:text-emerald-300 leading-snug"
                    >
                      <span className="line-clamp-2">{n.title}</span>
                      <ExternalLink className="h-3 w-3 mt-0.5 opacity-40 flex-shrink-0" />
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 truncate max-w-[6rem]" title={n.source}>
                    {n.source}
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap" title={formatTime(n.published_at)}>
                    {relativeTime(n.published_at)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <SentimentBadge label={n.sentiment_label} score={n.sentiment_score} />
                  </td>
                  <td className="px-3 py-2.5 hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {n.affected_industries.length > 0
                        ? n.affected_industries.map(code => (
                            <span key={code} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 ring-1 ring-slate-700">
                              {code}
                            </span>
                          ))
                        : <span className="text-slate-600">—</span>
                      }
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 hidden xl:table-cell max-w-xs">
                    <span className="line-clamp-2 leading-relaxed">{n.impact_reason_zh || '—'}</span>
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

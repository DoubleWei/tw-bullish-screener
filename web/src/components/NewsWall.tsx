import { Newspaper, ExternalLink } from 'lucide-react'
import type { News } from '../types/signals'
import { SentimentBadge } from './SentimentBadge'
import { SectionTitle, EmptyState } from './MarketHeatmap'
import { relativeTime } from '../lib/format'

export function NewsWall({ news }: { news: News[] }) {
  // Prefer analyzed (non-neutral) news; fall back to recent unanalyzed items so the wall is never empty
  const analyzed = news.filter((n) => n.affected_industries.length > 0 || n.sentiment_label !== 'NEUTRAL')
  const pool = analyzed.length >= 5 ? analyzed : [...news].sort((a, b) =>
    new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  )
  const sorted = pool
    .slice()
    .sort((a, b) => Math.abs(b.sentiment_score) - Math.abs(a.sentiment_score))
    .slice(0, 20)

  return (
    <section>
      <SectionTitle icon={<Newspaper className="h-4 w-4" />}>AI 觀點新聞牆</SectionTitle>
      {sorted.length === 0 ? (
        <EmptyState>本期未抓到具影響力的新聞</EmptyState>
      ) : (
        <div className="space-y-2">
          {sorted.map((n) => <NewsCard key={n.id} news={n} />)}
        </div>
      )}
    </section>
  )
}

function NewsCard({ news: n }: { news: News }) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 transition hover:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <a
          href={n.url} target="_blank" rel="noopener noreferrer"
          className="flex-1 text-sm font-medium leading-snug text-slate-100 hover:text-emerald-300"
        >
          {n.title}
          <ExternalLink className="ml-1 inline h-3 w-3 opacity-60" />
        </a>
        <SentimentBadge label={n.sentiment_label} score={n.sentiment_score} />
      </div>
      {n.impact_reason_zh && (
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{n.impact_reason_zh}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
        <span>{n.source}</span>
        <span>·</span>
        <span>{relativeTime(n.published_at)}</span>
        {n.affected_industries.length > 0 && (
          <>
            <span>·</span>
            {n.affected_industries.map((code) => (
              <span key={code} className="rounded bg-slate-800/80 px-1.5 py-0.5 font-mono text-slate-400">
                {code}
              </span>
            ))}
          </>
        )}
      </div>
    </article>
  )
}

export type SentimentLabel = 'BULLISH' | 'NEUTRAL' | 'BEARISH'
export type SignalStrength = 'STRONG' | 'MODERATE' | 'WEAK'

export interface MarketSentiment {
  overall_score: number
  label: string
  bullish_industries: number
  bearish_industries: number
  neutral_industries: number
}

export interface Industry {
  industry_code: string
  industry_name_zh: string
  sentiment_score: number
  signal: SentimentLabel
  news_count: number
  summary_zh: string
  key_drivers: string[]
}

export interface News {
  id: string
  title: string
  url: string
  source: string
  published_at: string
  snippet: string
  sentiment_score: number
  sentiment_label: SentimentLabel
  affected_industries: string[]
  impact_reason_zh: string
}

export interface ChipsData {
  trust_consec_buy: number
  foreign_consec_buy: number
  trust_buy_3d: number
  foreign_buy_3d: number
  chips_score: number
  signals: string[]
}

export interface TechnicalData {
  price: number
  ma5: number
  ma20: number
  ma60: number
  rsi: number
  macd_hist: number
  vol_ratio: number
  tech_score: number
  signals: string[]
}

export interface Recommendation {
  rank: number
  ticker: string
  name_zh: string
  price?: number
  industry_code: string
  industry_name_zh?: string
  news_score?: number
  bullish_score: number
  signal_strength: SignalStrength
  trigger_news_ids: string[]
  reason_zh: string
  related_industries: string[]
  technical?: TechnicalData
  chips?: ChipsData
}

export interface SignalsPayload {
  schema_version: string
  generated_at: string
  next_update_at: string
  window: { from: string; to: string; hours: number }
  market_sentiment: MarketSentiment
  industries: Industry[]
  news: News[]
  recommendations: Recommendation[]
  meta: {
    pipeline_version: string
    ai_engine: string
    total_news_fetched: number
    total_news_analyzed: number
    rss_sources_count: number
    tickers_with_technicals?: number
    total_stocks_scanned?: number
    chips_candidates?: number
    elapsed_seconds: number
  }
}

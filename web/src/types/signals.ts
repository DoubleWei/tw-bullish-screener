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
  ma10?: number
  ma20: number
  ma60: number
  rsi: number
  macd_hist: number
  vol_ratio: number
  tech_score: number
  signals: string[]
  // Launchpad indicators
  bias_pct?: number
  gain_10d?: number
  price_position_120d?: number
  ma_convergence_pct?: number
  ma5_cross_ma20?: boolean
  macd_just_positive?: boolean
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

export interface CalibrationWeights {
  chips_weight?: number
  tech_weight?: number
  news_weight?: number
  raw_weight?: number
  strong_threshold?: number
  moderate_threshold?: number
}

export interface CalibrationPerf {
  snapshots: number
  avg_alpha: number | null
  avg_beat_rate: number | null
  avg_return: number | null
}

export interface CalibrationEntry {
  at: string
  snapshots_used: number
  performance: { momentum: CalibrationPerf; launchpad: CalibrationPerf }
  discriminability: {
    momentum?: { chips: number; tech: number; news: number }
    launchpad?: { chips: number; tech: number; news: number }
  }
  weights_before: { momentum: CalibrationWeights; launchpad: CalibrationWeights }
  weights_after:  { momentum: CalibrationWeights; launchpad: CalibrationWeights }
  changes: string[]
}

export interface CalibrationData {
  current_weights: { momentum: CalibrationWeights; launchpad: CalibrationWeights }
  calibration_count: number
  last_updated: string
  history: CalibrationEntry[]
}

export interface ChartDataPoint {
  date: string
  close: number
  open: number
  high: number
  low: number
  volume: number
  ma5: number | null
  ma20: number | null
  ma60: number | null
  macd_hist: number | null
  vol_ratio: number
}

export type ChartSignalType = 'golden_cross' | 'macd_positive' | 'volume_surge'

export interface ChartSignal {
  date: string
  type: ChartSignalType
  label: string
}

export interface StockChartData {
  series: ChartDataPoint[]
  signals: ChartSignal[]
  selection_reasons: string[]
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
  recommendations_launchpad?: Recommendation[]
  calibration?: CalibrationData
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

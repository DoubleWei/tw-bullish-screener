import { useState, useEffect } from 'react'
import type { StockChartData } from '../types/signals'

export function useChartData(ticker: string | null) {
  const [data, setData] = useState<StockChartData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ticker) {
      setData(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)

    fetch(`${import.meta.env.BASE_URL}data/charts/${ticker}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<StockChartData>
      })
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [ticker])

  return { data, loading, error }
}

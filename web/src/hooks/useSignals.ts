import { useEffect, useState } from 'react'
import type { SignalsPayload } from '../types/signals'

const DATA_URL = `${import.meta.env.BASE_URL}data/latest_signals.json`

interface State {
  data: SignalsPayload | null
  error: Error | null
  loading: boolean
}

export function useSignals(): State {
  const [state, setState] = useState<State>({ data: null, error: null, loading: true })

  useEffect(() => {
    let cancelled = false
    fetch(DATA_URL, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: SignalsPayload) => {
        if (!cancelled) setState({ data, error: null, loading: false })
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ data: null, error, loading: false })
      })
    return () => { cancelled = true }
  }, [])

  return state
}

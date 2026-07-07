"use client"

import { useEffect, useState } from "react"

interface UseFetchJsonResult<T> {
  data: T | null
  loading: boolean
  error: boolean
}

/**
 * Shared client-fetch pattern: AbortController + res.ok check + AbortError
 * swallowing + loading lifecycle. See docs/plans/CLIENT_FETCH_HARDENING.md.
 */
export function useFetchJson<T>(url: string | null, deps: unknown[]): UseFetchJsonResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(url !== null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!url) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<T>
      })
      .then((d) => { setData(d); setLoading(false) })
      .catch((err) => {
        if (err?.name === "AbortError") return
        setError(true)
        setLoading(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps])

  return { data, loading, error }
}

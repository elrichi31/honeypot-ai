"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { AlertTriangle, RefreshCw, Loader2 } from "lucide-react"

const AUTO_RETRY_DELAYS_MS = [4000, 10000]
const AUTO_RETRY_STATE_TTL_MS = 5 * 60 * 1000

interface AutoRetryState {
  count: number
  at: number
}

function readAutoRetryCount(key: string): number {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return 0
    const state: AutoRetryState = JSON.parse(raw)
    // Expire stale counters so a failure from minutes ago doesn't suppress
    // auto-retry on a fresh, unrelated failure of the same section.
    if (Date.now() - state.at > AUTO_RETRY_STATE_TTL_MS) return 0
    return state.count
  } catch {
    return 0
  }
}

function writeAutoRetryCount(key: string, count: number): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ count, at: Date.now() } satisfies AutoRetryState))
  } catch {
    // sessionStorage unavailable (e.g. private mode) — auto-retry just won't persist across mounts.
  }
}

/**
 * Inline error state for a single dashboard section that failed to load (e.g. a
 * backend fetch timed out). Unlike the empty state, it makes clear the data
 * could not be loaded — never a misleading "no data". Auto-retries up to twice
 * (4s, then 10s) before falling back to the manual retry button — most section
 * failures are transient (cold cache, a slow query) and resolve on their own.
 * See docs/plans/DASHBOARD_FIRST_LOAD.md Fase 2.
 */
export function SectionError({
  title = "Could not load this section",
  message = "The server took too long or did not respond. This is usually temporary.",
}: {
  title?: string
  message?: string
}) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  const storageKey = `section-error-retry:${title}`
  const [autoRetrying, setAutoRetrying] = useState(() => readAutoRetryCount(storageKey) < AUTO_RETRY_DELAYS_MS.length)

  useEffect(() => {
    const attempt = readAutoRetryCount(storageKey)
    if (attempt >= AUTO_RETRY_DELAYS_MS.length) {
      setAutoRetrying(false)
      return
    }
    const timer = setTimeout(() => {
      writeAutoRetryCount(storageKey, attempt + 1)
      router.refresh()
    }, AUTO_RETRY_DELAYS_MS[attempt])
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount (i.e. once per failed render)
  }, [])

  function retry() {
    setRetrying(true)
    router.refresh()
    // router.refresh() resolves once the server component re-renders; reset the
    // spinner shortly after so it doesn't spin forever if data is unchanged.
    setTimeout(() => setRetrying(false), 2000)
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/10">
        <AlertTriangle className="h-5 w-5 text-amber-400" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      {autoRetrying ? (
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Retrying automatically…
        </div>
      ) : (
        <button
          onClick={retry}
          disabled={retrying}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Retry
        </button>
      )}
    </div>
  )
}

const WINDOW_MS = 60_000
const DEFAULT_LIMIT = parseInt(process.env.INGEST_RATE_LIMIT_RPM ?? '300', 10)

type Entry = { count: number; windowStart: number }
const windows = new Map<string, Entry>()

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS
  for (const [key, entry] of windows) {
    if (entry.windowStart < cutoff) windows.delete(key)
  }
}, 5 * 60_000).unref()

/**
 * Fixed-window per-key rate limit. `key` is usually an IP, but callers can
 * namespace it (e.g. `def:1.2.3.4`) to keep independent counters in one map.
 * Returns true if the request is allowed, false once the window limit is hit.
 */
export function checkRateLimit(key: string, limit = DEFAULT_LIMIT): boolean {
  const now = Date.now()
  const entry = windows.get(key)

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    windows.set(key, { count: 1, windowStart: now })
    return true
  }

  entry.count++
  return entry.count <= limit
}

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

export function checkIngestRateLimit(ip: string, limit = DEFAULT_LIMIT): boolean {
  const now = Date.now()
  const entry = windows.get(ip)

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    windows.set(ip, { count: 1, windowStart: now })
    return true
  }

  entry.count++
  return entry.count <= limit
}

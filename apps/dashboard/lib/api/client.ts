export function getApiUrl() {
  return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
}

const DEFAULT_FETCH_TIMEOUT_MS = 10000

export async function apiFetch<T>(url: string, revalidate?: number, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<T> {
  const init: RequestInit = revalidate != null
    ? { next: { revalidate } }
    : { cache: "no-store" }
  // Bound every server-side fetch so a saturated backend can't hang the whole
  // page render indefinitely; the caller's try/catch then degrades gracefully.
  // Heavy aggregate endpoints (e.g. /threats) pass a larger timeout so a slow
  // query isn't misread as "no data".
  init.signal = AbortSignal.timeout(timeoutMs)
  // Some ingest-api routes (e.g. /clients, /sensors) are guarded by
  // ensureIngestToken. These calls run server-side, so attach the shared secret
  // when available; public routes simply ignore it.
  if (process.env.INGEST_SHARED_SECRET) {
    init.headers = { ...init.headers, "X-Ingest-Token": process.env.INGEST_SHARED_SECRET }
  }
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`)
  return res.json()
}

export function buildSearchParams(params: Record<string, string | number | boolean | undefined | null>): URLSearchParams {
  const sp = new URLSearchParams()
  for (const [key, val] of Object.entries(params)) {
    if (val != null && val !== "") sp.set(key, String(val))
  }
  return sp
}

export function getApiUrl() {
  return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
}

const DEFAULT_FETCH_TIMEOUT_MS = 10000
const RETRY_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 300

// Retries only network/timeout failures (fetch rejecting before a Response
// exists) — a 4xx/5xx that did get a Response is a valid server answer and is
// handled by the caller, not retried here. See DASHBOARD_FIRST_LOAD.md Fase 2.
async function fetchWithRetry(url: string, init: RequestInit, timeoutMs: number, attempts = RETRY_ATTEMPTS): Promise<Response> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (err) {
      if (i === attempts - 1) throw err
      await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * 3 ** i))
    }
  }
  throw new Error("unreachable")
}

/**
 * Server-side fetch wrapper (Server Components, `lib/api/*.ts` data-fetchers).
 * Distinct from the client-side `apiFetch` in `lib/client-fetch.ts` — same name,
 * different contract: this one parses and returns JSON directly (or throws),
 * the client one returns the raw `Response`. Do not confuse the two on import.
 */
export async function apiFetch<T>(url: string, revalidate?: number, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<T> {
  const init: RequestInit = revalidate != null
    ? { next: { revalidate } }
    : { cache: "no-store" }
  // Some ingest-api routes (e.g. /clients, /sensors) are guarded by
  // ensureIngestToken. These calls run server-side, so attach the shared secret
  // when available; public routes simply ignore it.
  if (process.env.INGEST_SHARED_SECRET) {
    init.headers = { ...init.headers, "X-Ingest-Token": process.env.INGEST_SHARED_SECRET }
  }
  // Bound every server-side fetch so a saturated backend can't hang the whole
  // page render indefinitely; the caller's try/catch then degrades gracefully.
  // Heavy aggregate endpoints (e.g. /threats) pass a larger timeout so a slow
  // query isn't misread as "no data".
  const res = await fetchWithRetry(url, init, timeoutMs)
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    let msg = `API error ${res.status}: ${url}`
    try {
      const body = JSON.parse(text)
      if (body?.error) msg = body.error
      // requestId (ingest-api's setErrorHandler on 5xx) lets a bug report be
      // grepped to the exact backend log line — see ERROR_HANDLING.md Fase 5.
      if (body?.requestId) msg = `${msg} (ref: ${body.requestId})`
    } catch { /* not JSON, keep default message */ }
    throw new Error(msg)
  }
  return res.json()
}

export function buildSearchParams(params: Record<string, string | number | boolean | undefined | null>): URLSearchParams {
  const sp = new URLSearchParams()
  for (const [key, val] of Object.entries(params)) {
    if (val != null && val !== "") sp.set(key, String(val))
  }
  return sp
}

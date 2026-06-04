// Server-only helpers shared by route handlers that proxy to the ingest-api.
// Centralizes the internal API URL, ingest auth header, and a timeout-bounded
// fetch + safe JSON parse so a slow or misbehaving backend yields a clear error
// instead of a hung request or an unhandled 500.
import { getApiUrl } from "./client"

export { getApiUrl }

const DEFAULT_PROXY_TIMEOUT_MS = 10000

/** Auth header for ingest-api routes guarded by the shared secret. */
export function ingestHeaders(withJsonBody = true): Record<string, string> {
  return {
    ...(withJsonBody ? { "Content-Type": "application/json" } : {}),
    ...(process.env.INGEST_SHARED_SECRET
      ? { "X-Ingest-Token": process.env.INGEST_SHARED_SECRET }
      : {}),
  }
}

type ProxyResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string }

/**
 * Fetches `${getApiUrl()}${path}` with a bounded timeout and parses the JSON
 * body defensively. Never throws: a network failure, timeout, or non-JSON body
 * is returned as { ok: false } with an explanatory message and a sensible status.
 */
export async function proxyJson(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<ProxyResult> {
  const { timeoutMs = DEFAULT_PROXY_TIMEOUT_MS, ...fetchInit } = init
  let res: Response
  try {
    res = await fetch(`${getApiUrl()}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      ...fetchInit,
    })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError"
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      error: timedOut ? "Ingest API timed out" : "Could not reach ingest API",
    }
  }

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      // Backend returned a non-JSON body (e.g. an HTML error page from a proxy).
      return {
        ok: false,
        status: res.ok ? 502 : res.status,
        error: `Ingest API returned a non-JSON response (status ${res.status})`,
      }
    }
  }

  if (!res.ok) {
    const error =
      (data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : null) ?? `Ingest API error (status ${res.status})`
    return { ok: false, status: res.status, error }
  }

  return { ok: true, status: res.status, data }
}

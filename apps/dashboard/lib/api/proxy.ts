import { NextResponse } from "next/server"
import { getApiUrl } from "./client"

export { getApiUrl }

const DEFAULT_TIMEOUT_MS = 10000

/** Auth header for ingest-api routes guarded by the shared secret. */
export function ingestHeaders(withJsonBody = true): Record<string, string> {
  return {
    ...(withJsonBody ? { "Content-Type": "application/json" } : {}),
    ...(process.env.INGEST_SHARED_SECRET
      ? { "X-Ingest-Token": process.env.INGEST_SHARED_SECRET }
      : {}),
  }
}

export type ProxyResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string }

/**
 * Core proxy primitive. Fetches `${getApiUrl()}${path}` with a bounded timeout
 * and parses the JSON body defensively. Never throws — network failures, timeouts,
 * and non-JSON bodies are returned as `{ ok: false }` with a clear status code.
 *
 * `path` must start with "/" (e.g. "/alerts").
 */
export async function proxyRaw(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<ProxyResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchInit } = init
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
      return {
        ok: false,
        status: res.ok ? 502 : res.status,
        error: `Ingest API returned a non-JSON response (status ${res.status})`,
      }
    }
  }

  if (!res.ok) {
    const error =
      (data && typeof data === "object" && "error" in data && typeof (data as Record<string, unknown>).error === "string"
        ? (data as Record<string, unknown>).error as string
        : null) ?? `Ingest API error (status ${res.status})`
    return { ok: false, status: res.status, error }
  }

  return { ok: true, status: res.status, data }
}

/**
 * Thin adapter over `proxyRaw` that converts the result into a `NextResponse`.
 * Use in route handlers that just relay the backend response unchanged.
 */
export async function proxyGet(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<NextResponse> {
  const result = await proxyRaw(path, init)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

/** Alias for `proxyGet` — use when the caller passes a non-GET `method` in init. */
export const proxyResponse = proxyGet

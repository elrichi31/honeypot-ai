import { fetchPublicIp } from "@/lib/auth-client"

// Client-side fetch wrapper that attaches the browser's real public IP on
// mutating requests, so audit logging captures the actual actor IP instead of
// the internal tunnel/Docker address. The public IP is fetched once and cached
// (module var + sessionStorage) to avoid hitting ipify on every request.

const STORAGE_KEY = "honeytrap-public-ip"
let cachedIp: string | null = null
let inflight: Promise<string | null> | null = null

async function getPublicIp(): Promise<string | null> {
  if (cachedIp) return cachedIp
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      cachedIp = stored
      return stored
    }
  } catch { /* sessionStorage may be unavailable */ }

  // Dedupe concurrent first-callers onto one ipify request.
  if (!inflight) {
    inflight = fetchPublicIp().finally(() => { inflight = null })
  }
  const ip = await inflight
  if (ip) {
    cachedIp = ip
    try { sessionStorage.setItem(STORAGE_KEY, ip) } catch { /* ignore */ }
  }
  return ip
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"])

async function withClientIp(input: string, init: RequestInit): Promise<Response> {
  const ip = await getPublicIp()
  if (!ip) return fetch(input, init)
  const headers = new Headers(init.headers)
  headers.set("x-client-public-ip", ip)
  return fetch(input, { ...init, headers })
}

/**
 * Client-side fetch wrapper (`"use client"` components). Distinct from the
 * server-side `apiFetch` in `lib/api/client.ts` — same name, different contract:
 * this one returns the raw `Response` (never parses the body), the server one
 * returns parsed JSON directly. Do not confuse the two on import.
 *
 * Drop-in replacement for fetch() that injects `x-client-public-ip` on mutating
 * requests. Best-effort: if the public IP can't be resolved, the request still
 * goes out without the header.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase()
  if (!MUTATING.has(method)) return fetch(input, init)
  return withClientIp(input, init)
}

/**
 * Like apiFetch but always attaches the client IP, even for GET. Use for audited
 * GET actions (e.g. installer downloads) that must record the real actor IP.
 */
export async function apiFetchAudited(input: string, init: RequestInit = {}): Promise<Response> {
  return withClientIp(input, init)
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

/** Throws ApiError with the server's real error message on a non-ok response. */
export async function assertOk(res: Response, fallback = "Request failed"): Promise<Response> {
  if (res.ok) return res
  const body = await res.json().catch(() => null) as { error?: string } | null
  throw new ApiError(body?.error || `${fallback} (${res.status})`, res.status)
}

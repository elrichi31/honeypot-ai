import { NextResponse } from "next/server"

const apiBase = () =>
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

const DEFAULT_TIMEOUT_MS = 8000

/**
 * Proxy a GET request to the ingest-api backend and relay its JSON response.
 *
 * Centralizes the safe-proxy pattern:
 *  - A failed connection or a non-JSON error body is turned into a clean 502
 *    instead of an opaque 500 thrown by `res.json()`.
 *  - The request is bounded by a timeout so a saturated backend can't hang the
 *    dashboard indefinitely; on timeout we return 503 and the page degrades to
 *    an empty/error state instead of freezing the browser.
 *
 * `path` must start with "/" (e.g. "/storage/stats").
 */
export async function proxyGet(
  path: string,
  init?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<NextResponse> {
  let res: Response
  try {
    res = await fetch(`${apiBase()}${path}`, {
      cache: "no-store",
      headers: init?.headers,
      signal: AbortSignal.timeout(init?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
  } catch (err) {
    // AbortSignal.timeout fires a TimeoutError; treat that as 503 (backend busy)
    // and anything else (connection refused, DNS, etc.) as 502 (unreachable).
    const isTimeout = err instanceof DOMException && err.name === "TimeoutError"
    return NextResponse.json(
      { error: isTimeout ? "Backend timed out" : "Backend unreachable" },
      { status: isTimeout ? 503 : 502 },
    )
  }

  const data = await res.json().catch(() => null)
  if (data === null) {
    return NextResponse.json(
      { error: `Backend returned a non-JSON response (status ${res.status})` },
      { status: res.ok ? 502 : res.status },
    )
  }

  return NextResponse.json(data, { status: res.status })
}

import { NextResponse } from "next/server"

const apiBase = () =>
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

/**
 * Proxy a GET request to the ingest-api backend and relay its JSON response.
 *
 * Centralizes the safe-proxy pattern: a failed connection or a non-JSON error
 * body from the backend is turned into a clean 502 instead of an opaque 500
 * thrown by `res.json()`. `path` must start with "/" (e.g. "/storage/stats").
 */
export async function proxyGet(
  path: string,
  init?: { headers?: Record<string, string> },
): Promise<NextResponse> {
  let res: Response
  try {
    res = await fetch(`${apiBase()}${path}`, { cache: "no-store", headers: init?.headers })
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 })
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

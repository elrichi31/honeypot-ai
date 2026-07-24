import { requireRole } from "@/lib/roles"

export const dynamic = "force-dynamic"

const apiBase = () => process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

const CACHE_TTL = 4_000
let systemCache: { data: unknown; status: number; expiresAt: number } | null = null

export async function GET() {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const now = Date.now()
  if (systemCache && systemCache.expiresAt > now) {
    return Response.json(systemCache.data, { status: systemCache.status })
  }

  let res: Response
  try {
    res = await fetch(`${apiBase()}/monitoring/system`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    })
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === "TimeoutError"
    console.error("[api] /api/monitoring/system", { upstream: `${apiBase()}/monitoring/system`, isTimeout }, err)
    return Response.json(
      { error: isTimeout ? "Backend timed out" : "Backend unreachable" },
      { status: isTimeout ? 503 : 502 },
    )
  }

  const data = await res.json().catch(() => null)
  if (data === null) {
    return Response.json({ error: "Backend returned a non-JSON response" }, { status: 502 })
  }

  systemCache = { data, status: res.status, expiresAt: now + CACHE_TTL }
  return Response.json(data, { status: res.status })
}

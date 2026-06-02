import { requireRole } from "@/lib/roles"

export const dynamic = "force-dynamic"

const apiBase = () => process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

const CACHE_TTL = 30_000
let statsCache: { data: unknown; status: number; expiresAt: number } | null = null

export async function GET() {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const now = Date.now()
  if (statsCache && statsCache.expiresAt > now) {
    return Response.json(statsCache.data, { status: statsCache.status })
  }

  let res: Response
  try {
    res = await fetch(`${apiBase()}/monitoring/containers/stats`, { cache: "no-store" })
  } catch {
    return Response.json({ error: "Backend unreachable" }, { status: 502 })
  }

  const data = await res.json().catch(() => null)
  if (data === null) {
    return Response.json({ error: "Backend returned a non-JSON response" }, { status: 502 })
  }

  statsCache = { data, status: res.status, expiresAt: now + CACHE_TTL }
  return Response.json(data, { status: res.status })
}

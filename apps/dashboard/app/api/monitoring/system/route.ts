import { requireRole } from "@/lib/roles"

export const dynamic = "force-dynamic"

const apiBase = () => process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

const CACHE_TTL = 30_000
let systemCache: { data: unknown; status: number; expiresAt: number } | null = null

export async function GET() {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const now = Date.now()
  if (systemCache && systemCache.expiresAt > now) {
    return Response.json(systemCache.data, { status: systemCache.status })
  }

  const res = await fetch(`${apiBase()}/monitoring/system`, { cache: "no-store" })
  const data = await res.json()
  systemCache = { data, status: res.status, expiresAt: now + CACHE_TTL }
  return Response.json(data, { status: res.status })
}

import { requireRole } from "@/lib/roles"

export const dynamic = "force-dynamic"

const apiBase = () => process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export async function GET(request: Request) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const { searchParams } = new URL(request.url)
  const range = searchParams.get("range") ?? "24h"

  const res = await fetch(`${apiBase()}/monitoring/containers/history?range=${range}`, { cache: "no-store" })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

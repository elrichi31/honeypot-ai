import { requireRole } from "@/lib/roles"
import { proxyJson, ingestHeaders } from "@/lib/api/server"

export const dynamic = "force-dynamic"

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const { id } = await params
  const result = await proxyJson(`/alerts/${encodeURIComponent(id)}/read`, { method: "POST", headers: ingestHeaders(false) })
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result.data, { status: result.status })
}

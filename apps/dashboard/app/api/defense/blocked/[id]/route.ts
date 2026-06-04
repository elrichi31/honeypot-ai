import { requireRole } from "@/lib/roles"
import { proxyJson } from "@/lib/api/server"

export const dynamic = "force-dynamic"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const { id } = await params
  const result = await proxyJson(`/api-defense/blocked/${encodeURIComponent(id)}`, { method: "DELETE" })
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  if (result.status === 204) return new Response(null, { status: 204 })
  return Response.json(result.data, { status: result.status })
}

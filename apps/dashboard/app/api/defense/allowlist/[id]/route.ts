import { requireRole } from "@/lib/roles"

export const dynamic = "force-dynamic"

const apiBase = () => process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const { id } = await params
  const res = await fetch(`${apiBase()}/api-defense/allowlist/${encodeURIComponent(id)}`, { method: "DELETE" })
  if (res.status === 204) return new Response(null, { status: 204 })
  const data = await res.json().catch(() => ({}))
  return Response.json(data, { status: res.status })
}

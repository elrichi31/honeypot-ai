import { requireRole } from "@/lib/roles"

export const dynamic = "force-dynamic"

const apiBase = () => process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const res = await fetch(`${apiBase()}/api-defense/blocked/${params.id}`, { method: "DELETE" })
  if (res.status === 204) return new Response(null, { status: 204 })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

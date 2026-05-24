import { type NextRequest } from "next/server"
import { requireRole } from "@/lib/roles"

export const dynamic = "force-dynamic"

const apiBase = () => process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth_check = await requireRole("admin")
  if (!auth_check.ok) return auth_check.response

  const body = await request.json()
  const res = await fetch(`${apiBase()}/storage/retention/${params.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

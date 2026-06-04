import { type NextRequest } from "next/server"
import { requireRole } from "@/lib/roles"
import { proxyJson } from "@/lib/api/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const result = await proxyJson("/api-defense/blocked")
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result.data, { status: result.status })
}

export async function POST(request: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const body = await request.json()
  const result = await proxyJson("/api-defense/blocked", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result.data, { status: result.status })
}

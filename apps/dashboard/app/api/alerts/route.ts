import { type NextRequest } from "next/server"
import { requireRole } from "@/lib/roles"
import { proxyJson } from "@/lib/api/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const qs = request.nextUrl.searchParams.toString()
  const result = await proxyJson(`/alerts${qs ? `?${qs}` : ""}`)
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result.data, { status: result.status })
}

// Delete alerts, optionally scoped to a client via ?clientId=. Requires
// analyst+ so a plain viewer can't wipe alerts.
export async function DELETE(request: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const qs = request.nextUrl.searchParams.toString()
  const result = await proxyJson(`/alerts${qs ? `?${qs}` : ""}`, { method: "DELETE" })
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result.data, { status: result.status })
}

import { type NextRequest } from "next/server"
import { requireRole, resolveScopeClientId } from "@/lib/roles"
import { proxyJson } from "@/lib/api/server"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  // Force the caller's effective client scope (never trust the raw query param).
  const { clientId } = resolveScopeClientId(auth_check, request.nextUrl.searchParams.get("clientId"))
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""
  const result = await proxyJson(`/alerts/read-all${qs}`, { method: "POST" })
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json(result.data, { status: result.status })
}

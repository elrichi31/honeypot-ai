import { type NextRequest } from "next/server"
import { requireRole } from "@/lib/roles"
import { proxyGet } from "@/lib/api/proxy"

export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const { clientId } = await params
  return proxyGet(`/clients/${encodeURIComponent(clientId)}/threats`)
}

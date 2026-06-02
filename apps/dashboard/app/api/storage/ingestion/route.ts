import { type NextRequest } from "next/server"
import { requireRole } from "@/lib/roles"
import { proxyGet } from "@/lib/api/proxy"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const search = new URL(request.url).search
  return proxyGet(`/storage/ingestion${search}`)
}

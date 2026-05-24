import { type NextRequest } from "next/server"
import { requireRole } from "@/lib/roles"

export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const { clientId } = await params
  const apiBase = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
  const res = await fetch(`${apiBase}/clients/${encodeURIComponent(clientId)}/today`, { cache: "no-store" })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

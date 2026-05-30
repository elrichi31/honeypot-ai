import { type NextRequest } from "next/server"
import { requireRole } from "@/lib/roles"

export const dynamic = "force-dynamic"

const apiBase = () => process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export async function GET(req: NextRequest) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const { searchParams } = req.nextUrl
  const qs = searchParams.toString()
  const res = await fetch(`${apiBase()}/stats/cross-sensor-timeline?${qs}`, { cache: "no-store" })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

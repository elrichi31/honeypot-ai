import { requireRole } from "@/lib/roles"

export const dynamic = "force-dynamic"

export async function GET() {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const apiBase = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
  const res = await fetch(`${apiBase}/suricata/stats`, { cache: "no-store" })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

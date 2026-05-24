import { requireRole } from "@/lib/roles"

export const dynamic = "force-dynamic"

const apiBase = () => process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export async function GET() {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const res = await fetch(`${apiBase()}/storage/retention`, { cache: "no-store" })
  const data = await res.json()
  return Response.json(data, { status: res.status })
}

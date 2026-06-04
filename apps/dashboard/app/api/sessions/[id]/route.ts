import { NextResponse } from "next/server"
import { requireRole } from "@/lib/roles"
import { proxyJson } from "@/lib/api/server"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const { id } = await params

  const result = await proxyJson(`/sessions/${encodeURIComponent(id)}`, { timeoutMs: 3000 })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.data, { status: result.status })
}

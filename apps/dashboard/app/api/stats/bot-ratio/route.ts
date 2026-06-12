import { NextResponse } from "next/server"
import { requireRole } from "@/lib/roles"
import { readConfig } from "@/lib/server-config"

export const dynamic = "force-dynamic"

export async function GET() {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const config = readConfig()
  const apiUrl = config.ingestApiUrl ?? process.env.INTERNAL_API_URL ?? "http://localhost:3000"

  const res = await fetch(`${apiUrl}/stats/bot-ratio`, { next: { revalidate: 300 } })
  if (!res.ok) {
    return NextResponse.json({ bot: 0, human: 0, unknown: 0, total: 0, botPct: null, humanPct: null })
  }
  return NextResponse.json(await res.json())
}

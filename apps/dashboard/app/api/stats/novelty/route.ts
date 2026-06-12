import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/roles"
import { readConfig } from "@/lib/server-config"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const config = readConfig()
  const apiUrl = config.ingestApiUrl ?? process.env.INTERNAL_API_URL ?? "http://localhost:3000"
  const hours = req.nextUrl.searchParams.get("hours") ?? "24"

  const res = await fetch(`${apiUrl}/stats/novelty?hours=${hours}`, { cache: "no-store" })
  if (!res.ok) {
    return NextResponse.json({
      windowHours: Number(hours), newIps: 0, newCredPairs: 0,
      newWebPaths: 0, newCommands: 0, topNewIps: [],
    })
  }
  return NextResponse.json(await res.json())
}

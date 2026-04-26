import { NextRequest, NextResponse } from "next/server"
import { readConfig } from "@/lib/server-config"

export async function GET(req: NextRequest) {
  const config = readConfig()
  const apiUrl = config.ingestApiUrl ?? process.env.INTERNAL_API_URL ?? "http://localhost:3000"
  const timezone = config.timezone ?? process.env.DASHBOARD_TIMEZONE ?? "UTC"
  const days = req.nextUrl.searchParams.get("days") ?? "90"

  const res = await fetch(`${apiUrl}/stats/heatmap?timezone=${encodeURIComponent(timezone)}&days=${days}`)
  if (!res.ok) return NextResponse.json({ cells: [], maxCount: 0, totalSessions: 0, hourTotals: [], days: 90 })
  return NextResponse.json(await res.json())
}

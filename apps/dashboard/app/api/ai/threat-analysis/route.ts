import { NextRequest, NextResponse } from "next/server"
import { getOpenAiKey } from "@/lib/server-config"
import type { ThreatDetail } from "@/lib/api"
import { requireRole } from "@/lib/roles"
import { logAndRespond } from "@/lib/api-error"
import { analyzeThreat } from "@/lib/ai/threat-analyze"
import { readAiThreatCache } from "@/lib/ai/threat-cache"

export type { ThreatAnalysis, ThreatSource } from "@/lib/ai/threat-analyze"

export async function GET(req: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  const ip = req.nextUrl.searchParams.get("ip")
  if (!ip) return NextResponse.json(null)

  return NextResponse.json(await readAiThreatCache(ip))
}

export async function POST(req: NextRequest) {
  const auth_check = await requireRole("analyst")
  if (!auth_check.ok) return auth_check.response

  if (!getOpenAiKey()) {
    return NextResponse.json({ error: "OpenAI API key no configurada." }, { status: 503 })
  }

  const { ip, threat } = (await req.json()) as { ip: string; threat: ThreatDetail }

  try {
    return NextResponse.json(await analyzeThreat(ip, threat))
  } catch (err: unknown) {
    return logAndRespond(err, { route: "/api/ai/threat-analysis", ip })
  }
}

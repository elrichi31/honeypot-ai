import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/roles"
import { enrichIp } from "@/lib/ip-enrichment"

// Re-export types so existing client imports keep working
export type {
  AbuseReport,
  AbuseIpData,
  IpInfoData,
  IpEnrichment,
} from "@/lib/ip-enrichment"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ip: string }> }
) {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const { ip } = await params
  const srcIp = decodeURIComponent(ip)

  const result = await enrichIp(srcIp)
  return NextResponse.json(result)
}

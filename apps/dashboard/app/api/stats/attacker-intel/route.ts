import { NextResponse } from "next/server"
import { requireRole } from "@/lib/roles"
import { db } from "@/lib/db"
import { readConfig } from "@/lib/server-config"

// Aggregate enrichment data from ip_enrichment_cache to build an ASN /
// hosting-type breakdown over recently-active IPs. We pull IPs from
// ingest-api (geo summary), then join against the local enrichment cache.

export const dynamic = "force-dynamic"

export async function GET() {
  const auth_check = await requireRole("viewer")
  if (!auth_check.ok) return auth_check.response

  const config = readConfig()
  const apiUrl = config.ingestApiUrl ?? process.env.INTERNAL_API_URL ?? "http://localhost:3000"

  // Get active IPs from ingest-api (90-day geo summary — just need the IP list)
  let activeIps: string[] = []
  try {
    const res = await fetch(`${apiUrl}/stats/geo`, { next: { revalidate: 600 } })
    if (res.ok) {
      const data: { srcIp: string }[] = await res.json()
      activeIps = data.map((r) => r.srcIp).filter(Boolean)
    }
  } catch {
    // Proceed with empty list — will return zeros
  }

  if (activeIps.length === 0) {
    return NextResponse.json(empty())
  }

  // Query enrichment cache for these IPs. ipinfo_data has asn, org, isHosting,
  // isVpn, isTor, isProxy. abuseipdb_data has isTor, isVpn as fallback.
  const { rows } = await db.query<{
    ip: string
    ipinfo: {
      asn: string
      org: string
      isHosting: boolean
      isVpn: boolean
      isProxy: boolean
      isTor: boolean
    } | null
    abuse: { isTor: boolean; isVpn: boolean } | null
  }>(
    `SELECT ip,
            ipinfo_data   AS ipinfo,
            abuseipdb_data AS abuse
     FROM ip_enrichment_cache
     WHERE ip = ANY($1::text[])`,
    [activeIps]
  )

  // ── ASN aggregation ─────────────────────────────────────────────────────────
  const asnMap = new Map<string, { org: string; count: number }>()
  let hosting = 0, vpn = 0, tor = 0, proxy = 0, residential = 0, unenriched = 0

  const enrichedSet = new Set(rows.map((r) => r.ip))

  for (const row of rows) {
    const info = row.ipinfo
    const abuse = row.abuse

    const isHosting = info?.isHosting ?? false
    const isVpn     = (info?.isVpn ?? false) || (abuse?.isVpn ?? false)
    const isTor     = (info?.isTor ?? false) || (abuse?.isTor ?? false)
    const isProxy   = info?.isProxy ?? false

    if (isTor)          tor++
    else if (isVpn)     vpn++
    else if (isProxy)   proxy++
    else if (isHosting) hosting++
    else                residential++

    if (info?.asn) {
      const key = info.asn
      const existing = asnMap.get(key)
      if (existing) existing.count++
      else asnMap.set(key, { org: info.org ?? key, count: 1 })
    }
  }

  // IPs in activeIps that have no enrichment cache entry
  unenriched = activeIps.filter((ip) => !enrichedSet.has(ip)).length

  const topAsns = Array.from(asnMap.entries())
    .map(([asn, { org, count }]) => ({ asn, org, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const total = activeIps.length
  const enriched = rows.length

  return NextResponse.json({
    total,
    enriched,
    unenriched,
    hostingTypes: { hosting, vpn, tor, proxy, residential },
    topAsns,
  })
}

function empty() {
  return {
    total: 0,
    enriched: 0,
    unenriched: 0,
    hostingTypes: { hosting: 0, vpn: 0, tor: 0, proxy: 0, residential: 0 },
    topAsns: [],
  }
}

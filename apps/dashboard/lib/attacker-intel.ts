// Server-only. Reads ip_enrichment_cache directly to build ASN / hosting-type
// breakdowns — no HTTP round-trip needed since we share the same Postgres DB.
import { db } from "@/lib/db"
import type { AttackerIntel } from "@/lib/api/types"

export async function fetchAttackerIntel(activeIps: string[]): Promise<AttackerIntel> {
  if (activeIps.length === 0) return empty()

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
    `SELECT ip, ipinfo_data AS ipinfo, abuseipdb_data AS abuse
     FROM ip_enrichment_cache
     WHERE ip = ANY($1::text[])`,
    [activeIps]
  )

  const asnMap = new Map<string, { org: string; count: number }>()
  let hosting = 0, vpn = 0, tor = 0, proxy = 0, residential = 0

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
      const existing = asnMap.get(info.asn)
      if (existing) existing.count++
      else asnMap.set(info.asn, { org: info.org ?? info.asn, count: 1 })
    }
  }

  const topAsns = Array.from(asnMap.entries())
    .map(([asn, { org, count }]) => ({ asn, org, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return {
    total: activeIps.length,
    enriched: rows.length,
    unenriched: activeIps.filter((ip) => !enrichedSet.has(ip)).length,
    hostingTypes: { hosting, vpn, tor, proxy, residential },
    topAsns,
  }
}

function empty(): AttackerIntel {
  return {
    total: 0, enriched: 0, unenriched: 0,
    hostingTypes: { hosting: 0, vpn: 0, tor: 0, proxy: 0, residential: 0 },
    topAsns: [],
  }
}

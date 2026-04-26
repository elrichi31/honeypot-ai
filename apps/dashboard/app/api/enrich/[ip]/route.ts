import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { readConfig } from "@/lib/server-config"

export interface AbuseIpData {
  abuseConfidenceScore: number
  totalReports: number
  lastReportedAt: string | null
  isp: string
  usageType: string
  isVpn: boolean
  countryCode: string
}

export interface IpInfoData {
  org: string
  hostname: string
  city: string
  region: string
  country: string
  timezone: string
  loc: string
  postal: string
  asn: string
  isHosting: boolean
  isVpn: boolean
  isProxy: boolean
  isTor: boolean
}

export interface IpEnrichment {
  ip: string
  abuseipdb: AbuseIpData | null
  ipinfo: IpInfoData | null
  cachedAt: string
}

const ABUSE_TTL_MS  = 7  * 24 * 60 * 60 * 1000  // 7 days
const IPINFO_TTL_MS = 30 * 24 * 60 * 60 * 1000  // 30 days

function isStale(fetchedAt: Date | null, ttl: number): boolean {
  if (!fetchedAt) return true
  return Date.now() - fetchedAt.getTime() > ttl
}

async function fetchAbuseIpDb(ip: string, apiKey: string): Promise<AbuseIpData | null> {
  try {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
      { headers: { Key: apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const d = (await res.json()).data
    return {
      abuseConfidenceScore: d.abuseConfidenceScore ?? 0,
      totalReports: d.totalReports ?? 0,
      lastReportedAt: d.lastReportedAt ?? null,
      isp: d.isp ?? "",
      usageType: d.usageType ?? "",
      isVpn: d.isVpn ?? false,
      countryCode: d.countryCode ?? "",
    }
  } catch { return null }
}

async function fetchIpInfo(ip: string, apiKey: string): Promise<IpInfoData | null> {
  try {
    const token = apiKey ? `?token=${encodeURIComponent(apiKey)}` : ""
    const res = await fetch(
      `https://ipinfo.io/${encodeURIComponent(ip)}/json${token}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return null
    const d = await res.json()
    const privacy = d.privacy ?? {}
    const org: string = d.org ?? ""
    const asnMatch = org.match(/^(AS\d+)\s+(.+)$/)
    return {
      org: asnMatch ? asnMatch[2] : org,
      asn: asnMatch ? asnMatch[1] : "",
      hostname: d.hostname ?? "",
      city: d.city ?? "",
      region: d.region ?? "",
      country: d.country ?? "",
      timezone: d.timezone ?? "",
      loc: d.loc ?? "",
      postal: d.postal ?? "",
      isHosting: privacy.hosting ?? false,
      isVpn: privacy.vpn ?? false,
      isProxy: privacy.proxy ?? false,
      isTor: privacy.tor ?? false,
    }
  } catch { return null }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ip: string }> }
) {
  const { ip } = await params
  const srcIp = decodeURIComponent(ip)
  const config = readConfig()

  // Read existing cache row
  const { rows } = await db.query(
    `SELECT abuseipdb_data, ipinfo_data, abuseipdb_fetched_at, ipinfo_fetched_at, cached_at
     FROM ip_enrichment_cache WHERE ip = $1`,
    [srcIp]
  )
  const row = rows[0] ?? null

  let abuseipdb: AbuseIpData | null = row?.abuseipdb_data ?? null
  let ipinfo: IpInfoData | null = row?.ipinfo_data ?? null
  let abuseipdbFetchedAt: Date | null = row?.abuseipdb_fetched_at ?? null
  let ipinfoFetchedAt: Date | null = row?.ipinfo_fetched_at ?? null
  let dirty = false

  if (config.abuseipdbApiKey && isStale(abuseipdbFetchedAt, ABUSE_TTL_MS)) {
    const data = await fetchAbuseIpDb(srcIp, config.abuseipdbApiKey)
    if (data) { abuseipdb = data; abuseipdbFetchedAt = new Date(); dirty = true }
  }

  if (isStale(ipinfoFetchedAt, IPINFO_TTL_MS)) {
    const data = await fetchIpInfo(srcIp, config.ipinfoApiKey ?? "")
    if (data) { ipinfo = data; ipinfoFetchedAt = new Date(); dirty = true }
  }

  const cachedAt = dirty ? new Date() : (row?.cached_at ?? new Date())

  if (dirty) {
    await db.query(
      `INSERT INTO ip_enrichment_cache
         (ip, abuseipdb_data, ipinfo_data, abuseipdb_fetched_at, ipinfo_fetched_at, cached_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (ip) DO UPDATE SET
         abuseipdb_data        = EXCLUDED.abuseipdb_data,
         ipinfo_data           = EXCLUDED.ipinfo_data,
         abuseipdb_fetched_at  = EXCLUDED.abuseipdb_fetched_at,
         ipinfo_fetched_at     = EXCLUDED.ipinfo_fetched_at,
         cached_at             = EXCLUDED.cached_at`,
      [srcIp, abuseipdb, ipinfo, abuseipdbFetchedAt, ipinfoFetchedAt, cachedAt]
    )
  }

  return NextResponse.json({
    ip: srcIp,
    abuseipdb,
    ipinfo,
    cachedAt: cachedAt.toISOString(),
  } satisfies IpEnrichment)
}

import { db } from "@/lib/db"
import { readConfig } from "@/lib/server-config"
import { sendDiscordAlert } from "@/lib/discord"
import { fetchSpectraAnalyzeIpReport, type SpectraAnalyzeIpReport } from "@/lib/spectra-analyze"

export interface AbuseReport {
  reportedAt: string
  comment: string
  categories: number[]
  reporterCountryCode: string
  reporterCountryName: string
}

export interface AbuseIpData {
  abuseConfidenceScore: number
  totalReports: number
  numDistinctUsers: number
  lastReportedAt: string | null
  isp: string
  domain: string
  hostnames: string[]
  usageType: string
  countryCode: string
  countryName: string
  isVpn: boolean
  isTor: boolean
  isWhitelisted: boolean
  reports: AbuseReport[]
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
  spectraAnalyze: SpectraAnalyzeIpReport | null
  cachedAt: string
}

const ABUSE_TTL_MS  = 7  * 24 * 60 * 60 * 1000
const IPINFO_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SPECTRA_TTL_MS = 7 * 24 * 60 * 60 * 1000

function isStale(fetchedAt: Date | null, ttl: number): boolean {
  if (!fetchedAt) return true
  return Date.now() - fetchedAt.getTime() > ttl
}

export async function fetchAbuseIpDb(ip: string, apiKey: string): Promise<AbuseIpData | null> {
  try {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90&verbose`,
      { headers: { Key: apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const d = (await res.json()).data
    const reports: AbuseReport[] = (d.reports ?? []).slice(0, 10).map((r: any) => ({
      reportedAt: r.reportedAt ?? "",
      comment: r.comment ?? "",
      categories: r.categories ?? [],
      reporterCountryCode: r.fromIpCountryCode ?? r.reporterCountryCode ?? "",
      reporterCountryName: r.fromIpCountryName ?? r.reporterCountryName ?? "",
    }))
    return {
      abuseConfidenceScore: d.abuseConfidenceScore ?? 0,
      totalReports: d.totalReports ?? 0,
      numDistinctUsers: d.numDistinctUsers ?? 0,
      lastReportedAt: d.lastReportedAt ?? null,
      isp: d.isp ?? "",
      domain: d.domain ?? "",
      hostnames: d.hostnames ?? [],
      usageType: d.usageType ?? "",
      countryCode: d.countryCode ?? "",
      countryName: d.countryName ?? "",
      isVpn: d.isVpn ?? false,
      isTor: d.isTor ?? false,
      isWhitelisted: d.isWhitelisted ?? false,
      reports,
    }
  } catch { return null }
}

export async function fetchIpInfo(ip: string, apiKey: string): Promise<IpInfoData | null> {
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

/**
 * Enriquece una IP con AbuseIPDB + ipinfo, usando la caché en BD
 * (ip_enrichment_cache) con los mismos TTLs que el endpoint /api/enrich.
 * Reutilizable desde cualquier flujo de servidor (ej: auditoría de login).
 */
export async function enrichIp(ip: string): Promise<IpEnrichment> {
  const config = readConfig()

  const { rows } = await db.query(
    `SELECT abuseipdb_data, ipinfo_data, abuseipdb_fetched_at, ipinfo_fetched_at, cached_at
            , spectra_analyze_data, spectra_analyze_fetched_at
     FROM ip_enrichment_cache WHERE ip = $1`,
    [ip]
  )
  const row = rows[0] ?? null

  let abuseipdb: AbuseIpData | null = row?.abuseipdb_data ?? null
  let ipinfo: IpInfoData | null = row?.ipinfo_data ?? null
  let spectraAnalyze: SpectraAnalyzeIpReport | null = row?.spectra_analyze_data ?? null
  let abuseipdbFetchedAt: Date | null = row?.abuseipdb_fetched_at ?? null
  let ipinfoFetchedAt: Date | null = row?.ipinfo_fetched_at ?? null
  let spectraAnalyzeFetchedAt: Date | null = row?.spectra_analyze_fetched_at ?? null
  let dirty = false

  const wasNewAbuse = !row?.abuseipdb_data
  if (config.abuseipdbApiKey && isStale(abuseipdbFetchedAt, ABUSE_TTL_MS)) {
    const data = await fetchAbuseIpDb(ip, config.abuseipdbApiKey)
    if (data) {
      abuseipdb = data; abuseipdbFetchedAt = new Date(); dirty = true
      if (wasNewAbuse && data.abuseConfidenceScore >= 80) {
        sendDiscordAlert({
          level: "critical",
          title: "🚨 IP altamente maliciosa detectada",
          description: `**${ip}** tiene un score de abuso de **${data.abuseConfidenceScore}%** en AbuseIPDB`,
          fields: [
            { name: "ISP", value: data.isp || "desconocido", inline: true },
            { name: "Reportes", value: data.totalReports.toLocaleString('en-US'), inline: true },
            { name: "País", value: data.countryName || data.countryCode || "—", inline: true },
          ],
        })
      }
    }
  }

  if (isStale(ipinfoFetchedAt, IPINFO_TTL_MS)) {
    const data = await fetchIpInfo(ip, config.ipinfoApiKey ?? "")
    if (data) { ipinfo = data; ipinfoFetchedAt = new Date(); dirty = true }
  }

  if (config.spectraAnalyzeUrl && config.spectraAnalyzeToken && isStale(spectraAnalyzeFetchedAt, SPECTRA_TTL_MS)) {
    const data = await fetchSpectraAnalyzeIpReport(ip, config.spectraAnalyzeUrl, config.spectraAnalyzeToken)
    if (data) {
      spectraAnalyze = data
      spectraAnalyzeFetchedAt = new Date()
      dirty = true
    }
  }

  const cachedAt = dirty ? new Date() : (row?.cached_at ?? new Date())

  if (dirty) {
    await db.query(
      `INSERT INTO ip_enrichment_cache
         (ip, abuseipdb_data, ipinfo_data, spectra_analyze_data, abuseipdb_fetched_at, ipinfo_fetched_at, spectra_analyze_fetched_at, cached_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (ip) DO UPDATE SET
         abuseipdb_data        = EXCLUDED.abuseipdb_data,
         ipinfo_data           = EXCLUDED.ipinfo_data,
         spectra_analyze_data  = EXCLUDED.spectra_analyze_data,
         abuseipdb_fetched_at  = EXCLUDED.abuseipdb_fetched_at,
         ipinfo_fetched_at     = EXCLUDED.ipinfo_fetched_at,
         spectra_analyze_fetched_at = EXCLUDED.spectra_analyze_fetched_at,
         cached_at             = EXCLUDED.cached_at`,
      [ip, abuseipdb, ipinfo, spectraAnalyze, abuseipdbFetchedAt, ipinfoFetchedAt, spectraAnalyzeFetchedAt, cachedAt]
    )
  }

  return {
    ip, abuseipdb, ipinfo, spectraAnalyze,
    cachedAt: cachedAt.toISOString(),
  }
}

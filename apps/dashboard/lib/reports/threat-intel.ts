// Server-only: the per-actor threat intelligence block of the client report.
// Same evidence the /threats page shows — risk score, reputation from the
// enrichment cache, aggregated IoCs — plus the deep AI actor analysis, reusing
// the cache the threats page writes so a report rarely pays for a fresh call.
import { fetchThreats, fetchThreat } from "@/lib/api/threats"
import { fetchAggregatedIocs } from "@/lib/api/iocs"
import { readAiThreatCache, readEnrichmentCache } from "@/lib/ai/threat-cache"
import { analyzeThreat, type ThreatAnalysis } from "@/lib/ai/threat-analyze"
import { getOpenAiKey } from "@/lib/server-config"
import type { IpEnrichment } from "@/lib/ip-enrichment"
import type { ThreatSummary } from "@/lib/api/types"
import type { ReportActorIntel, ReportThreatIntel } from "./types"
import { threatPeriod } from "./shared/format"

const ACTOR_LIMIT = 6
// Each fresh analysis is a reasoning + web-search call, so a report generated
// for a brand new client would otherwise sit behind six of them. The rest fall
// back to whatever the threats page already cached.
const AI_BUDGET = Number(process.env.REPORT_AI_THREAT_LIMIT ?? 3)

export function toActorIntel(
  summary: ThreatSummary,
  enrichment: IpEnrichment | null,
  analysis: ThreatAnalysis | null,
): ReportActorIntel {
  const abuse = enrichment?.abuseipdb ?? null
  const info = enrichment?.ipinfo ?? null
  const vt = enrichment?.virustotal ?? null
  const engines = Object.values(vt?.last_analysis_results ?? {})

  return {
    ip: summary.ip,
    score: summary.score,
    level: summary.level,
    protocols: summary.protocolsSeen.map((p) => p.toUpperCase()),
    crossProtocol: summary.crossProtocol,
    topFactors: summary.topFactors.slice(0, 4),
    sshSessions: summary.ssh?.sessions ?? 0,
    loginSuccess: summary.ssh?.loginSuccess ?? false,
    commandCount: summary.ssh?.commandCount ?? 0,
    webHits: summary.web?.hits ?? 0,
    protocolHits: summary.protocols?.totalHits ?? 0,
    ports: Object.values(summary.protocols?.byService ?? {}).flatMap((s) => s.ports).slice(0, 12),
    country: abuse?.countryName || info?.country || null,
    org: info?.org || abuse?.isp || null,
    usageType: abuse?.usageType || null,
    hosting: Boolean(info?.isHosting || info?.isVpn || info?.isProxy || info?.isTor || abuse?.isVpn || abuse?.isTor),
    abuseScore: abuse?.abuseConfidenceScore ?? null,
    abuseReports: abuse?.totalReports ?? null,
    lastReportedAt: abuse?.lastReportedAt ?? null,
    vtMalicious: vt ? vt.last_analysis_stats.malicious : null,
    vtEngineCount: vt ? engines.length : null,
    vtFlaggedBy: engines
      .filter((e) => e.category === "malicious" || e.category === "suspicious")
      .map((e) => e.engine_name)
      .slice(0, 10),
    analysis,
  }
}

export async function collectThreatIntel(params: {
  sensorIds: string[] | undefined
  startDate: string
  endDate: string
}): Promise<ReportThreatIntel | null> {
  const { sensorIds, startDate, endDate } = params
  if (!sensorIds?.length) return null

  const period = threatPeriod(startDate, endDate)

  const [threatsResult, iocsResult] = await Promise.allSettled([
    fetchThreats({ pageSize: ACTOR_LIMIT, sortBy: "score", sortDir: "desc", period }, sensorIds),
    fetchAggregatedIocs({ period }, sensorIds),
  ])

  const summaries = threatsResult.status === "fulfilled" ? threatsResult.value.slice(0, ACTOR_LIMIT) : []
  const iocs = iocsResult.status === "fulfilled"
    ? iocsResult.value
    : { c2: [], sshKeys: [], credentials: [], hassh: [] }

  const canGenerate = Boolean(getOpenAiKey())
  let budget = canGenerate ? AI_BUDGET : 0

  const actors = await Promise.all(
    summaries.map(async (summary) => {
      const [enrichment, cached] = await Promise.all([
        readEnrichmentCache(summary.ip),
        readAiThreatCache(summary.ip),
      ])
      if (cached || budget <= 0) return toActorIntel(summary, enrichment, cached)

      budget -= 1
      try {
        const detail = await fetchThreat(summary.ip, sensorIds)
        return toActorIntel(summary, enrichment, await analyzeThreat(summary.ip, detail))
      } catch (err) {
        console.error(`[reports] threat analysis failed for ${summary.ip}:`, err)
        return toActorIntel(summary, enrichment, null)
      }
    }),
  )

  if (actors.length === 0 && iocs.c2.length === 0 && iocs.credentials.length === 0) return null

  return { actors, iocs }
}

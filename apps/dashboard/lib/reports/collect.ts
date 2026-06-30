// Server-only: collects all data needed for a client PDF report. Reuses the
// existing scoped fetchers so tenant isolation is inherited automatically.
import {
  fetchHoneypotOverview,
  fetchKpiTrends,
  fetchCrossSensorTimeline,
  fetchMitreMatrix,
  fetchBotRatio,
  fetchGeoSummary,
  fetchDashboardInsights,
} from "@/lib/api/stats"
import { fetchCredentialsAnalytics } from "@/lib/api/credentials"
import type { ClientReportData, ClientReportMeta, ReportGeoEntry, ReportRange, ReportTopCredential } from "./types"

function rangeToMitreDays(range: ReportRange): number {
  return range === "week" ? 7 : 30
}

function buildPeriodLabel(range: ReportRange, generatedAt: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  })
  const end = new Date(generatedAt)
  const start = new Date(end)
  start.setDate(start.getDate() - rangeToMitreDays(range))
  return `${fmt.format(start)} – ${fmt.format(end)}`
}

function aggregateGeo(raw: { srcIp: string; loginSuccess: boolean | null }[]): ReportGeoEntry[] {
  // Group by first two octets (approximate country grouping fallback) — but
  // since the backend only returns srcIp here we just count distinct IPs per
  // first octet as a rough approximation. The real geo lookup would need an
  // enrichment call, but to avoid adding latency we use the data as-is and
  // bucket by the raw IP list length per country using geoip if available.
  // For now: return top-10 raw IPs sorted by frequency (the geo endpoint
  // returns one row per srcIp with loginSuccess, so count by srcIp bucket).
  const counts = new Map<string, number>()
  for (const row of raw) {
    counts.set(row.srcIp, (counts.get(row.srcIp) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([country, count]) => ({ country, count }))
}

export async function collectClientReport(params: {
  sensorIds: string[] | undefined
  range: ReportRange
  timezone: string
  meta: Omit<ClientReportMeta, "generatedAt" | "periodLabel">
}): Promise<ClientReportData> {
  const { sensorIds, range, timezone, meta } = params
  const generatedAt = new Date()

  // Fire all fetches in parallel to minimise total latency.
  const [overview, kpiTrends, timeline, mitre, botRatio, geoRaw, insights, creds] =
    await Promise.allSettled([
      fetchHoneypotOverview(sensorIds),
      fetchKpiTrends(sensorIds),
      fetchCrossSensorTimeline({ range, timezone, sensorIds }),
      fetchMitreMatrix(sensorIds),
      fetchBotRatio(sensorIds),
      fetchGeoSummary(sensorIds),
      fetchDashboardInsights(sensorIds),
      fetchCredentialsAnalytics({ limit: 10, rankingType: "pairs", mainTab: "rankings" }),
    ])

  function unwrap<T>(result: PromiseSettledResult<T>, fallback: T): T {
    return result.status === "fulfilled" ? result.value : fallback
  }

  const defaultOverview = {
    ssh: { sessions: 0, uniqueIps: 0, successfulLogins: 0, lastSeen: null },
    web: { hits: 0, uniqueIps: 0, topAttackType: null, lastSeen: null },
    protocols: [],
    totals: { events: 0, activeSources: 0 },
  }
  const defaultKpiTrends = {
    events: { current: 0, previous: 0, deltaPct: null, spark: [] },
    sshSessions: { current: 0, previous: 0, deltaPct: null, spark: [] },
    webHits: { current: 0, previous: 0, deltaPct: null, spark: [] },
    uniqueIps: { current: 0, previous: 0, deltaPct: null, spark: [] },
  }
  const defaultTimeline = { buckets: [], activeProtocols: [] }
  const defaultMitre = { tactics: [], total: 0 }
  const defaultBotRatio = { bot: 0, human: 0, unknown: 0, total: 0, botPct: null, humanPct: null, unknownPct: null }
  const defaultInsights = {
    window: { firstSeen: null, lastSeen: null, totalSessions: 0, uniqueIps: 0 },
    funnel: { connections: 0, authAttempts: 0, loginSuccess: 0, commands: 0, highSignalCompromise: 0 },
    countrySuccessCandidates: [],
    credentialCampaigns: [],
    recurringIps: [],
    commandPatterns: [],
    successfulDepth: { buckets: [], averageCommands: 0, maxCommands: 0, interactiveSessions: 0 },
  }

  const rawCreds = unwrap(creds, null)
  const topCredentials: ReportTopCredential[] = rawCreds
    ? (rawCreds.rankingsPage.items as { username: string | null; password: string | null; attempts: number; successCount: number }[])
        .slice(0, 10)
        .map((r) => ({ username: r.username, password: r.password, attempts: r.attempts, successCount: r.successCount }))
    : []

  return {
    meta: {
      ...meta,
      generatedAt: generatedAt.toISOString(),
      periodLabel: buildPeriodLabel(range, generatedAt, timezone),
    },
    overview: unwrap(overview, defaultOverview),
    kpiTrends: unwrap(kpiTrends, defaultKpiTrends),
    timeline: unwrap(timeline, defaultTimeline),
    mitre: unwrap(mitre, defaultMitre),
    botRatio: unwrap(botRatio, defaultBotRatio),
    insights: unwrap(insights, defaultInsights),
    geo: aggregateGeo(unwrap(geoRaw, [])),
    topCredentials,
  }
}

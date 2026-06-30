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
import { lookupIp } from "@/lib/geo"
import type { ClientReportData, ClientReportMeta, ReportGeoEntry, ReportRange, ReportTopCredential } from "./types"

function rangeToDays(range: ReportRange): number {
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
  start.setDate(start.getDate() - rangeToDays(range))
  return `${fmt.format(start)} - ${fmt.format(end)}`
}

function buildPeriodStart(range: ReportRange, generatedAt: Date): Date {
  const start = new Date(generatedAt)
  start.setDate(start.getDate() - rangeToDays(range))
  return start
}

function aggregateGeo(raw: { srcIp: string; loginSuccess: boolean | null }[]): ReportGeoEntry[] {
  const countries = new Map<string, { countryCode: string; count: number; successCount: number }>()

  for (const row of raw) {
    const geo = lookupIp(row.srcIp)
    if (!geo?.country || !geo.countryName) continue

    const current = countries.get(geo.countryName) ?? {
      countryCode: geo.country,
      count: 0,
      successCount: 0,
    }
    current.count += 1
    if (row.loginSuccess === true) current.successCount += 1
    countries.set(geo.countryName, current)
  }

  const total = Array.from(countries.values()).reduce((sum, entry) => sum + entry.count, 0)

  return Array.from(countries.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([country, entry]) => ({
      country,
      countryCode: entry.countryCode,
      count: entry.count,
      successCount: entry.successCount,
      share: total > 0 ? (entry.count / total) * 100 : 0,
    }))
}

export async function collectClientReport(params: {
  sensorIds: string[] | undefined
  range: ReportRange
  timezone: string
  meta: Omit<ClientReportMeta, "generatedAt" | "periodLabel">
}): Promise<ClientReportData> {
  const { sensorIds, range, timezone, meta } = params
  const generatedAt = new Date()
  const startDate = buildPeriodStart(range, generatedAt).toISOString()
  const endDate = generatedAt.toISOString()

  const [overview, kpiTrends, timeline, mitre, botRatio, geoRaw, insights, creds] =
    await Promise.allSettled([
      fetchHoneypotOverview(sensorIds),
      fetchKpiTrends(sensorIds),
      fetchCrossSensorTimeline({ range, timezone, sensorIds }),
      fetchMitreMatrix(sensorIds),
      fetchBotRatio(sensorIds),
      fetchGeoSummary(sensorIds),
      fetchDashboardInsights(sensorIds),
      fetchCredentialsAnalytics({
        limit: 10,
        rankingType: "pairs",
        mainTab: "rankings",
        clientSlug: meta.clientSlug,
        startDate,
        endDate,
      }),
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
        .map((row) => ({
          username: row.username,
          password: row.password,
          attempts: row.attempts,
          successCount: row.successCount,
        }))
    : []

  const credentialSummary = rawCreds?.summary ?? {
    totalAttempts: 0,
    successfulAttempts: 0,
    failedAttempts: 0,
    uniqueUsernames: 0,
    uniquePasswords: 0,
    uniqueCredentialPairs: 0,
    repeatedCredentialPairs: 0,
    sprayPasswords: 0,
    targetedUsernames: 0,
    successRate: 0,
  }

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
    credentialSummary,
    diversifiedAttackers: rawCreds?.diversifiedAttackers?.slice(0, 8) ?? [],
  }
}

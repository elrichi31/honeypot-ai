// Server-only: collects all data needed for a client PDF report. Reuses the
// existing scoped fetchers so tenant isolation is inherited automatically.
import {
  fetchHoneypotOverview,
  fetchKpiTrends,
  fetchCrossSensorTimeline,
  fetchMitreMatrix,
  fetchBotRatio,
  fetchDashboardInsights,
} from "@/lib/api/stats"
import { fetchCredentialsAnalytics } from "@/lib/api/credentials"
import { db } from "@/lib/db"
import { lookupIp } from "@/lib/geo"
import type {
  ClientReportData,
  ClientReportMeta,
  ReportGeoEntry,
  ReportRange,
  ReportTopCredential,
} from "./types"
import type { KpiTrends } from "@/lib/api/types"
import { buildPeriodLabel, buildPeriodStart } from "./shared/format"
import { collectSensorProfiles } from "./sensors/collect"

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

async function collectGeoSummary(
  sensorIds: string[] | undefined,
  startDate: string,
  endDate: string,
): Promise<{ srcIp: string; loginSuccess: boolean | null }[]> {
  if (!sensorIds?.length) return []

  const { rows } = await db.query<{ src_ip: string; login_success: boolean | null }>(
    `WITH geo_events AS (
       SELECT src_ip, login_success
       FROM sessions
       WHERE sensor_id = ANY($1::text[])
         AND started_at >= $2::timestamptz
         AND started_at <= $3::timestamptz
       UNION ALL
       SELECT src_ip, NULL::boolean AS login_success
       FROM web_hits
       WHERE sensor_id = ANY($1::text[])
         AND timestamp >= $2::timestamptz
         AND timestamp <= $3::timestamptz
       UNION ALL
       SELECT src_ip, NULL::boolean AS login_success
       FROM protocol_hits
       WHERE COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
         AND timestamp >= $2::timestamptz
         AND timestamp <= $3::timestamptz
     )
     SELECT src_ip, login_success FROM geo_events`,
    [sensorIds, startDate, endDate],
  )

  return rows.map((row) => ({
    srcIp: row.src_ip,
    loginSuccess: row.login_success,
  }))
}

function computeDelta(current: number, previous: number) {
  if (previous === 0) return null
  return Number((((current - previous) / previous) * 100).toFixed(1))
}

async function collectReportKpis(
  sensorIds: string[] | undefined,
  startDate: string,
  endDate: string,
): Promise<KpiTrends> {
  if (!sensorIds?.length) {
    return {
      events: { current: 0, previous: 0, deltaPct: null, spark: [] },
      sshSessions: { current: 0, previous: 0, deltaPct: null, spark: [] },
      webHits: { current: 0, previous: 0, deltaPct: null, spark: [] },
      uniqueIps: { current: 0, previous: 0, deltaPct: null, spark: [] },
    }
  }

  const currentStart = new Date(startDate)
  const currentEnd = new Date(endDate)
  const durationMs = currentEnd.getTime() - currentStart.getTime()
  const previousEnd = currentStart
  const previousStart = new Date(currentStart.getTime() - durationMs)

  const { rows } = await db.query<{
    ssh_current: string
    ssh_previous: string
    web_current: string
    web_previous: string
    proto_current: string
    proto_previous: string
    unique_ips_current: string
    unique_ips_previous: string
  }>(
    `WITH ssh_current AS (
       SELECT COUNT(*)::bigint AS count
       FROM sessions
       WHERE sensor_id = ANY($1::text[])
         AND started_at >= $2::timestamptz AND started_at <= $3::timestamptz
     ),
     ssh_previous AS (
       SELECT COUNT(*)::bigint AS count
       FROM sessions
       WHERE sensor_id = ANY($1::text[])
         AND started_at >= $4::timestamptz AND started_at < $2::timestamptz
     ),
     web_current AS (
       SELECT COUNT(*)::bigint AS count
       FROM web_hits
       WHERE sensor_id = ANY($1::text[])
         AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
     ),
     web_previous AS (
       SELECT COUNT(*)::bigint AS count
       FROM web_hits
       WHERE sensor_id = ANY($1::text[])
         AND timestamp >= $4::timestamptz AND timestamp < $2::timestamptz
     ),
     proto_current AS (
       SELECT COUNT(*)::bigint AS count
       FROM protocol_hits
       WHERE COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
         AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
     ),
     proto_previous AS (
       SELECT COUNT(*)::bigint AS count
       FROM protocol_hits
       WHERE COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
         AND timestamp >= $4::timestamptz AND timestamp < $2::timestamptz
     ),
     unique_ips_current AS (
       SELECT COUNT(DISTINCT src_ip)::bigint AS count FROM (
         SELECT src_ip FROM sessions
         WHERE sensor_id = ANY($1::text[])
           AND started_at >= $2::timestamptz AND started_at <= $3::timestamptz
         UNION ALL
         SELECT src_ip FROM web_hits
         WHERE sensor_id = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         UNION ALL
         SELECT src_ip FROM protocol_hits
         WHERE COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
           AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
       ) u
     ),
     unique_ips_previous AS (
       SELECT COUNT(DISTINCT src_ip)::bigint AS count FROM (
         SELECT src_ip FROM sessions
         WHERE sensor_id = ANY($1::text[])
           AND started_at >= $4::timestamptz AND started_at < $2::timestamptz
         UNION ALL
         SELECT src_ip FROM web_hits
         WHERE sensor_id = ANY($1::text[])
           AND timestamp >= $4::timestamptz AND timestamp < $2::timestamptz
         UNION ALL
         SELECT src_ip FROM protocol_hits
         WHERE COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
           AND timestamp >= $4::timestamptz AND timestamp < $2::timestamptz
       ) u
     )
     SELECT
       (SELECT count::text FROM ssh_current) AS ssh_current,
       (SELECT count::text FROM ssh_previous) AS ssh_previous,
       (SELECT count::text FROM web_current) AS web_current,
       (SELECT count::text FROM web_previous) AS web_previous,
       (SELECT count::text FROM proto_current) AS proto_current,
       (SELECT count::text FROM proto_previous) AS proto_previous,
       (SELECT count::text FROM unique_ips_current) AS unique_ips_current,
       (SELECT count::text FROM unique_ips_previous) AS unique_ips_previous`,
    [sensorIds, startDate, endDate, previousStart.toISOString()],
  )

  const raw = rows[0]
  const sshCurrent = Number(raw?.ssh_current ?? 0)
  const sshPrevious = Number(raw?.ssh_previous ?? 0)
  const webCurrent = Number(raw?.web_current ?? 0)
  const webPrevious = Number(raw?.web_previous ?? 0)
  const protoCurrent = Number(raw?.proto_current ?? 0)
  const protoPrevious = Number(raw?.proto_previous ?? 0)
  const uniqueCurrent = Number(raw?.unique_ips_current ?? 0)
  const uniquePrevious = Number(raw?.unique_ips_previous ?? 0)
  const eventsCurrent = sshCurrent + webCurrent + protoCurrent
  const eventsPrevious = sshPrevious + webPrevious + protoPrevious

  return {
    events: { current: eventsCurrent, previous: eventsPrevious, deltaPct: computeDelta(eventsCurrent, eventsPrevious), spark: [] },
    sshSessions: { current: sshCurrent, previous: sshPrevious, deltaPct: computeDelta(sshCurrent, sshPrevious), spark: [] },
    webHits: { current: webCurrent, previous: webPrevious, deltaPct: computeDelta(webCurrent, webPrevious), spark: [] },
    uniqueIps: { current: uniqueCurrent, previous: uniquePrevious, deltaPct: computeDelta(uniqueCurrent, uniquePrevious), spark: [] },
  }
}

export async function collectClientReport(params: {
  sensorIds: string[] | undefined
  range: ReportRange
  timezone: string
  meta: Omit<ClientReportMeta, "generatedAt" | "periodLabel">
}): Promise<ClientReportData> {
  const { sensorIds, range, timezone, meta } = params
  console.log("[reports] collectClientReport sensorIds:", sensorIds)
  const generatedAt = new Date()
  const startDate = buildPeriodStart(range, generatedAt).toISOString()
  const endDate = generatedAt.toISOString()

  const [overview, kpiTrends, timeline, mitre, botRatio, geoRaw, insights, creds, sensorProfiles] =
    await Promise.allSettled([
      fetchHoneypotOverview(sensorIds),
      collectReportKpis(sensorIds, startDate, endDate),
      fetchCrossSensorTimeline({ range, timezone, sensorIds }),
      fetchMitreMatrix(sensorIds),
      fetchBotRatio(sensorIds),
      collectGeoSummary(sensorIds, startDate, endDate),
      fetchDashboardInsights(sensorIds),
      fetchCredentialsAnalytics({
        limit: 10,
        rankingType: "pairs",
        mainTab: "rankings",
        clientSlug: meta.clientSlug,
        startDate,
        endDate,
      }),
      collectSensorProfiles(sensorIds, startDate, endDate),
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
    sensors: unwrap(sensorProfiles, []),
    malware: unwrap(sensorProfiles, []).flatMap((sensor) => sensor.recentMalware),
  }
}

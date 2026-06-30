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
import { fetchSensors } from "@/lib/api/services"
import { lookupIp } from "@/lib/geo"
import { db } from "@/lib/db"
import type {
  ClientReportData,
  ClientReportMeta,
  ReportGeoEntry,
  ReportRange,
  ReportSensorProfile,
  ReportTopCredential,
} from "./types"

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

async function collectSensorProfiles(
  sensorIds: string[] | undefined,
  startDate: string,
  endDate: string,
): Promise<ReportSensorProfile[]> {
  if (!sensorIds?.length) return []

  const sensors = (await fetchSensors())
    .filter((sensor) => sensorIds.includes(sensor.sensorId))
    .sort((a, b) => b.eventsTotal - a.eventsTotal)

  if (!sensors.length) return []

  const totalEvents = sensors.reduce((sum, sensor) => sum + sensor.eventsTotal, 0)
  const sensorIdSet = sensors.map((sensor) => sensor.sensorId)

  const [uniqueIpRows, authRows, commandRows, topIpRows, topCredentialRows, topSignalRows, topTargetRows, malwareRows] =
    await Promise.all([
      db.query<{ sensor_id: string; unique_ips: string }>(
        `WITH per_event AS (
           SELECT sensor_id, src_ip FROM sessions
           WHERE sensor_id = ANY($1::text[]) AND started_at >= $2::timestamptz AND started_at <= $3::timestamptz
           UNION ALL
           SELECT sensor_id, src_ip FROM web_hits
           WHERE sensor_id = ANY($1::text[]) AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
           UNION ALL
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id, src_ip FROM protocol_hits
           WHERE COALESCE(sensor_id, data->>'sensor') = ANY($1::text[]) AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         )
         SELECT sensor_id, COUNT(DISTINCT src_ip)::text AS unique_ips
         FROM per_event
         GROUP BY sensor_id`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; auth_attempts: string; success_count: string }>(
        `SELECT sensor_id, COUNT(*)::text AS auth_attempts,
                COUNT(*) FILTER (WHERE success IS TRUE)::text AS success_count
         FROM credential_attempts
         WHERE sensor_id = ANY($1::text[]) AND event_ts >= $2::timestamptz AND event_ts <= $3::timestamptz
         GROUP BY sensor_id`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; command_count: string }>(
        `WITH combined AS (
           SELECT s.sensor_id, COUNT(*)::bigint AS command_count
           FROM events e
           JOIN sessions s ON s.id = e.session_id
           WHERE s.sensor_id = ANY($1::text[])
             AND e.event_type = 'command.input'
             AND e.event_ts >= $2::timestamptz
             AND e.event_ts <= $3::timestamptz
           GROUP BY s.sensor_id
           UNION ALL
           SELECT sensor_id, COUNT(*)::bigint AS command_count
           FROM protocol_hits
           WHERE sensor_id = ANY($1::text[])
             AND event_type = 'command'
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id
         )
         SELECT sensor_id, SUM(command_count)::text AS command_count
         FROM combined
         GROUP BY sensor_id`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; src_ip: string; hit_count: string }>(
        `WITH per_event AS (
           SELECT sensor_id, src_ip FROM sessions
           WHERE sensor_id = ANY($1::text[]) AND started_at >= $2::timestamptz AND started_at <= $3::timestamptz
           UNION ALL
           SELECT sensor_id, src_ip FROM web_hits
           WHERE sensor_id = ANY($1::text[]) AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
           UNION ALL
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id, src_ip FROM protocol_hits
           WHERE COALESCE(sensor_id, data->>'sensor') = ANY($1::text[]) AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         ),
         ranked AS (
           SELECT sensor_id, src_ip, COUNT(*)::bigint AS hit_count,
                  ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, src_ip ASC) AS rn
           FROM per_event
           GROUP BY sensor_id, src_ip
         )
         SELECT sensor_id, src_ip, hit_count::text
         FROM ranked
         WHERE rn <= 4`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; username: string | null; password: string | null; attempts: string; success_count: string }>(
        `WITH ranked AS (
           SELECT sensor_id, username, password,
                  COUNT(*)::bigint AS attempts,
                  COUNT(*) FILTER (WHERE success IS TRUE)::bigint AS success_count,
                  ROW_NUMBER() OVER (
                    PARTITION BY sensor_id
                    ORDER BY COUNT(*) DESC,
                             COUNT(*) FILTER (WHERE success IS TRUE) DESC,
                             COALESCE(username, '') ASC,
                             COALESCE(password, '') ASC
                  ) AS rn
           FROM credential_attempts
           WHERE sensor_id = ANY($1::text[]) AND event_ts >= $2::timestamptz AND event_ts <= $3::timestamptz
           GROUP BY sensor_id, username, password
         )
         SELECT sensor_id, username, password, attempts::text, success_count::text
         FROM ranked
         WHERE rn <= 3`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH raw_signals AS (
           SELECT s.sensor_id, e.event_type AS label, COUNT(*)::bigint AS count
           FROM events e
           JOIN sessions s ON s.id = e.session_id
           WHERE s.sensor_id = ANY($1::text[])
             AND e.event_ts >= $2::timestamptz
             AND e.event_ts <= $3::timestamptz
           GROUP BY s.sensor_id, e.event_type
           UNION ALL
           SELECT sensor_id, event_type AS label, COUNT(*)::bigint AS count
           FROM protocol_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, event_type
           UNION ALL
           SELECT sensor_id, attack_type AS label, COUNT(*)::bigint AS count
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, attack_type
         ),
         ranked AS (
           SELECT sensor_id, label, SUM(count)::bigint AS count,
                  ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY SUM(count) DESC, label ASC) AS rn
           FROM raw_signals
           GROUP BY sensor_id, label
         )
         SELECT sensor_id, label, count::text
         FROM ranked
         WHERE rn <= 4`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH raw_targets AS (
           SELECT sensor_id, CONCAT('port ', dst_port::text) AS label, COUNT(*)::bigint AS count
           FROM protocol_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, dst_port
           UNION ALL
           SELECT sensor_id, path AS label, COUNT(*)::bigint AS count
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, path
         ),
         ranked AS (
           SELECT sensor_id, label, SUM(count)::bigint AS count,
                  ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY SUM(count) DESC, label ASC) AS rn
           FROM raw_targets
           GROUP BY sensor_id, label
         )
         SELECT sensor_id, label, count::text
         FROM ranked
         WHERE rn <= 4`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{
        sensor_id: string | null
        md5: string
        file_type: string
        size: string
        source: "dionaea" | "cowrie" | "ftp" | "smb"
        src_ip: string | null
        src_port: number | null
        dst_port: number | null
        source_url: string | null
        source_name: string | null
        captured_at: Date
      }>(
        `SELECT sensor_id, md5, file_type, size::text, source, src_ip, src_port, dst_port, source_url, source_name, captured_at
         FROM malware_samples
         WHERE sensor_id = ANY($1::text[]) AND captured_at >= $2::timestamptz AND captured_at <= $3::timestamptz
         ORDER BY captured_at DESC`,
        [sensorIdSet, startDate, endDate],
      ),
    ])

  const uniqueIps = new Map(uniqueIpRows.rows.map((row) => [row.sensor_id, Number(row.unique_ips)]))
  const authSummary = new Map(authRows.rows.map((row) => [row.sensor_id, {
    authAttempts: Number(row.auth_attempts),
    successCount: Number(row.success_count),
  }]))
  const commands = new Map(commandRows.rows.map((row) => [row.sensor_id, Number(row.command_count)]))

  const topAttackers = new Map<string, ReportSensorProfile["topAttackers"]>()
  for (const row of topIpRows.rows) {
    const list = topAttackers.get(row.sensor_id) ?? []
    list.push({ srcIp: row.src_ip, count: Number(row.hit_count) })
    topAttackers.set(row.sensor_id, list)
  }

  const topCredentials = new Map<string, ReportSensorProfile["topCredentials"]>()
  for (const row of topCredentialRows.rows) {
    const list = topCredentials.get(row.sensor_id) ?? []
    list.push({
      username: row.username,
      password: row.password,
      attempts: Number(row.attempts),
      successCount: Number(row.success_count),
    })
    topCredentials.set(row.sensor_id, list)
  }

  const topSignals = new Map<string, ReportSensorProfile["topSignals"]>()
  for (const row of topSignalRows.rows) {
    const list = topSignals.get(row.sensor_id) ?? []
    list.push({ label: row.label, count: Number(row.count) })
    topSignals.set(row.sensor_id, list)
  }

  const topTargets = new Map<string, ReportSensorProfile["topTargets"]>()
  for (const row of topTargetRows.rows) {
    const list = topTargets.get(row.sensor_id) ?? []
    list.push({ label: row.label, count: Number(row.count) })
    topTargets.set(row.sensor_id, list)
  }

  const malwareBySensor = new Map<string, ReportSensorProfile["recentMalware"]>()
  const malwareCount = new Map<string, number>()
  for (const row of malwareRows.rows) {
    if (!row.sensor_id) continue
    malwareCount.set(row.sensor_id, (malwareCount.get(row.sensor_id) ?? 0) + 1)
    const list = malwareBySensor.get(row.sensor_id) ?? []
    if (list.length < 3) {
      list.push({
        md5: row.md5,
        fileType: row.file_type,
        size: Number(row.size),
        source: row.source,
        srcIp: row.src_ip ?? undefined,
        srcPort: row.src_port ?? undefined,
        dstPort: row.dst_port ?? undefined,
        sourceUrl: row.source_url ?? undefined,
        sourceName: row.source_name ?? undefined,
        sensorId: row.sensor_id,
        capturedAt: row.captured_at.toISOString(),
      })
      malwareBySensor.set(row.sensor_id, list)
    }
  }

  return sensors.map((sensor) => ({
    sensor,
    eventShare: totalEvents > 0 ? (sensor.eventsTotal / totalEvents) * 100 : 0,
    uniqueIps: uniqueIps.get(sensor.sensorId) ?? 0,
    authAttempts: authSummary.get(sensor.sensorId)?.authAttempts ?? 0,
    successCount: authSummary.get(sensor.sensorId)?.successCount ?? 0,
    commandCount: commands.get(sensor.sensorId) ?? 0,
    malwareCount: malwareCount.get(sensor.sensorId) ?? 0,
    topAttackers: topAttackers.get(sensor.sensorId) ?? [],
    topCredentials: topCredentials.get(sensor.sensorId) ?? [],
    topSignals: topSignals.get(sensor.sensorId) ?? [],
    topTargets: topTargets.get(sensor.sensorId) ?? [],
    recentMalware: malwareBySensor.get(sensor.sensorId) ?? [],
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

  const [overview, kpiTrends, timeline, mitre, botRatio, geoRaw, insights, creds, sensorProfiles] =
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

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
  ReportLabelCount,
  ReportRange,
  ReportSensorProfile,
  ReportTopCredential,
} from "./types"

function rangeToDays(range: ReportRange): number {
  return range === "week" ? 7 : 30
}

// Well-known decoy ports → service label, so scanned-port tables read as intent
// ("5900 (VNC)") rather than bare numbers.
const PORT_SERVICE: Record<number, string> = {
  21: "FTP", 22: "SSH", 23: "Telnet", 445: "SMB", 1433: "MSSQL", 1883: "MQTT",
  2375: "Docker", 3306: "MySQL", 3389: "RDP", 4444: "Metasploit", 5432: "PostgreSQL",
  5900: "VNC", 6379: "Redis", 8080: "HTTP-alt", 8888: "HTTP-alt", 9090: "Prometheus",
  9200: "Elasticsearch", 11211: "Memcached", 27017: "MongoDB",
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

  const [uniqueIpRows, authRows, commandRows, topIpRows, topCredentialRows, topSignalRows, topTargetRows, malwareRows, ftpCommandRows, smbShareRows, databaseRows, scannedPortRows, webSummaryRows, webAttackTypeRows, webPathRows, webMethodRows, webUserAgentRows, webCanaryRows, webSessionRows] =
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
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH cmds AS (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  jsonb_array_elements(data#>'{raw,ftp,commands}')->>'command' AS label
           FROM protocol_hits
           WHERE protocol = 'ftp' AND event_type = 'command'
             AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
         ),
         ranked AS (
           SELECT sensor_id, label, COUNT(*)::bigint AS count,
                  ROW_NUMBER() OVER (PARTITION BY sensor_id ORDER BY COUNT(*) DESC, label ASC) AS rn
           FROM cmds WHERE label IS NOT NULL AND label <> ''
           GROUP BY sensor_id, label
         )
         SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH ranked AS (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  data->>'shareName' AS label, COUNT(*)::bigint AS count,
                  ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(sensor_id, data->>'sensor')
                    ORDER BY COUNT(*) DESC, data->>'shareName' ASC
                  ) AS rn
           FROM protocol_hits
           WHERE protocol = 'smb' AND COALESCE(data->>'shareName', '') <> ''
             AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
           GROUP BY 1, 2
         )
         SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH ranked AS (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  data->>'database' AS label, COUNT(*)::bigint AS count,
                  ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(sensor_id, data->>'sensor')
                    ORDER BY COUNT(*) DESC, data->>'database' ASC
                  ) AS rn
           FROM protocol_hits
           WHERE protocol IN ('mysql', 'mssql') AND COALESCE(data->>'database', '') <> ''
             AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
           GROUP BY 1, 2
         )
         SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 8`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; dst_port: number; count: string }>(
        `WITH ranked AS (
           SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id,
                  dst_port, COUNT(*)::bigint AS count,
                  ROW_NUMBER() OVER (
                    PARTITION BY COALESCE(sensor_id, data->>'sensor')
                    ORDER BY COUNT(*) DESC, dst_port ASC
                  ) AS rn
           FROM protocol_hits
           WHERE protocol = 'port-scan'
             AND COALESCE(sensor_id, data->>'sensor') = ANY($1::text[])
             AND timestamp >= $2::timestamptz AND timestamp <= $3::timestamptz
           GROUP BY 1, 2
         )
         SELECT sensor_id, dst_port, count::text FROM ranked WHERE rn <= 8`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{
        sensor_id: string
        hits: string
        unique_paths: string
        attack_type_count: string
        session_count: string
        fingerprinted_sessions: string
        multi_ip_sessions: string
        canary_hits: string
        chain_hits: string
      }>(
        `WITH session_rollup AS (
           SELECT sensor_id,
                  COALESCE(client_fingerprint, src_ip) AS session_key,
                  COUNT(DISTINCT src_ip) AS ip_count
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, COALESCE(client_fingerprint, src_ip)
         )
         SELECT wh.sensor_id,
                COUNT(*)::text AS hits,
                COUNT(DISTINCT wh.path)::text AS unique_paths,
                COUNT(DISTINCT wh.attack_type)::text AS attack_type_count,
                COUNT(DISTINCT COALESCE(wh.client_fingerprint, wh.src_ip))::text AS session_count,
                COUNT(DISTINCT COALESCE(wh.client_fingerprint, wh.src_ip))
                  FILTER (WHERE wh.client_fingerprint IS NOT NULL)::text AS fingerprinted_sessions,
                COUNT(DISTINCT sr.session_key)
                  FILTER (WHERE sr.ip_count > 1)::text AS multi_ip_sessions,
                COUNT(*) FILTER (WHERE wh.canary_triggered)::text AS canary_hits,
                COUNT(*) FILTER (WHERE wh.is_chain_attack)::text AS chain_hits
         FROM web_hits wh
         LEFT JOIN session_rollup sr
           ON sr.sensor_id = wh.sensor_id
          AND sr.session_key = COALESCE(wh.client_fingerprint, wh.src_ip)
         WHERE wh.sensor_id = ANY($1::text[])
           AND wh.timestamp >= $2::timestamptz
           AND wh.timestamp <= $3::timestamptz
         GROUP BY wh.sensor_id`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH ranked AS (
           SELECT sensor_id, attack_type AS label, COUNT(*)::bigint AS count,
                  ROW_NUMBER() OVER (
                    PARTITION BY sensor_id
                    ORDER BY COUNT(*) DESC, attack_type ASC
                  ) AS rn
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, attack_type
         )
         SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 6`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH ranked AS (
           SELECT sensor_id, path AS label, COUNT(*)::bigint AS count,
                  ROW_NUMBER() OVER (
                    PARTITION BY sensor_id
                    ORDER BY COUNT(*) DESC, path ASC
                  ) AS rn
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, path
         )
         SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 6`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH ranked AS (
           SELECT sensor_id, method AS label, COUNT(*)::bigint AS count,
                  ROW_NUMBER() OVER (
                    PARTITION BY sensor_id
                    ORDER BY COUNT(*) DESC, method ASC
                  ) AS rn
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, method
         )
         SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 5`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH ranked AS (
           SELECT sensor_id, user_agent AS label, COUNT(*)::bigint AS count,
                  ROW_NUMBER() OVER (
                    PARTITION BY sensor_id
                    ORDER BY COUNT(*) DESC, user_agent ASC
                  ) AS rn
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
             AND COALESCE(user_agent, '') <> ''
           GROUP BY sensor_id, user_agent
         )
         SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 5`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{ sensor_id: string; label: string; count: string }>(
        `WITH ranked AS (
           SELECT sensor_id, COALESCE(canary_token_type, '(untyped)') AS label, COUNT(*)::bigint AS count,
                  ROW_NUMBER() OVER (
                    PARTITION BY sensor_id
                    ORDER BY COUNT(*) DESC, COALESCE(canary_token_type, '(untyped)') ASC
                  ) AS rn
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
             AND canary_triggered IS TRUE
           GROUP BY sensor_id, COALESCE(canary_token_type, '(untyped)')
         )
         SELECT sensor_id, label, count::text FROM ranked WHERE rn <= 5`,
        [sensorIdSet, startDate, endDate],
      ),
      db.query<{
        sensor_id: string
        session_label: string
        hits: string
        ip_count: string
        chain_hits: string
        canary_hits: string
        attack_types: string[] | null
        top_paths: string[] | null
      }>(
        `WITH grouped AS (
           SELECT sensor_id,
                  COALESCE(client_fingerprint, src_ip) AS session_label,
                  COUNT(*)::bigint AS hits,
                  COUNT(DISTINCT src_ip)::bigint AS ip_count,
                  COUNT(*) FILTER (WHERE is_chain_attack)::bigint AS chain_hits,
                  COUNT(*) FILTER (WHERE canary_triggered)::bigint AS canary_hits,
                  ARRAY_AGG(DISTINCT attack_type) AS attack_types,
                  (ARRAY_AGG(path ORDER BY timestamp DESC))[1:4] AS top_paths
           FROM web_hits
           WHERE sensor_id = ANY($1::text[])
             AND timestamp >= $2::timestamptz
             AND timestamp <= $3::timestamptz
           GROUP BY sensor_id, COALESCE(client_fingerprint, src_ip)
         ),
         ranked AS (
           SELECT *,
                  ROW_NUMBER() OVER (
                    PARTITION BY sensor_id
                    ORDER BY hits DESC, session_label ASC
                  ) AS rn
           FROM grouped
         )
         SELECT sensor_id, session_label, hits::text, ip_count::text, chain_hits::text, canary_hits::text, attack_types, top_paths
         FROM ranked
         WHERE rn <= 4`,
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

  function groupLabelCounts(rows: { sensor_id: string; label: string; count: string }[]) {
    const map = new Map<string, ReportLabelCount[]>()
    for (const row of rows) {
      const list = map.get(row.sensor_id) ?? []
      list.push({ label: row.label, count: Number(row.count) })
      map.set(row.sensor_id, list)
    }
    return map
  }

  const ftpCommands = groupLabelCounts(ftpCommandRows.rows)
  const smbShares = groupLabelCounts(smbShareRows.rows)
  const databases = groupLabelCounts(databaseRows.rows)
  const webAttackTypes = groupLabelCounts(webAttackTypeRows.rows)
  const webPaths = groupLabelCounts(webPathRows.rows)
  const webMethods = groupLabelCounts(webMethodRows.rows)

  const scannedPorts = new Map<string, ReportSensorProfile["scannedPorts"]>()
  for (const row of scannedPortRows.rows) {
    const list = scannedPorts.get(row.sensor_id) ?? []
    const service = PORT_SERVICE[row.dst_port]
    list.push({ label: service ? `${row.dst_port} (${service})` : `${row.dst_port}`, count: Number(row.count) })
    scannedPorts.set(row.sensor_id, list)
  }

  const webSummary = new Map(webSummaryRows.rows.map((row) => [row.sensor_id, {
    hits: Number(row.hits),
    uniquePaths: Number(row.unique_paths),
    attackTypeCount: Number(row.attack_type_count),
    sessionCount: Number(row.session_count),
    fingerprintedSessions: Number(row.fingerprinted_sessions),
    multiIpSessions: Number(row.multi_ip_sessions),
    canaryHits: Number(row.canary_hits),
    chainHits: Number(row.chain_hits),
  }]))

  const webUserAgents = new Map<string, ReportSensorProfile["topTargets"]>()
  for (const row of webUserAgentRows.rows) {
    const list = webUserAgents.get(row.sensor_id) ?? []
    const label = row.label.length > 72 ? `${row.label.slice(0, 69)}...` : row.label
    list.push({ label, count: Number(row.count) })
    webUserAgents.set(row.sensor_id, list)
  }

  const webCanaryTokens = groupLabelCounts(webCanaryRows.rows)

  const webSessions = new Map<string, NonNullable<ReportSensorProfile["web"]>["topSessions"]>()
  for (const row of webSessionRows.rows) {
    const list = webSessions.get(row.sensor_id) ?? []
    list.push({
      label: row.session_label,
      hits: Number(row.hits),
      ipCount: Number(row.ip_count),
      chainHits: Number(row.chain_hits),
      canaryHits: Number(row.canary_hits),
      attackTypes: row.attack_types ?? [],
      topPaths: row.top_paths ?? [],
    })
    webSessions.set(row.sensor_id, list)
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

  return sensors.map((sensor) => {
    const web = webSummary.get(sensor.sensorId)
    return {
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
      ftpCommands: ftpCommands.get(sensor.sensorId) ?? [],
      smbShares: smbShares.get(sensor.sensorId) ?? [],
      databases: databases.get(sensor.sensorId) ?? [],
      scannedPorts: scannedPorts.get(sensor.sensorId) ?? [],
      web: web
        ? {
            ...web,
            topAttackTypes: webAttackTypes.get(sensor.sensorId) ?? [],
            topPaths: webPaths.get(sensor.sensorId) ?? [],
            topMethods: webMethods.get(sensor.sensorId) ?? [],
            topUserAgents: webUserAgents.get(sensor.sensorId) ?? [],
            topCanaryTokens: webCanaryTokens.get(sensor.sensorId) ?? [],
            topSessions: webSessions.get(sensor.sensorId) ?? [],
          }
        : undefined,
    }
  })
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
      fetchGeoSummary(sensorIds, { fresh: true }),
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

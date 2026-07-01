import type { Sensor } from "@/lib/api/services"
import { db } from "@/lib/db"
import type { ReportSensorProfile } from "../types"
import { collectBaseSensorIntel } from "./base/collect"
import { collectMalwareSensorIntel } from "./malware/collect"
import { collectProtocolSensorIntel } from "./protocols/collect"
import { groupLabelCounts } from "./shared"
import { collectWebSensorIntel } from "./web/collect"

type SensorRow = {
  sensor_id: string
  client_id: string | null
  client_name: string | null
  client_slug: string | null
  client_code: string | null
  name: string
  protocol: string
  ip: string
  version: string
  ports: unknown
  probe_host: string
  last_seen: Date
  created_at: Date
  event_count: string
  owner_type: string | null
  application_id: string | null
  application_name: string | null
}

async function fetchReportSensors(sensorIds: string[]): Promise<Sensor[]> {
  const { rows } = await db.query<SensorRow>(
    `WITH ssh_counts AS (
       SELECT sensor_id, COUNT(*)::bigint AS n FROM sessions GROUP BY sensor_id
     ),
     web_counts AS (
       SELECT sensor_id, COUNT(*)::bigint AS n FROM web_hits GROUP BY sensor_id
     ),
     proto_counts AS (
       SELECT COALESCE(sensor_id, data->>'sensor') AS sensor_id, COUNT(*)::bigint AS n
       FROM protocol_hits
       WHERE COALESCE(sensor_id, data->>'sensor') IS NOT NULL
       GROUP BY COALESCE(sensor_id, data->>'sensor')
     )
     SELECT
       s.sensor_id,
       c.id AS client_id,
       c.name AS client_name,
       c.slug AS client_slug,
       c.code AS client_code,
       s.name,
       s.protocol,
       s.ip,
       s.version,
       s.ports,
       s.probe_host,
       s.last_seen,
       s.created_at,
       COALESCE(
         CASE
           WHEN s.protocol = 'ssh' THEN sc.n
           WHEN s.protocol = 'http' THEN wc.n
           ELSE pc.n
         END,
         0
       )::text AS event_count,
       s.owner_type,
       s.application_id,
       a.name AS application_name
     FROM sensors s
     LEFT JOIN clients c ON c.id = s.client_id
     LEFT JOIN applications a ON a.id = s.application_id
     LEFT JOIN ssh_counts sc ON sc.sensor_id = s.sensor_id
     LEFT JOIN web_counts wc ON wc.sensor_id = s.sensor_id
     LEFT JOIN proto_counts pc ON pc.sensor_id = s.sensor_id
     WHERE s.sensor_id = ANY($1::text[])
     ORDER BY s.last_seen DESC`,
    [sensorIds],
  )

  const twoMinutesAgo = Date.now() - 2 * 60 * 1000
  return rows.map((row) => ({
    sensorId: row.sensor_id,
    clientId: row.client_id,
    clientName: row.client_name,
    clientSlug: row.client_slug,
    clientCode: row.client_code ?? "",
    name: row.name,
    protocol: row.protocol,
    ip: row.ip,
    version: row.version,
    ports: Array.isArray(row.ports) ? (row.ports as number[]) : [],
    probeHost: row.probe_host,
    lastSeen: row.last_seen.toISOString(),
    createdAt: row.created_at.toISOString(),
    eventsTotal: Number(row.event_count),
    online: row.last_seen.getTime() > twoMinutesAgo,
    degraded: false,
    portStatus: {},
    ownerType: row.owner_type ?? "application",
    applicationId: row.application_id,
    applicationName: row.application_name,
  }))
}

export async function collectSensorProfiles(
  sensorIds: string[] | undefined,
  startDate: string,
  endDate: string,
): Promise<ReportSensorProfile[]> {
  if (!sensorIds?.length) return []

  const sensors = (await fetchReportSensors(sensorIds))
    .sort((a, b) => b.eventsTotal - a.eventsTotal)

  if (!sensors.length) return []

  const totalEvents = sensors.reduce((sum, sensor) => sum + sensor.eventsTotal, 0)
  const sensorIdSet = sensors.map((sensor) => sensor.sensorId)

  const [baseIntel, protocolIntel, malwareIntel, webIntel] = await Promise.all([
    collectBaseSensorIntel(sensorIdSet, startDate, endDate),
    collectProtocolSensorIntel(sensorIdSet, startDate, endDate),
    collectMalwareSensorIntel(sensorIdSet, startDate, endDate),
    collectWebSensorIntel(sensorIdSet, startDate, endDate),
  ])

  const uniqueIps = new Map(baseIntel.uniqueIpRows.rows.map((row) => [row.sensor_id, Number(row.unique_ips)]))
  const authSummary = new Map(baseIntel.authRows.rows.map((row) => [row.sensor_id, {
    authAttempts: Number(row.auth_attempts),
    successCount: Number(row.success_count),
  }]))
  const commands = new Map(baseIntel.commandRows.rows.map((row) => [row.sensor_id, Number(row.command_count)]))

  const topAttackers = new Map<string, ReportSensorProfile["topAttackers"]>()
  for (const row of baseIntel.topIpRows.rows) {
    const list = topAttackers.get(row.sensor_id) ?? []
    list.push({ srcIp: row.src_ip, count: Number(row.hit_count) })
    topAttackers.set(row.sensor_id, list)
  }

  const topCredentials = new Map<string, ReportSensorProfile["topCredentials"]>()
  for (const row of baseIntel.topCredentialRows.rows) {
    const list = topCredentials.get(row.sensor_id) ?? []
    list.push({
      username: row.username,
      password: row.password,
      attempts: Number(row.attempts),
      successCount: Number(row.success_count),
    })
    topCredentials.set(row.sensor_id, list)
  }

  const topSignals = groupLabelCounts(baseIntel.topSignalRows.rows)
  const topTargets = groupLabelCounts(baseIntel.topTargetRows.rows)

  const dailyActivity = new Map<string, { date: string; count: number }[]>()
  for (const row of baseIntel.dailyRows.rows) {
    const list = dailyActivity.get(row.sensor_id) ?? []
    list.push({ date: row.date, count: Number(row.count) })
    dailyActivity.set(row.sensor_id, list)
  }

  const hourlyActivity = new Map<string, { hour: number; count: number }[]>()
  for (const row of baseIntel.hourlyRows.rows) {
    const list = hourlyActivity.get(row.sensor_id) ?? []
    list.push({ hour: Number(row.hour), count: Number(row.count) })
    hourlyActivity.set(row.sensor_id, list)
  }

  return sensors.map((sensor) => {
    const web = webIntel.webSummary.get(sensor.sensorId)
    return {
      sensor,
      eventShare: totalEvents > 0 ? (sensor.eventsTotal / totalEvents) * 100 : 0,
      uniqueIps: uniqueIps.get(sensor.sensorId) ?? 0,
      authAttempts: authSummary.get(sensor.sensorId)?.authAttempts ?? 0,
      successCount: authSummary.get(sensor.sensorId)?.successCount ?? 0,
      commandCount: commands.get(sensor.sensorId) ?? 0,
      malwareCount: malwareIntel.malwareCount.get(sensor.sensorId) ?? 0,
      topAttackers: topAttackers.get(sensor.sensorId) ?? [],
      topCredentials: topCredentials.get(sensor.sensorId) ?? [],
      topSignals: topSignals.get(sensor.sensorId) ?? [],
      topTargets: topTargets.get(sensor.sensorId) ?? [],
      recentMalware: malwareIntel.malwareBySensor.get(sensor.sensorId) ?? [],
      eventBreakdown: protocolIntel.eventBreakdown.get(sensor.sensorId) ?? [],
      sourcePorts: protocolIntel.sourcePorts.get(sensor.sensorId) ?? [],
      sourceServices: protocolIntel.sourceServices.get(sensor.sensorId) ?? [],
      fileTransfers: protocolIntel.fileTransfers.get(sensor.sensorId) ?? [],
      ftpCommands: protocolIntel.ftpCommands.get(sensor.sensorId) ?? [],
      smbDomains: protocolIntel.smbDomains.get(sensor.sensorId) ?? [],
      smbShares: protocolIntel.smbShares.get(sensor.sensorId) ?? [],
      smbHosts: protocolIntel.smbHosts.get(sensor.sensorId) ?? [],
      smbNtlmHashes: protocolIntel.smbNtlmHashes.get(sensor.sensorId) ?? [],
      databases: protocolIntel.databases.get(sensor.sensorId) ?? [],
      scannedPorts: protocolIntel.scannedPorts.get(sensor.sensorId) ?? [],
      dailyActivity: dailyActivity.get(sensor.sensorId) ?? [],
      hourlyActivity: hourlyActivity.get(sensor.sensorId) ?? [],
      web: web
        ? {
            ...web,
            topAttackTypes: webIntel.webAttackTypes.get(sensor.sensorId) ?? [],
            topPaths: webIntel.webPaths.get(sensor.sensorId) ?? [],
            topMethods: webIntel.webMethods.get(sensor.sensorId) ?? [],
            topUserAgents: webIntel.webUserAgents.get(sensor.sensorId) ?? [],
            topCanaryTokens: webIntel.webCanaryTokens.get(sensor.sensorId) ?? [],
            topSessions: webIntel.webSessions.get(sensor.sensorId) ?? [],
          }
        : undefined,
    }
  })
}

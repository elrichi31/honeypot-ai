import { fetchSensors } from "@/lib/api/services"
import type { ReportSensorProfile } from "../types"
import { collectBaseSensorIntel } from "./base/collect"
import { collectMalwareSensorIntel } from "./malware/collect"
import { collectProtocolSensorIntel } from "./protocols/collect"
import { groupLabelCounts } from "./shared"
import { collectWebSensorIntel } from "./web/collect"

export async function collectSensorProfiles(
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

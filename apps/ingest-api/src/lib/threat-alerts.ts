import type { PrismaClient } from '@prisma/client'
import { computeRiskScore } from './risk-score.js'
import { sendDiscordAlert } from './discord.js'
import { getAlertConfig, getTimezone } from './runtime-config.js'
import { formatInTimezone } from './date-utils.js'
import {
  checkScoreThreshold,
  checkCrossProtocol,
  checkAuthBurst,
  checkPostAuthSuccess,
  checkAttackChain,
  type AlertPayload,
} from './threat-checks.js'
export {
  deriveMultiServiceLevel,
  deriveAuthBurstLevel,
  hasExploitAuthSequence,
  hasSuspiciousPostAuthActivity,
} from './threat-checks.js'
import {
  querySshAggregate,
  querySshCommands,
  queryWebAggregate,
  queryProtocolAggregate,
  queryRecentSshAggregate,
  queryRecentAuthIdentity,
  queryRecentWebAggregate,
  queryRecentProtocolAggregate,
  queryRecentCommands,
  queryOfflineSensors,
} from './threat-queries.js'
import type { ProtocolAggRow } from './threat-queries.js'

export type ProtocolSummary = {
  names: string[]
  authAttempts: number
  commandEvents: number
  connectEvents: number
  uniquePorts: number
  credentialReuse: boolean
  uniqueUsernames: number
  uniquePasswords: number
}

const SENSOR_OFFLINE_COOLDOWN_MS = 2 * 60 * 60 * 1000
// Debounce per IP: collapse bursts of events from the same attacker into one
// evaluation. Raised from 1.5s to 5s to cut evaluation volume under heavy ingest.
const THREAT_ALERT_DEBOUNCE_MS = 5000
// Global cap on concurrent evaluations. Each evaluation fires ~11 heavy
// aggregate queries; without a cap, many distinct attacking IPs trigger dozens
// of concurrent evaluations and saturate the ingest-api CPU + DB I/O.
const MAX_CONCURRENT_EVALUATIONS = 3

const pendingThreatAlertTimers = new Map<string, NodeJS.Timeout>()
const runningThreatAlerts = new Set<string>()

/**
 * Read client for the heavy threat-alert aggregate queries. Set once at startup
 * to the read replica so these reads don't compete with collector ingest on the
 * primary. Falls back to whatever client is passed in if never set.
 */
let threatAlertReadClient: PrismaClient | null = null
export function setThreatAlertReadClient(client: PrismaClient): void {
  threatAlertReadClient = client
}
function readClient(fallback: PrismaClient): PrismaClient {
  return threatAlertReadClient ?? fallback
}

function uniqStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))]
}

export function summarizeProtocols(rows: ProtocolAggRow[]): ProtocolSummary {
  const names: string[] = []
  const portSet = new Set<number>()
  const usernameProtocols = new Map<string, Set<string>>()
  const passwordProtocols = new Map<string, Set<string>>()
  const usernames = new Set<string>()
  const passwords = new Set<string>()
  let authAttempts = 0
  let commandEvents = 0
  let connectEvents = 0

  for (const row of rows) {
    names.push(row.protocol)
    authAttempts += Number(row.auth_attempts)
    commandEvents += Number(row.command_events)
    connectEvents += Number(row.connect_events)
    for (const port of row.dst_ports ?? []) {
      if (typeof port === 'number') portSet.add(port)
    }
    for (const u of uniqStrings(row.usernames ?? [])) {
      usernames.add(u)
      if (!usernameProtocols.has(u)) usernameProtocols.set(u, new Set())
      usernameProtocols.get(u)!.add(row.protocol)
    }
    for (const p of uniqStrings(row.passwords ?? [])) {
      passwords.add(p)
      if (!passwordProtocols.has(p)) passwordProtocols.set(p, new Set())
      passwordProtocols.get(p)!.add(row.protocol)
    }
  }

  const credentialReuse =
    [...usernameProtocols.values(), ...passwordProtocols.values()].some((s) => s.size > 1)

  return {
    names: [...new Set(names)],
    authAttempts,
    commandEvents,
    connectEvents,
    uniquePorts: portSet.size,
    credentialReuse,
    uniqueUsernames: usernames.size,
    uniquePasswords: passwords.size,
  }
}

function buildTimeWindowMinutes(
  ...ranges: Array<{ firstSeen: Date | null; lastSeen: Date | null } | null>
): number | null {
  let firstSeen: Date | null = null
  let lastSeen: Date | null = null
  for (const range of ranges) {
    if (!range) continue
    if (range.firstSeen && (!firstSeen || range.firstSeen < firstSeen)) firstSeen = range.firstSeen
    if (range.lastSeen && (!lastSeen || range.lastSeen > lastSeen)) lastSeen = range.lastSeen
  }
  if (!firstSeen || !lastSeen) return null
  return Math.max(0, Math.round((lastSeen.getTime() - firstSeen.getTime()) / 60000))
}

async function shouldSendAlert(prisma: PrismaClient, key: string, cooldownMs: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ key: string }>>`
    INSERT INTO threat_alert_cooldown (key, expires_at)
    VALUES (${key}, NOW() + (${cooldownMs}::bigint * interval '1 millisecond'))
    ON CONFLICT (key) DO UPDATE
      SET expires_at = NOW() + (${cooldownMs}::bigint * interval '1 millisecond')
      WHERE threat_alert_cooldown.expires_at < NOW()
    RETURNING key
  `
  return rows.length > 0
}

async function sendAlertOnce(prisma: PrismaClient, payload: AlertPayload): Promise<void> {
  if (!await shouldSendAlert(prisma, payload.key, payload.cooldownMs)) return
  await sendDiscordAlert({
    level: payload.level,
    title: payload.title,
    description: payload.description,
    fields: payload.fields,
  })
}

export async function clearSensorOfflineAlert(prisma: PrismaClient, sensorId: string): Promise<void> {
  const key = `sensor-offline:${sensorId}`
  await prisma.$queryRaw`DELETE FROM threat_alert_cooldown WHERE key = ${key}`
}

export function scheduleThreatAlert(prisma: PrismaClient, ip: string, debounceMs = THREAT_ALERT_DEBOUNCE_MS): void {
  if (!ip) return
  const existing = pendingThreatAlertTimers.get(ip)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    pendingThreatAlertTimers.delete(ip)
    if (runningThreatAlerts.has(ip)) return
    // Global concurrency cap: under heavy attack, drop this evaluation rather
    // than pile on. The next event from this IP re-schedules it anyway.
    if (runningThreatAlerts.size >= MAX_CONCURRENT_EVALUATIONS) return
    runningThreatAlerts.add(ip)
    void evaluateThreatAlert(prisma, ip)
      .catch((error) => {
        console.warn(
          `[threat-alerts] evaluation failed for ${ip}: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
      .finally(() => { runningThreatAlerts.delete(ip) })
  }, debounceMs)
  pendingThreatAlertTimers.set(ip, timer)
}

export async function checkSensorHealthAlerts(prisma: PrismaClient): Promise<void> {
  const sensorCfg = getAlertConfig()
  if (!sensorCfg.types.sensorOffline) return
  const offlineSensors = await queryOfflineSensors(prisma)
  const timezone = getTimezone()
  for (const sensor of offlineSensors) {
    await sendAlertOnce(prisma, {
      key: `sensor-offline:${sensor.sensor_id}`,
      cooldownMs: SENSOR_OFFLINE_COOLDOWN_MS,
      level: 'high',
      title: 'Sensor heartbeat missing',
      description: `Sensor \`${sensor.name}\` has stopped reporting heartbeats.`,
      fields: [
        { name: 'Sensor', value: sensor.sensor_id, inline: true },
        { name: 'Protocol', value: sensor.protocol.toUpperCase(), inline: true },
        { name: 'IP', value: sensor.ip || 'unknown', inline: true },
        { name: 'Last seen', value: formatInTimezone(sensor.last_seen, timezone), inline: false },
      ],
    })
  }
}

export async function evaluateThreatAlert(prisma: PrismaClient, ip: string): Promise<void> {
  if (!ip || typeof (prisma as Partial<PrismaClient>).$queryRaw !== 'function') return

  // Heavy aggregate reads run against the replica (if configured) so they don't
  // compete with collector ingest on the primary. Cooldown writes still use the
  // passed-in primary client below.
  const db = readClient(prisma)

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
  const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000)

  const [sshRows, cmdRows, webRows, protocolRows, recentSshRows, recentIdentityRows,
    recentWebRows, recentProtocolRows, recentProtocolRowsFiveMin, recentCmdRows,
    recentSshFiveMinRows] = await Promise.all([
    querySshAggregate(db, ip),
    querySshCommands(db, ip),
    queryWebAggregate(db, ip),
    queryProtocolAggregate(db, ip),
    queryRecentSshAggregate(db, ip, tenMinAgo),
    queryRecentAuthIdentity(db, ip, fiveMinAgo),
    queryRecentWebAggregate(db, ip, tenMinAgo),
    queryRecentProtocolAggregate(db, ip, tenMinAgo),
    queryRecentProtocolAggregate(db, ip, fiveMinAgo),
    queryRecentCommands(db, ip, twentyMinAgo),
    queryRecentSshAggregate(db, ip, fiveMinAgo),
  ])

  const ssh = sshRows[0]
  const web = webRows[0]
  const protocolSummary = summarizeProtocols(protocolRows)
  const commands = cmdRows.map((r) => r.command!).filter(Boolean)
  const protocolsSeen = [
    ...(Number(ssh?.sessions ?? 0) > 0 ? ['ssh'] : []),
    ...(Number(web?.total_hits ?? 0) > 0 ? ['http'] : []),
    ...protocolSummary.names,
  ]

  const risk = computeRiskScore({
    sshSessions: Number(ssh?.sessions ?? 0),
    sshAuthAttempts: Number(ssh?.auth_attempts ?? 0),
    sshLoginSuccess: ssh?.had_success ?? false,
    commands,
    webHits: Number(web?.total_hits ?? 0),
    webAttackTypes: web?.attack_types ?? [],
    protocolsSeen,
    protocolAuthAttempts: protocolSummary.authAttempts,
    protocolCommandCount: protocolSummary.commandEvents,
    protocolConnectCount: protocolSummary.connectEvents,
    protocolUniquePorts: protocolSummary.uniquePorts,
    credentialReuse: protocolSummary.credentialReuse,
    timeWindowMinutes: buildTimeWindowMinutes(
      ssh ? { firstSeen: ssh.first_seen, lastSeen: ssh.last_seen } : null,
      web ? { firstSeen: web.first_seen, lastSeen: web.last_seen } : null,
      protocolRows.length > 0
        ? {
            firstSeen: protocolRows.reduce<Date | null>((min, r) => !min || (r.first_seen && r.first_seen < min) ? r.first_seen : min, null),
            lastSeen: protocolRows.reduce<Date | null>((max, r) => !max || (r.last_seen && r.last_seen > max) ? r.last_seen : max, null),
          }
        : null,
    ),
  })

  const alertCfg = getAlertConfig()
  const levelPasses = (level: 'HIGH' | 'CRITICAL') => level === 'CRITICAL' || alertCfg.minLevel === 'high'

  const recentSsh = recentSshRows[0]
  const recentWeb = recentWebRows[0]
  const recentProtocolSummary = summarizeProtocols(recentProtocolRows)
  const recentFamilies = [
    ...(Number(recentSsh?.auth_attempts ?? 0) > 0 || Number(recentSsh?.login_successes ?? 0) > 0 ? ['ssh'] : []),
    ...(Number(recentWeb?.total_hits ?? 0) > 0 ? ['http'] : []),
    ...recentProtocolSummary.names,
  ]

  const recentIdentity = recentIdentityRows[0]
  const recentProtocolAuthAttempts = recentProtocolRowsFiveMin.reduce((sum, r) => sum + Number(r.auth_attempts), 0)
  const totalAuthAttempts = Number(recentSshFiveMinRows[0]?.auth_attempts ?? 0) + recentProtocolAuthAttempts
  const uniqueAuthUsernames = new Set([
    ...uniqStrings(recentIdentity?.usernames ?? []),
    ...uniqStrings(recentProtocolRowsFiveMin.flatMap((r) => r.usernames ?? [])),
  ]).size
  const uniqueAuthPasswords = new Set([
    ...uniqStrings(recentIdentity?.passwords ?? []),
    ...uniqStrings(recentProtocolRowsFiveMin.flatMap((r) => r.passwords ?? [])),
  ]).size
  const recentCommands = recentCmdRows.map((r) => r.command ?? '').filter(Boolean)

  const checks = [
    alertCfg.types.threatScore && levelPasses(risk.level as 'HIGH' | 'CRITICAL')
      ? checkScoreThreshold(ip, risk, protocolsSeen, alertCfg.cooldownMs)
      : null,
    alertCfg.types.multiService
      ? checkCrossProtocol(ip, recentFamilies, alertCfg.cooldownMs)
      : null,
    alertCfg.types.authBurst
      ? checkAuthBurst(ip, totalAuthAttempts, uniqueAuthUsernames, uniqueAuthPasswords, recentFamilies, alertCfg.cooldownMs)
      : null,
    alertCfg.types.postAuth
      ? checkPostAuthSuccess(ip, Number(recentSsh?.login_successes ?? 0), recentCommands, alertCfg.cooldownMs)
      : null,
    alertCfg.types.attackChain
      ? checkAttackChain(ip, recentProtocolSummary.names.includes('port-scan'), recentWeb?.attack_types ?? [], totalAuthAttempts, alertCfg.cooldownMs)
      : null,
  ]

  for (const payload of checks) {
    if (payload && levelPasses(payload.level === 'critical' ? 'CRITICAL' : 'HIGH')) {
      await sendAlertOnce(prisma, payload)
    }
  }
}

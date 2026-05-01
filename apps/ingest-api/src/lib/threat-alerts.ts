import type { PrismaClient } from '@prisma/client'
import { classifyCommands, computeRiskScore, type CommandCategory } from './risk-score.js'
import { sendDiscordAlert } from './discord.js'

type SshAggRow = {
  sessions: bigint
  auth_attempts: bigint
  had_success: boolean
  first_seen: Date | null
  last_seen: Date | null
}

type WebAggRow = {
  total_hits: bigint
  attack_types: string[]
  first_seen: Date | null
  last_seen: Date | null
}

type ProtocolAggRow = {
  protocol: string
  total_hits: bigint
  auth_attempts: bigint
  command_events: bigint
  connect_events: bigint
  dst_ports: number[] | null
  usernames: (string | null)[] | null
  passwords: (string | null)[] | null
  first_seen: Date | null
  last_seen: Date | null
}

type SensorOfflineRow = {
  sensor_id: string
  name: string
  protocol: string
  ip: string
  last_seen: Date
}

type RecentSshAggRow = {
  auth_attempts: bigint
  login_successes: bigint
  first_seen: Date | null
  last_seen: Date | null
}

type RecentAuthIdentityRow = {
  usernames: (string | null)[] | null
  passwords: (string | null)[] | null
}

type CommandRow = {
  command: string | null
}

const WEB_EXPLOIT_TYPES = ['cmdi', 'sqli', 'lfi', 'rfi']
const SUSPICIOUS_COMMAND_CATEGORIES: CommandCategory[] = [
  'ssh_backdoor',
  'honeypot_evasion',
  'container_escape',
  'malware_drop',
  'persistence',
  'lateral_movement',
  'crypto_mining',
  'data_exfil',
  'solana_targeting',
]

const ALERT_COOLDOWN_MS = {
  threat_high: 30 * 60 * 1000,
  threat_critical: 15 * 60 * 1000,
  multi_service_high: 20 * 60 * 1000,
  multi_service_critical: 15 * 60 * 1000,
  auth_burst_high: 15 * 60 * 1000,
  auth_burst_critical: 10 * 60 * 1000,
  post_auth_critical: 15 * 60 * 1000,
  sequence_critical: 15 * 60 * 1000,
  sensor_offline_high: 30 * 60 * 1000,
} as const

const lastAlertSent = new Map<string, number>()

function uniqStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

function summarizeProtocols(rows: ProtocolAggRow[]) {
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

    for (const username of uniqStrings(row.usernames ?? [])) {
      usernames.add(username)
      if (!usernameProtocols.has(username)) usernameProtocols.set(username, new Set())
      usernameProtocols.get(username)!.add(row.protocol)
    }

    for (const password of uniqStrings(row.passwords ?? [])) {
      passwords.add(password)
      if (!passwordProtocols.has(password)) passwordProtocols.set(password, new Set())
      passwordProtocols.get(password)!.add(row.protocol)
    }
  }

  const credentialReuse =
    [...usernameProtocols.values(), ...passwordProtocols.values()].some((protocols) => protocols.size > 1)

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

function buildTimeWindowMinutes(...ranges: Array<{ firstSeen: Date | null; lastSeen: Date | null } | null>) {
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

function shouldSendAlert(key: string, cooldownMs: number) {
  const now = Date.now()
  const lastSent = lastAlertSent.get(key)
  if (lastSent && now - lastSent < cooldownMs) return false
  lastAlertSent.set(key, now)
  return true
}

export function deriveMultiServiceLevel(serviceFamilyCount: number): 'HIGH' | 'CRITICAL' | null {
  if (serviceFamilyCount >= 3) return 'CRITICAL'
  if (serviceFamilyCount >= 2) return 'HIGH'
  return null
}

export function deriveAuthBurstLevel(totalAuthAttempts: number): 'HIGH' | 'CRITICAL' | null {
  if (totalAuthAttempts >= 12) return 'CRITICAL'
  if (totalAuthAttempts >= 8) return 'HIGH'
  return null
}

export function hasExploitAuthSequence(input: {
  hasPortScan: boolean
  webAttackTypes: string[]
  totalAuthAttempts: number
}) {
  const hasSeriousWebExploit = input.webAttackTypes.some((type) => WEB_EXPLOIT_TYPES.includes(type))
  return input.hasPortScan && hasSeriousWebExploit && input.totalAuthAttempts > 0
}

export function hasSuspiciousPostAuthActivity(commandCategories: Record<CommandCategory, string[]>) {
  return SUSPICIOUS_COMMAND_CATEGORIES.some((category) => commandCategories[category].length > 0)
}

async function sendAlertOnce(input: {
  key: string
  cooldownMs: number
  level: 'critical' | 'high' | 'info'
  title: string
  description: string
  fields: Array<{ name: string; value: string; inline?: boolean }>
}) {
  if (!shouldSendAlert(input.key, input.cooldownMs)) return
  await sendDiscordAlert({
    level: input.level,
    title: input.title,
    description: input.description,
    fields: input.fields,
  })
}

export function clearSensorOfflineAlert(sensorId: string) {
  lastAlertSent.delete(`sensor-offline:${sensorId}`)
}

export async function checkSensorHealthAlerts(prisma: PrismaClient): Promise<void> {
  const offlineSensors = await prisma.$queryRaw<Array<SensorOfflineRow>>`
    SELECT sensor_id, name, protocol, ip, last_seen
    FROM sensors
    WHERE last_seen < NOW() - INTERVAL '2 minutes'
    ORDER BY last_seen ASC
  `

  for (const sensor of offlineSensors) {
    await sendAlertOnce({
      key: `sensor-offline:${sensor.sensor_id}`,
      cooldownMs: ALERT_COOLDOWN_MS.sensor_offline_high,
      level: 'high',
      title: 'Sensor heartbeat missing',
      description: `Sensor \`${sensor.name}\` has stopped reporting heartbeats.`,
      fields: [
        { name: 'Sensor', value: sensor.sensor_id, inline: true },
        { name: 'Protocol', value: sensor.protocol.toUpperCase(), inline: true },
        { name: 'IP', value: sensor.ip || 'unknown', inline: true },
        { name: 'Last seen', value: sensor.last_seen.toISOString(), inline: false },
      ],
    })
  }
}

export async function evaluateThreatAlert(prisma: PrismaClient, ip: string): Promise<void> {
  if (!ip || typeof (prisma as Partial<PrismaClient>).$queryRaw !== 'function') {
    return
  }

  const recentTenMinutes = new Date(Date.now() - 10 * 60 * 1000)
  const recentFiveMinutes = new Date(Date.now() - 5 * 60 * 1000)
  const recentTwentyMinutes = new Date(Date.now() - 20 * 60 * 1000)

  const [sshRows, cmdRows, webRows, protocolRows, recentSshRows, recentSshIdentities, recentWebRows, recentProtocolRows, recentProtocolRowsFiveMinute, recentProtocolCommands] = await Promise.all([
    prisma.$queryRaw<Array<SshAggRow>>`
      SELECT
        COUNT(DISTINCT s.id) AS sessions,
        COUNT(e.id) FILTER (WHERE e.event_type IN ('auth.success','auth.failed')) AS auth_attempts,
        BOOL_OR(s.login_success) AS had_success,
        MIN(s.started_at) AS first_seen,
        MAX(COALESCE(s.ended_at, s.started_at)) AS last_seen
      FROM sessions s
      LEFT JOIN events e ON e.session_id = s.id
      WHERE s.src_ip = ${ip}
    `,
    prisma.event.findMany({
      where: { srcIp: ip, eventType: 'command.input', command: { not: null } },
      select: { command: true },
    }),
    prisma.$queryRaw<Array<WebAggRow>>`
      SELECT
        COUNT(*) AS total_hits,
        ARRAY_AGG(DISTINCT attack_type) AS attack_types,
        MIN(timestamp) AS first_seen,
        MAX(timestamp) AS last_seen
      FROM web_hits
      WHERE src_ip = ${ip}
    `,
    prisma.$queryRaw<Array<ProtocolAggRow>>`
      SELECT
        protocol,
        COUNT(*) AS total_hits,
        COUNT(*) FILTER (WHERE event_type = 'auth') AS auth_attempts,
        COUNT(*) FILTER (WHERE event_type = 'command') AS command_events,
        COUNT(*) FILTER (WHERE event_type = 'connect') AS connect_events,
        ARRAY_AGG(DISTINCT dst_port) AS dst_ports,
        ARRAY_AGG(DISTINCT username) FILTER (WHERE username IS NOT NULL AND username <> '') AS usernames,
        ARRAY_AGG(DISTINCT password) FILTER (WHERE password IS NOT NULL AND password <> '') AS passwords,
        MIN(timestamp) AS first_seen,
        MAX(timestamp) AS last_seen
      FROM protocol_hits
      WHERE src_ip = ${ip}
      GROUP BY protocol
    `,
    prisma.$queryRaw<Array<RecentSshAggRow>>`
      SELECT
        COUNT(*) FILTER (WHERE event_type IN ('auth.success', 'auth.failed')) AS auth_attempts,
        COUNT(*) FILTER (WHERE event_type = 'auth.success') AS login_successes,
        MIN(event_ts) AS first_seen,
        MAX(event_ts) AS last_seen
      FROM events
      WHERE src_ip = ${ip}
        AND event_ts >= ${recentTenMinutes}
    `,
    prisma.$queryRaw<Array<RecentAuthIdentityRow>>`
      SELECT
        ARRAY_AGG(DISTINCT username) FILTER (WHERE username IS NOT NULL AND username <> '') AS usernames,
        ARRAY_AGG(DISTINCT password) FILTER (WHERE password IS NOT NULL AND password <> '') AS passwords
      FROM events
      WHERE src_ip = ${ip}
        AND event_type IN ('auth.success', 'auth.failed')
        AND event_ts >= ${recentFiveMinutes}
    `,
    prisma.$queryRaw<Array<WebAggRow>>`
      SELECT
        COUNT(*) AS total_hits,
        ARRAY_AGG(DISTINCT attack_type) AS attack_types,
        MIN(timestamp) AS first_seen,
        MAX(timestamp) AS last_seen
      FROM web_hits
      WHERE src_ip = ${ip}
        AND timestamp >= ${recentTenMinutes}
    `,
    prisma.$queryRaw<Array<ProtocolAggRow>>`
      SELECT
        protocol,
        COUNT(*) AS total_hits,
        COUNT(*) FILTER (WHERE event_type = 'auth') AS auth_attempts,
        COUNT(*) FILTER (WHERE event_type = 'command') AS command_events,
        COUNT(*) FILTER (WHERE event_type = 'connect') AS connect_events,
        ARRAY_AGG(DISTINCT dst_port) AS dst_ports,
        ARRAY_AGG(DISTINCT username) FILTER (WHERE username IS NOT NULL AND username <> '') AS usernames,
        ARRAY_AGG(DISTINCT password) FILTER (WHERE password IS NOT NULL AND password <> '') AS passwords,
        MIN(timestamp) AS first_seen,
        MAX(timestamp) AS last_seen
      FROM protocol_hits
      WHERE src_ip = ${ip}
        AND timestamp >= ${recentTenMinutes}
      GROUP BY protocol
    `,
    prisma.$queryRaw<Array<ProtocolAggRow>>`
      SELECT
        protocol,
        COUNT(*) AS total_hits,
        COUNT(*) FILTER (WHERE event_type = 'auth') AS auth_attempts,
        COUNT(*) FILTER (WHERE event_type = 'command') AS command_events,
        COUNT(*) FILTER (WHERE event_type = 'connect') AS connect_events,
        ARRAY_AGG(DISTINCT dst_port) AS dst_ports,
        ARRAY_AGG(DISTINCT username) FILTER (WHERE username IS NOT NULL AND username <> '') AS usernames,
        ARRAY_AGG(DISTINCT password) FILTER (WHERE password IS NOT NULL AND password <> '') AS passwords,
        MIN(timestamp) AS first_seen,
        MAX(timestamp) AS last_seen
      FROM protocol_hits
      WHERE src_ip = ${ip}
        AND timestamp >= ${recentFiveMinutes}
      GROUP BY protocol
    `,
    prisma.$queryRaw<Array<CommandRow>>`
      SELECT command FROM (
        SELECT command
        FROM events
        WHERE src_ip = ${ip}
          AND event_type = 'command.input'
          AND event_ts >= ${recentTwentyMinutes}
          AND command IS NOT NULL
        UNION ALL
        SELECT data->>'command' AS command
        FROM protocol_hits
        WHERE src_ip = ${ip}
          AND event_type = 'command'
          AND timestamp >= ${recentTwentyMinutes}
          AND data ? 'command'
      ) AS commands
    `,
  ])

  const ssh = sshRows[0]
  const web = webRows[0]
  const protocolSummary = summarizeProtocols(protocolRows)
  const commands = cmdRows.map((row) => row.command!).filter(Boolean)
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
            firstSeen: protocolRows.reduce<Date | null>((min, row) => !min || (row.first_seen && row.first_seen < min) ? row.first_seen : min, null),
            lastSeen: protocolRows.reduce<Date | null>((max, row) => !max || (row.last_seen && row.last_seen > max) ? row.last_seen : max, null),
          }
        : null,
    ),
  })

  if (risk.level === 'HIGH' || risk.level === 'CRITICAL') {
    const cooldownKey = risk.level === 'CRITICAL' ? 'threat_critical' : 'threat_high'
    const levelLabel = risk.level === 'CRITICAL' ? 'Critical' : 'High'
    await sendAlertOnce({
      key: `${cooldownKey}:${ip}`,
      cooldownMs: ALERT_COOLDOWN_MS[cooldownKey],
      level: risk.level === 'CRITICAL' ? 'critical' : 'high',
      title: `${risk.level === 'CRITICAL' ? 'CRITICAL' : 'HIGH'} threat detected`,
      description: `Attacker \`${ip}\` reached **${risk.score}/100** across ${protocolsSeen.length} service family${protocolsSeen.length === 1 ? '' : 'ies'}.`,
      fields: [
        { name: 'IP', value: ip, inline: true },
        { name: 'Risk', value: `${risk.score}/100 (${risk.level})`, inline: true },
        { name: 'Protocols', value: protocolsSeen.map((protocol) => protocol.toUpperCase()).join(', ') || 'n/a', inline: false },
        { name: 'Top factors', value: risk.topFactors.join('\n') || 'n/a', inline: false },
      ],
    })
  }

  const recentSsh = recentSshRows[0]
  const recentWeb = recentWebRows[0]
  const recentProtocolSummary = summarizeProtocols(recentProtocolRows)
  const recentSshIdentity = recentSshIdentities[0]
  const recentCommands = recentProtocolCommands.map((row) => row.command ?? '').filter(Boolean)
  const recentCommandCategories = classifyCommands(recentCommands)
  const recentFamilies = [
    ...(Number(recentSsh?.auth_attempts ?? 0) > 0 || Number(recentSsh?.login_successes ?? 0) > 0 ? ['ssh'] : []),
    ...(Number(recentWeb?.total_hits ?? 0) > 0 ? ['http'] : []),
    ...recentProtocolSummary.names,
  ]
  const recentServiceFamilyCount = new Set(recentFamilies).size

  const multiServiceLevel = deriveMultiServiceLevel(recentServiceFamilyCount)
  if (multiServiceLevel) {
    const key = multiServiceLevel === 'CRITICAL' ? 'multi_service_critical' : 'multi_service_high'
    await sendAlertOnce({
      key: `${key}:${ip}`,
      cooldownMs: ALERT_COOLDOWN_MS[key],
      level: multiServiceLevel === 'CRITICAL' ? 'critical' : 'high',
      title: 'Multi-service attack correlation',
      description: `Attacker \`${ip}\` touched ${recentServiceFamilyCount} service families in the last 10 minutes.`,
      fields: [
        { name: 'IP', value: ip, inline: true },
        { name: 'Families', value: [...new Set(recentFamilies)].map((name) => name.toUpperCase()).join(', '), inline: false },
        { name: 'Window', value: 'Last 10 minutes', inline: true },
      ],
    })
  }

  const recentProtocolAuthAttempts = recentProtocolRowsFiveMinute.reduce((sum, row) => sum + Number(row.auth_attempts), 0)
  const recentSshAuthAttemptsFiveMinuteRows = await prisma.$queryRaw<Array<RecentSshAggRow>>`
    SELECT
      COUNT(*) FILTER (WHERE event_type IN ('auth.success', 'auth.failed')) AS auth_attempts,
      COUNT(*) FILTER (WHERE event_type = 'auth.success') AS login_successes,
      MIN(event_ts) AS first_seen,
      MAX(event_ts) AS last_seen
    FROM events
    WHERE src_ip = ${ip}
      AND event_ts >= ${recentFiveMinutes}
  `
  const recentSshAuthFiveMinute = recentSshAuthAttemptsFiveMinuteRows[0]
  const totalAuthAttempts = Number(recentSshAuthFiveMinute?.auth_attempts ?? 0) + recentProtocolAuthAttempts
  const uniqueAuthUsernames = new Set([
    ...uniqStrings(recentSshIdentity?.usernames ?? []),
    ...uniqStrings(recentProtocolRowsFiveMinute.flatMap((row) => row.usernames ?? [])),
  ]).size
  const uniqueAuthPasswords = new Set([
    ...uniqStrings(recentSshIdentity?.passwords ?? []),
    ...uniqStrings(recentProtocolRowsFiveMinute.flatMap((row) => row.passwords ?? [])),
  ]).size

  const authBurstLevel = deriveAuthBurstLevel(totalAuthAttempts)
  if (authBurstLevel) {
    const key = authBurstLevel === 'CRITICAL' ? 'auth_burst_critical' : 'auth_burst_high'
    await sendAlertOnce({
      key: `${key}:${ip}`,
      cooldownMs: ALERT_COOLDOWN_MS[key],
      level: authBurstLevel === 'CRITICAL' ? 'critical' : 'high',
      title: 'Authentication burst detected',
      description: `Attacker \`${ip}\` generated ${totalAuthAttempts} auth attempts in the last 5 minutes.`,
      fields: [
        { name: 'IP', value: ip, inline: true },
        { name: 'Attempts', value: String(totalAuthAttempts), inline: true },
        { name: 'Usernames', value: String(uniqueAuthUsernames), inline: true },
        { name: 'Passwords', value: String(uniqueAuthPasswords), inline: true },
        { name: 'Protocols', value: [...new Set(recentFamilies)].map((name) => name.toUpperCase()).join(', ') || 'SSH', inline: false },
      ],
    })
  }

  if (Number(recentSsh?.login_successes ?? 0) > 0 && hasSuspiciousPostAuthActivity(recentCommandCategories)) {
    const suspiciousFactors = SUSPICIOUS_COMMAND_CATEGORIES
      .filter((category) => recentCommandCategories[category].length > 0)
      .map((category) => `${category}: ${recentCommandCategories[category][0]}`)
      .slice(0, 4)

    await sendAlertOnce({
      key: `post_auth_critical:${ip}`,
      cooldownMs: ALERT_COOLDOWN_MS.post_auth_critical,
      level: 'critical',
      title: 'Successful login followed by malicious activity',
      description: `Attacker \`${ip}\` authenticated and then executed suspicious post-auth commands.`,
      fields: [
        { name: 'IP', value: ip, inline: true },
        { name: 'Window', value: 'Last 20 minutes', inline: true },
        { name: 'Indicators', value: suspiciousFactors.join('\n') || 'suspicious commands observed', inline: false },
      ],
    })
  }

  if (
    hasExploitAuthSequence({
      hasPortScan: recentProtocolSummary.names.includes('port-scan'),
      webAttackTypes: recentWeb?.attack_types ?? [],
      totalAuthAttempts,
    })
  ) {
    const webTypes = (recentWeb?.attack_types ?? []).filter((type) => WEB_EXPLOIT_TYPES.includes(type))
    await sendAlertOnce({
      key: `sequence_critical:${ip}`,
      cooldownMs: ALERT_COOLDOWN_MS.sequence_critical,
      level: 'critical',
      title: 'Attack chain detected',
      description: `Attacker \`${ip}\` matched the sequence scan -> exploit -> auth in a short window.`,
      fields: [
        { name: 'IP', value: ip, inline: true },
        { name: 'Web exploit', value: webTypes.join(', ') || 'n/a', inline: true },
        { name: 'Auth attempts', value: String(totalAuthAttempts), inline: true },
        { name: 'Window', value: 'Last 10 minutes', inline: false },
      ],
    })
  }
}

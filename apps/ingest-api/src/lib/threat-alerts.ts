import type { PrismaClient } from '@prisma/client'
import { computeRiskScore } from './risk-score.js'
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

const ALERT_COOLDOWN_MS: Record<'HIGH' | 'CRITICAL', number> = {
  HIGH: 30 * 60 * 1000,
  CRITICAL: 15 * 60 * 1000,
}

const lastAlertSent = new Map<string, number>()

function uniqStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

function summarizeProtocols(rows: ProtocolAggRow[]) {
  const names: string[] = []
  const portSet = new Set<number>()
  const usernameProtocols = new Map<string, Set<string>>()
  const passwordProtocols = new Map<string, Set<string>>()

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
      if (!usernameProtocols.has(username)) usernameProtocols.set(username, new Set())
      usernameProtocols.get(username)!.add(row.protocol)
    }

    for (const password of uniqStrings(row.passwords ?? [])) {
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

function shouldSendThreatAlert(ip: string, level: 'HIGH' | 'CRITICAL') {
  const key = `${ip}:${level}`
  const now = Date.now()
  const lastSent = lastAlertSent.get(key)
  if (lastSent && now - lastSent < ALERT_COOLDOWN_MS[level]) return false
  lastAlertSent.set(key, now)
  return true
}

export async function evaluateThreatAlert(prisma: PrismaClient, ip: string): Promise<void> {
  if (!ip || typeof (prisma as Partial<PrismaClient>).$queryRaw !== 'function') {
    return
  }

  const [sshRows, cmdRows, webRows, protocolRows] = await Promise.all([
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

  if (risk.level !== 'HIGH' && risk.level !== 'CRITICAL') return
  if (!shouldSendThreatAlert(ip, risk.level)) return

  const levelLabel = risk.level === 'CRITICAL' ? 'Critical' : 'High'
  const title = `${risk.level === 'CRITICAL' ? '🚨' : '⚠️'} ${levelLabel} threat detected`
  const description = `Attacker \`${ip}\` reached **${risk.score}/100** across ${protocolsSeen.length} service family${protocolsSeen.length === 1 ? '' : 'ies'}.`

  await sendDiscordAlert({
    level: risk.level === 'CRITICAL' ? 'critical' : 'high',
    title,
    description,
    fields: [
      { name: 'IP', value: ip, inline: true },
      { name: 'Risk', value: `${risk.score}/100 (${risk.level})`, inline: true },
      { name: 'Protocols', value: protocolsSeen.map((protocol) => protocol.toUpperCase()).join(', ') || 'n/a', inline: false },
      { name: 'Top factors', value: risk.topFactors.join('\n') || 'n/a', inline: false },
    ],
  })
}

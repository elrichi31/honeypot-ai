import type { PrismaClient } from '@prisma/client'

export type SshAggRow = {
  sessions: bigint
  auth_attempts: bigint
  had_success: boolean
  first_seen: Date | null
  last_seen: Date | null
}

export type WebAggRow = {
  total_hits: bigint
  attack_types: string[]
  first_seen: Date | null
  last_seen: Date | null
}

export type ProtocolAggRow = {
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

export type RecentSshAggRow = {
  auth_attempts: bigint
  login_successes: bigint
  first_seen: Date | null
  last_seen: Date | null
}

export type RecentAuthIdentityRow = {
  usernames: (string | null)[] | null
  passwords: (string | null)[] | null
}

export type CommandRow = {
  command: string | null
}

export type SensorOfflineRow = {
  sensor_id: string
  name: string
  protocol: string
  ip: string
  last_seen: Date
}

export async function querySshAggregate(prisma: PrismaClient, ip: string) {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  return prisma.$queryRaw<Array<SshAggRow>>`
    SELECT
      COUNT(DISTINCT s.id) AS sessions,
      COUNT(e.id) FILTER (WHERE e.event_type IN ('auth.success','auth.failed')) AS auth_attempts,
      BOOL_OR(s.login_success) AS had_success,
      MIN(s.started_at) AS first_seen,
      MAX(COALESCE(s.ended_at, s.started_at)) AS last_seen
    FROM sessions s
    LEFT JOIN events e ON e.session_id = s.id
    WHERE s.src_ip = ${ip}
      AND s.started_at >= ${cutoff}
  `
}

export async function queryWebAggregate(prisma: PrismaClient, ip: string) {
  return prisma.$queryRaw<Array<WebAggRow>>`
    SELECT
      COUNT(*) AS total_hits,
      ARRAY_AGG(DISTINCT attack_type) AS attack_types,
      MIN(timestamp) AS first_seen,
      MAX(timestamp) AS last_seen
    FROM web_hits
    WHERE src_ip = ${ip}
  `
}

export async function queryProtocolAggregate(prisma: PrismaClient, ip: string) {
  return prisma.$queryRaw<Array<ProtocolAggRow>>`
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
  `
}

export async function queryRecentSshAggregate(prisma: PrismaClient, ip: string, since: Date) {
  return prisma.$queryRaw<Array<RecentSshAggRow>>`
    SELECT
      COUNT(*) FILTER (WHERE event_type IN ('auth.success', 'auth.failed')) AS auth_attempts,
      COUNT(*) FILTER (WHERE event_type = 'auth.success') AS login_successes,
      MIN(event_ts) AS first_seen,
      MAX(event_ts) AS last_seen
    FROM events
    WHERE src_ip = ${ip}
      AND event_ts >= ${since}
  `
}

export async function queryRecentAuthIdentity(prisma: PrismaClient, ip: string, since: Date) {
  return prisma.$queryRaw<Array<RecentAuthIdentityRow>>`
    SELECT
      ARRAY_AGG(DISTINCT username) FILTER (WHERE username IS NOT NULL AND username <> '') AS usernames,
      ARRAY_AGG(DISTINCT password) FILTER (WHERE password IS NOT NULL AND password <> '') AS passwords
    FROM events
    WHERE src_ip = ${ip}
      AND event_type IN ('auth.success', 'auth.failed')
      AND event_ts >= ${since}
  `
}

export async function queryRecentWebAggregate(prisma: PrismaClient, ip: string, since: Date) {
  return prisma.$queryRaw<Array<WebAggRow>>`
    SELECT
      COUNT(*) AS total_hits,
      ARRAY_AGG(DISTINCT attack_type) AS attack_types,
      MIN(timestamp) AS first_seen,
      MAX(timestamp) AS last_seen
    FROM web_hits
    WHERE src_ip = ${ip}
      AND timestamp >= ${since}
  `
}

export async function queryRecentProtocolAggregate(prisma: PrismaClient, ip: string, since: Date) {
  return prisma.$queryRaw<Array<ProtocolAggRow>>`
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
      AND timestamp >= ${since}
    GROUP BY protocol
  `
}

export async function queryRecentCommands(prisma: PrismaClient, ip: string, since: Date) {
  return prisma.$queryRaw<Array<CommandRow>>`
    SELECT command FROM (
      SELECT command
      FROM events
      WHERE src_ip = ${ip}
        AND event_type = 'command.input'
        AND event_ts >= ${since}
        AND command IS NOT NULL
      UNION ALL
      SELECT data->>'command' AS command
      FROM protocol_hits
      WHERE src_ip = ${ip}
        AND event_type = 'command'
        AND timestamp >= ${since}
        AND data ? 'command'
    ) AS commands
    LIMIT 200
  `
}

export async function querySshCommands(prisma: PrismaClient, ip: string) {
  return prisma.event.findMany({
    where: { srcIp: ip, eventType: 'command.input', command: { not: null } },
    select: { command: true },
    orderBy: { eventTs: 'desc' },
    take: 500,
  })
}

export async function queryOfflineSensors(prisma: PrismaClient) {
  return prisma.$queryRaw<Array<SensorOfflineRow>>`
    SELECT sensor_id, name, protocol, ip, last_seen
    FROM sensors
    WHERE last_seen < NOW() - INTERVAL '2 minutes'
      AND last_seen > NOW() - INTERVAL '2 days'
    ORDER BY last_seen ASC
  `
}

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
    authAttempts, commandEvents, connectEvents,
    uniquePorts: portSet.size, credentialReuse,
    uniqueUsernames: usernames.size, uniquePasswords: passwords.size,
  }
}

export function buildTimeWindowMinutes(
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

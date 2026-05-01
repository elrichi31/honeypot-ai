import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { computeRiskScore, classifyCommands } from '../lib/risk-score.js'

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 5000

const threatListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().min(1).optional(),
  level: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).optional(),
  crossProtocol: z.coerce.boolean().optional(),
})

type SshAggRow = {
  src_ip: string
  sessions: bigint
  auth_attempts: bigint
  had_success: boolean
  first_seen: Date | null
  last_seen: Date | null
}

type WebAggRow = {
  src_ip: string
  total_hits: bigint
  attack_types: string[]
  first_seen: Date | null
  last_seen: Date | null
}

type ProtocolAggRow = {
  src_ip: string
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

type ProtocolServiceSummary = {
  hits: number
  authAttempts: number
  commandEvents: number
  connectEvents: number
  ports: number[]
}

type ProtocolSummary = {
  names: string[]
  totalHits: number
  authAttempts: number
  commandEvents: number
  connectEvents: number
  uniquePorts: number
  credentialReuse: boolean
  byService: Record<string, ProtocolServiceSummary>
  usernames: string[]
  passwords: string[]
}

function uniqStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

function buildProtocolSummary(rows: ProtocolAggRow[]): ProtocolSummary | null {
  if (rows.length === 0) return null

  const byService: Record<string, ProtocolServiceSummary> = {}
  const portSet = new Set<number>()
  const usernameProtocols = new Map<string, Set<string>>()
  const passwordProtocols = new Map<string, Set<string>>()
  const usernames: string[] = []
  const passwords: string[] = []

  let totalHits = 0
  let authAttempts = 0
  let commandEvents = 0
  let connectEvents = 0

  for (const row of rows) {
    const protocol = row.protocol
    const ports = [...new Set((row.dst_ports ?? []).filter((port): port is number => typeof port === 'number'))]

    totalHits += Number(row.total_hits)
    authAttempts += Number(row.auth_attempts)
    commandEvents += Number(row.command_events)
    connectEvents += Number(row.connect_events)

    for (const port of ports) portSet.add(port)

    const serviceUsernames = uniqStrings(row.usernames ?? [])
    const servicePasswords = uniqStrings(row.passwords ?? [])

    usernames.push(...serviceUsernames)
    passwords.push(...servicePasswords)

    for (const username of serviceUsernames) {
      if (!usernameProtocols.has(username)) usernameProtocols.set(username, new Set())
      usernameProtocols.get(username)!.add(protocol)
    }

    for (const password of servicePasswords) {
      if (!passwordProtocols.has(password)) passwordProtocols.set(password, new Set())
      passwordProtocols.get(password)!.add(protocol)
    }

    byService[protocol] = {
      hits: Number(row.total_hits),
      authAttempts: Number(row.auth_attempts),
      commandEvents: Number(row.command_events),
      connectEvents: Number(row.connect_events),
      ports,
    }
  }

  const credentialReuse =
    [...usernameProtocols.values(), ...passwordProtocols.values()].some((protocols) => protocols.size > 1)

  return {
    names: Object.keys(byService),
    totalHits,
    authAttempts,
    commandEvents,
    connectEvents,
    uniquePorts: portSet.size,
    credentialReuse,
    byService,
    usernames: uniqStrings(usernames),
    passwords: uniqStrings(passwords),
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

function protocolRange(rows: ProtocolAggRow[]) {
  if (rows.length === 0) return null

  let firstSeen: Date | null = null
  let lastSeen: Date | null = null

  for (const row of rows) {
    if (row.first_seen && (!firstSeen || row.first_seen < firstSeen)) firstSeen = row.first_seen
    if (row.last_seen && (!lastSeen || row.last_seen > lastSeen)) lastSeen = row.last_seen
  }

  return { firstSeen, lastSeen }
}

function buildThreatItem({
  ip,
  ssh,
  web,
  cmds,
  protocolRows,
}: {
  ip: string
  ssh?: SshAggRow
  web?: WebAggRow
  cmds: string[]
  protocolRows: ProtocolAggRow[]
}) {
  const protocolSummary = buildProtocolSummary(protocolRows)
  const protocolsSeen = [
    ...(ssh && Number(ssh.sessions) > 0 ? ['ssh'] : []),
    ...(web && Number(web.total_hits) > 0 ? ['http'] : []),
    ...(protocolSummary?.names ?? []),
  ]
  const crossProtocol = protocolsSeen.length > 1
  const timeWindowMinutes = buildTimeWindowMinutes(
    ssh ? { firstSeen: ssh.first_seen, lastSeen: ssh.last_seen } : null,
    web ? { firstSeen: web.first_seen, lastSeen: web.last_seen } : null,
    protocolRange(protocolRows),
  )

  const risk = computeRiskScore({
    sshSessions: Number(ssh?.sessions ?? 0),
    sshAuthAttempts: Number(ssh?.auth_attempts ?? 0),
    sshLoginSuccess: ssh?.had_success ?? false,
    commands: cmds,
    webHits: Number(web?.total_hits ?? 0),
    webAttackTypes: web?.attack_types ?? [],
    protocolsSeen,
    protocolAuthAttempts: protocolSummary?.authAttempts ?? 0,
    protocolCommandCount: protocolSummary?.commandEvents ?? 0,
    protocolConnectCount: protocolSummary?.connectEvents ?? 0,
    protocolUniquePorts: protocolSummary?.uniquePorts ?? 0,
    credentialReuse: protocolSummary?.credentialReuse ?? false,
    timeWindowMinutes,
  })

  return {
    ip,
    protocolsSeen,
    crossProtocol,
    ssh: ssh ? {
      sessions: Number(ssh.sessions),
      authAttempts: Number(ssh.auth_attempts),
      loginSuccess: ssh.had_success,
      commandCount: cmds.length,
    } : null,
    web: web ? {
      hits: Number(web.total_hits),
      attackTypes: web.attack_types,
    } : null,
    protocols: protocolSummary,
    score: risk.score,
    level: risk.level,
    breakdown: risk.breakdown,
    commandCategories: Object.fromEntries(
      Object.entries(risk.commandCategories).map(([key, value]) => [key, value.length]),
    ),
    topFactors: risk.topFactors,
  }
}

export async function threatRoutes(fastify: FastifyInstance) {
  fastify.get('/threats', async (request, reply) => {
    const parsed = threatListQuerySchema.safeParse(request.query)

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query params',
        details: parsed.error.flatten().fieldErrors,
      })
    }

    const pageSize = Math.min(
      parsed.data.pageSize ?? parsed.data.limit ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const offset = parsed.data.offset ?? ((parsed.data.page ?? 1) - 1) * pageSize
    const page = parsed.data.page ?? Math.floor(offset / pageSize) + 1
    const search = parsed.data.q?.toLowerCase()

    const [sshRows, cmdRows, webRows, protocolRows] = await Promise.all([
      fastify.prisma.$queryRaw<Array<SshAggRow>>`
        SELECT
          s.src_ip,
          COUNT(DISTINCT s.id) AS sessions,
          COUNT(e.id) FILTER (WHERE e.event_type IN ('auth.success','auth.failed')) AS auth_attempts,
          BOOL_OR(s.login_success) AS had_success,
          MIN(s.started_at) AS first_seen,
          MAX(COALESCE(s.ended_at, s.started_at)) AS last_seen
        FROM sessions s
        LEFT JOIN events e ON e.session_id = s.id
        GROUP BY s.src_ip
      `,
      fastify.prisma.$queryRaw<Array<{ src_ip: string; command: string }>>`
        SELECT DISTINCT e.src_ip, e.command
        FROM events e
        WHERE e.event_type = 'command.input'
          AND e.command IS NOT NULL
      `,
      fastify.prisma.$queryRaw<Array<WebAggRow>>`
        SELECT
          src_ip,
          COUNT(*) AS total_hits,
          ARRAY_AGG(DISTINCT attack_type) AS attack_types,
          MIN(timestamp) AS first_seen,
          MAX(timestamp) AS last_seen
        FROM web_hits
        GROUP BY src_ip
      `,
      fastify.prisma.$queryRaw<Array<ProtocolAggRow>>`
        SELECT
          src_ip,
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
        GROUP BY src_ip, protocol
      `,
    ])

    const sshMap = new Map(sshRows.map((row) => [row.src_ip, row]))
    const webMap = new Map(webRows.map((row) => [row.src_ip, row]))

    const cmdsByIp = new Map<string, string[]>()
    for (const row of cmdRows) {
      if (!cmdsByIp.has(row.src_ip)) cmdsByIp.set(row.src_ip, [])
      cmdsByIp.get(row.src_ip)!.push(row.command)
    }

    const protocolRowsByIp = new Map<string, ProtocolAggRow[]>()
    for (const row of protocolRows) {
      if (!protocolRowsByIp.has(row.src_ip)) protocolRowsByIp.set(row.src_ip, [])
      protocolRowsByIp.get(row.src_ip)!.push(row)
    }

    const allIps = new Set([
      ...sshMap.keys(),
      ...webMap.keys(),
      ...protocolRowsByIp.keys(),
    ])

    const threats = Array.from(allIps).map((ip) =>
      buildThreatItem({
        ip,
        ssh: sshMap.get(ip),
        web: webMap.get(ip),
        cmds: cmdsByIp.get(ip) ?? [],
        protocolRows: protocolRowsByIp.get(ip) ?? [],
      }),
    )

    threats.sort((a, b) => b.score - a.score)

    const filteredThreats = threats.filter((threat) => {
      if (search && !threat.ip.toLowerCase().includes(search)) return false
      if (parsed.data.level && threat.level !== parsed.data.level) return false
      if (
        parsed.data.crossProtocol !== undefined &&
        threat.crossProtocol !== parsed.data.crossProtocol
      ) {
        return false
      }
      return true
    })

    const total = filteredThreats.length
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize)
    const items = filteredThreats.slice(offset, offset + pageSize)

    return reply.send({
      items,
      summary: {
        total,
        critical: filteredThreats.filter((threat) => threat.level === 'CRITICAL').length,
        high: filteredThreats.filter((threat) => threat.level === 'HIGH').length,
        crossProtocol: filteredThreats.filter((threat) => threat.crossProtocol).length,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    })
  })

  fastify.get('/threats/:ip', async (request, reply) => {
    const { ip } = request.params as { ip: string }

    const [sshRows, cmdRows, webRows, protocolRows] = await Promise.all([
      fastify.prisma.$queryRaw<Array<Omit<SshAggRow, 'src_ip'>>>`
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
      fastify.prisma.event.findMany({
        where: { srcIp: ip, eventType: 'command.input', command: { not: null } },
        select: { command: true, eventTs: true },
        orderBy: { eventTs: 'asc' },
      }),
      fastify.prisma.$queryRaw<Array<Omit<WebAggRow, 'src_ip'>>>`
        SELECT
          COUNT(*) AS total_hits,
          ARRAY_AGG(DISTINCT attack_type) AS attack_types,
          MIN(timestamp) AS first_seen,
          MAX(timestamp) AS last_seen
        FROM web_hits
        WHERE src_ip = ${ip}
      `,
      fastify.prisma.$queryRaw<Array<Omit<ProtocolAggRow, 'src_ip'>>>`
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
    const cmds = cmdRows.map((row) => row.command!)

    const threat = buildThreatItem({
      ip,
      ssh: Number(ssh?.sessions ?? 0) > 0 ? { src_ip: ip, ...ssh } : undefined,
      web: Number(web?.total_hits ?? 0) > 0 ? { src_ip: ip, ...web } : undefined,
      cmds,
      protocolRows: protocolRows.map((row) => ({ src_ip: ip, ...row })),
    })

    return reply.send({
      ip,
      protocolsSeen: threat.protocolsSeen,
      crossProtocol: threat.crossProtocol,
      ssh: threat.ssh ? {
        sessions: threat.ssh.sessions,
        authAttempts: threat.ssh.authAttempts,
        loginSuccess: threat.ssh.loginSuccess,
      } : null,
      web: threat.web,
      protocols: threat.protocols,
      risk: {
        score: threat.score,
        level: threat.level,
        breakdown: threat.breakdown,
        topFactors: threat.topFactors,
        commandCategories: classifyCommands(cmds),
      },
      classifiedCommands: cmdRows.map((row) => ({
        command: row.command,
        ts: row.eventTs,
        category: Object.entries(classifyCommands([row.command!]))
          .find(([, commands]) => commands.length > 0)?.[0] ?? 'other',
      })),
    })
  })
}

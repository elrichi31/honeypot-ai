import type { FastifyInstance, FastifyReply } from 'fastify'
import { withCache } from '../lib/cache-helper.js'
import { z } from 'zod'
import { classifyCommands, computeRiskScore } from '../lib/risk-score.js'
import { basePaginationSchema, buildPaginationResponse, getPagination } from '../lib/pagination.js'
import {
  buildThreatAggregates,
  formatThreatResponse,
  type ProtocolAggRow,
  type SshAggRow,
  type ThreatItem,
  type WebAggRow,
} from '../lib/threat-format.js'
import {
  queryThreatCommandRows,
  queryThreatCommandsByIp,
  queryThreatProtocolRowsByIp,
  queryThreatSshRow,
  queryThreatWebRow,
  queryThreatSummaryRows,
  type ThreatSummaryRow,
  type ThreatScope,
} from '../lib/threat-route-queries.js'
import { resolveClientSensors } from '../lib/client-helpers.js'

const RISK_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const
const COMMAND_CATEGORIES = [
  'malware_drop', 'persistence', 'lateral_movement', 'crypto_mining', 'data_exfil', 'recon', 'other',
] as const

type RiskLevel = (typeof RISK_LEVELS)[number]

/** Parse a comma-separated query value into a deduped list filtered to `allowed`. */
function csvEnum<T extends string>(allowed: readonly T[]) {
  const allowedSet = new Set<string>(allowed)
  return z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return [] as T[]
      const parts = value.split(',').map((part) => part.trim()).filter(Boolean)
      return [...new Set(parts)].filter((part): part is T => allowedSet.has(part))
    })
}

const threatListQuerySchema = basePaginationSchema.extend({
  q: z.string().trim().min(1).optional(),
  // `level` (single) kept for backward compatibility; `levels` (CSV) is the multi-select form.
  level: z.enum(RISK_LEVELS).optional(),
  levels: csvEnum(RISK_LEVELS),
  commands: csvEnum(COMMAND_CATEGORIES),
  crossProtocol: z.coerce.boolean().optional(),
  sortBy: z.enum(['score', 'sessions', 'webHits', 'protocols']).default('score'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  // Per-client / per-sensor scoping, mirroring the web-attacks filters. clientSlug
  // resolves to the client's sensor set; sensorId narrows to a single sensor.
  clientSlug: z.string().trim().min(1).optional(),
  sensorId: z.string().trim().min(1).optional(),
})

type ThreatListQuery = z.infer<typeof threatListQuerySchema>

/** Effective set of levels to filter by, merging the legacy single `level`. */
function effectiveLevels(query: ThreatListQuery): RiskLevel[] {
  const set = new Set<RiskLevel>(query.levels)
  if (query.level) set.add(query.level)
  return [...set]
}

function groupCommands(rows: Array<{ src_ip: string; command: string }>) {
  const groups = new Map<string, string[]>()
  for (const row of rows) {
    groups.set(row.src_ip, [...(groups.get(row.src_ip) ?? []), row.command])
  }
  return groups
}

function buildThreat(
  ip: string,
  ssh: SshAggRow | undefined,
  web: WebAggRow | undefined,
  cmds: string[],
  protocols: ProtocolAggRow[],
  portScanEvents = 0,
  portScanUniquePorts = 0,
) {
  const agg = buildThreatAggregates(ip, ssh, web, cmds, protocols)
  const risk = computeRiskScore({
    sshSessions: Number(ssh?.sessions ?? 0),
    sshAuthAttempts: Number(ssh?.auth_attempts ?? 0),
    sshLoginSuccess: ssh?.had_success ?? false,
    commands: cmds,
    webHits: Number(web?.total_hits ?? 0),
    webAttackTypes: web?.attack_types ?? [],
    protocolsSeen: agg.protocolsSeen,
    protocolAuthAttempts: agg.protocolSummary?.authAttempts ?? 0,
    protocolCommandCount: agg.protocolSummary?.commandEvents ?? 0,
    protocolConnectCount: agg.protocolSummary?.connectEvents ?? 0,
    protocolUniquePorts: agg.protocolSummary?.uniquePorts ?? 0,
    credentialReuse: agg.protocolSummary?.credentialReuse ?? false,
    timeWindowMinutes: agg.timeWindowMinutes,
    portScanEvents,
    portScanUniquePorts,
  })
  return formatThreatResponse(agg, risk)
}

const THREATS_CACHE_KEY = 'threats:list'
const THREATS_CACHE_TTL = 180 // 3 minutes
const THREATS_FILTERED_TTL = 300 // 5 minutes for filtered/search results

function summaryRowToSshRow(row: ThreatSummaryRow): SshAggRow | undefined {
  if (!row.ssh_sessions) return undefined
  return {
    src_ip: row.src_ip,
    sessions: row.ssh_sessions,
    auth_attempts: row.ssh_auth_attempts,
    had_success: row.ssh_had_success,
    first_seen: row.ssh_first_seen,
    last_seen: row.ssh_last_seen,
  }
}

function summaryRowToWebRow(row: ThreatSummaryRow): WebAggRow | undefined {
  if (!row.web_total_hits) return undefined
  return {
    src_ip: row.src_ip,
    total_hits: row.web_total_hits,
    attack_types: row.web_attack_types ?? [],
    first_seen: row.web_first_seen,
    last_seen: row.web_last_seen,
  }
}

function summaryRowToProtocolRows(row: ThreatSummaryRow): ProtocolAggRow[] {
  if (!row.proto_total_hits) return []
  // The view aggregates protocol_hits per-IP. For risk scoring we only need the
  // combined numbers; the per-protocol breakdown is only shown on the detail page.
  // We synthesize a single "aggregate" row using a sentinel protocol list so the
  // threat format layer can compute protocolsSeen and protocolSummary correctly.
  return (row.protocols_seen ?? []).map((protocol) => ({
    src_ip: row.src_ip,
    protocol,
    total_hits: row.proto_total_hits,
    auth_attempts: row.proto_auth_attempts,
    command_events: row.proto_command_events,
    connect_events: row.proto_connect_events,
    dst_ports: null,
    usernames: null,
    passwords: null,
    first_seen: row.proto_first_seen,
    last_seen: row.proto_last_seen,
  }))
}

async function fetchThreats(fastify: FastifyInstance, ipFilter?: string, scope?: ThreatScope) {
  const db = fastify.prismaRead
  const [summaryRows, cmdRows] = await Promise.all([
    queryThreatSummaryRows(db, ipFilter, scope),
    queryThreatCommandRows(db, ipFilter, scope),
  ])
  const cmdsByIp = groupCommands(cmdRows)
  return summaryRows.map((row) =>
    buildThreat(
      row.src_ip,
      summaryRowToSshRow(row),
      summaryRowToWebRow(row),
      cmdsByIp.get(row.src_ip) ?? [],
      summaryRowToProtocolRows(row),
      Number(row.scan_events ?? 0),
      (row.scanned_ports ?? []).length,
    )
  )
}

function filterThreats(threats: ThreatItem[], query: ThreatListQuery) {
  const search = query.q?.toLowerCase()
  const levels = effectiveLevels(query)
  const levelSet = levels.length ? new Set(levels) : null
  const commands = query.commands
  return threats.filter((threat) => {
    if (search && !threat.ip.toLowerCase().includes(search)) return false
    if (levelSet && !levelSet.has(threat.level)) return false
    // Detected-commands filter: OR — keep IPs that have at least one selected category.
    if (commands.length && !commands.some((category) => (threat.commandCategories[category] ?? 0) > 0)) {
      return false
    }
    return query.crossProtocol === undefined || threat.crossProtocol === query.crossProtocol
  })
}

function compareThreats(a: ThreatItem, b: ThreatItem, sortBy: ThreatListQuery['sortBy']) {
  if (sortBy === 'sessions') return (a.ssh?.sessions ?? 0) - (b.ssh?.sessions ?? 0)
  if (sortBy === 'webHits') return (a.web?.hits ?? 0) - (b.web?.hits ?? 0)
  if (sortBy === 'protocols') return a.protocolsSeen.length - b.protocolsSeen.length
  return a.score - b.score
}

function sortThreats(threats: ThreatItem[], query: ThreatListQuery) {
  threats.sort((a, b) => {
    const cmp = compareThreats(a, b, query.sortBy)
    return query.sortDir === 'asc' ? cmp : -cmp
  })
}

function sendInvalidQuery(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({
    error: 'Invalid query params',
    details: error.flatten().fieldErrors,
  })
}

// Turn the optional clientSlug/sensorId query params into a concrete sensor
// scope plus a cache-key suffix. A bare sensorId scopes to that one sensor. A
// clientSlug resolves to the client's sensors (empty set if the client is
// unknown or has none — which the queries render as "match nothing"). sensorId
// wins when both are present, matching the web-attacks filter semantics.
async function resolveThreatScope(
  fastify: FastifyInstance,
  clientSlug: string | undefined,
  sensorId: string | undefined,
): Promise<{ scope: ThreatScope; scopeKey: string }> {
  if (sensorId) return { scope: { sensorIds: [sensorId] }, scopeKey: `:s=${sensorId}` }
  if (clientSlug) {
    const cs = await resolveClientSensors(fastify.prismaRead, clientSlug)
    const sensorIds = cs?.sensorIds ?? []
    return { scope: { sensorIds }, scopeKey: `:c=${clientSlug}` }
  }
  return { scope: undefined, scopeKey: '' }
}

async function handleListThreats(fastify: FastifyInstance, query: unknown, reply: FastifyReply) {
  const parsed = threatListQuerySchema.safeParse(query)
  if (!parsed.success) return sendInvalidQuery(reply, parsed.error)
  const { page, pageSize, offset } = getPagination(parsed.data)

  // Resolve the optional client/sensor scope to a concrete sensor set. A client
  // with zero sensors (or an unknown slug) yields an empty scope, which the
  // queries treat as "match nothing" so the view is correctly empty rather than
  // silently global.
  const { scope, scopeKey } = await resolveThreatScope(fastify, parsed.data.clientSlug, parsed.data.sensorId)

  const levels = effectiveLevels(parsed.data)
  const commands = parsed.data.commands
  const hasFilters = Boolean(parsed.data.q) || levels.length > 0 || commands.length > 0 || parsed.data.crossProtocol !== undefined

  const threats: ThreatItem[] = await (() => {
    if (!hasFilters) {
      return withCache(fastify.cache, `${THREATS_CACHE_KEY}${scopeKey}`, THREATS_CACHE_TTL, () => fetchThreats(fastify, undefined, scope))
    }
    const filteredKey = `threats:filtered${scopeKey}:${parsed.data.q ?? ''}:${levels.sort().join('+')}:${[...commands].sort().join('+')}:${parsed.data.crossProtocol ?? ''}`
    return withCache(fastify.cache, filteredKey, THREATS_FILTERED_TTL, async () =>
      filterThreats(await fetchThreats(fastify, parsed.data.q, scope), parsed.data)
    )
  })()

  sortThreats(threats, parsed.data)
  const items = threats.slice(offset, offset + pageSize)
  return reply.send({
    items,
    summary: buildSummary(threats),
    pagination: buildPaginationResponse(threats.length, page, pageSize),
  })
}

function buildSummary(threats: ThreatItem[]) {
  return {
    total: threats.length,
    critical: threats.filter((threat) => threat.level === 'CRITICAL').length,
    high: threats.filter((threat) => threat.level === 'HIGH').length,
    crossProtocol: threats.filter((threat) => threat.crossProtocol).length,
  }
}

function commandCategory(command: string | null) {
  if (!command) return 'other'
  return Object.entries(classifyCommands([command])).find(([, commands]) => commands.length > 0)?.[0] ?? 'other'
}

async function fetchThreatByIp(fastify: FastifyInstance, ip: string) {
  const db = fastify.prismaRead
  const [sshRows, cmdRows, webRows, protocolRows, portscanRows] = await Promise.all([
    queryThreatSshRow(db, ip),
    queryThreatCommandsByIp(db, ip),
    queryThreatWebRow(db, ip),
    queryThreatProtocolRowsByIp(db, ip),
    db.$queryRaw<Array<{ scan_events: bigint; scanned_ports: number[] }>>`
      SELECT COUNT(*) AS scan_events, ARRAY_AGG(DISTINCT UNNEST(dst_ports)) AS scanned_ports
      FROM deception_portscans WHERE src_ip = ${ip}
    `,
  ])
  const cmds = cmdRows.flatMap((row) => row.command ? [row.command] : [])
  const ps = portscanRows[0]
  const portScanEvents = Number(ps?.scan_events ?? 0)
  const portScanUniquePorts = (ps?.scanned_ports ?? []).length
  return {
    threat: buildThreat(ip, sshRows[0], webRows[0], cmds, protocolRows, portScanEvents, portScanUniquePorts),
    cmdRows,
    cmds,
    portScanEvents,
    portScanUniquePorts,
    scannedPorts: ps?.scanned_ports ?? [],
  }
}

async function handleGetThreat(fastify: FastifyInstance, params: unknown, reply: FastifyReply) {
  const { ip } = params as { ip: string }
  const { threat, cmdRows, cmds, portScanEvents, portScanUniquePorts, scannedPorts } = await fetchThreatByIp(fastify, ip)
  return reply.send({
    ip,
    protocolsSeen: threat.protocolsSeen,
    crossProtocol: threat.crossProtocol,
    ssh: threat.ssh ? stripCommandCount(threat.ssh) : null,
    web: threat.web,
    protocols: threat.protocols,
    portScans: portScanEvents > 0 ? { events: portScanEvents, uniquePorts: portScanUniquePorts, ports: scannedPorts } : null,
    risk: buildRiskResponse(threat, cmds),
    classifiedCommands: cmdRows.map((row) => ({
      command: row.command,
      ts: row.eventTs,
      category: commandCategory(row.command),
    })),
  })
}

function stripCommandCount(ssh: NonNullable<ThreatItem['ssh']>) {
  return {
    sessions: ssh.sessions,
    authAttempts: ssh.authAttempts,
    loginSuccess: ssh.loginSuccess,
  }
}

function buildRiskResponse(threat: ThreatItem, cmds: string[]) {
  return {
    score: threat.score,
    level: threat.level,
    breakdown: threat.breakdown,
    topFactors: threat.topFactors,
    commandCategories: classifyCommands(cmds),
  }
}

export async function threatRoutes(fastify: FastifyInstance) {
  fastify.get('/threats', (request, reply) => handleListThreats(fastify, request.query, reply))
  fastify.get('/threats/:ip', (request, reply) => handleGetThreat(fastify, request.params, reply))
}

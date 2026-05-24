import type { FastifyInstance, FastifyReply } from 'fastify'
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
  queryThreatProtocolRows,
  queryThreatProtocolRowsByIp,
  queryThreatSshRow,
  queryThreatSshRows,
  queryThreatWebRow,
  queryThreatWebRows,
} from '../lib/threat-route-queries.js'

const threatListQuerySchema = basePaginationSchema.extend({
  q: z.string().trim().min(1).optional(),
  level: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).optional(),
  crossProtocol: z.coerce.boolean().optional(),
  sortBy: z.enum(['score', 'sessions', 'webHits', 'protocols']).default('score'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
})

type ThreatListQuery = z.infer<typeof threatListQuerySchema>

function groupCommands(rows: Array<{ src_ip: string; command: string }>) {
  const groups = new Map<string, string[]>()
  for (const row of rows) {
    groups.set(row.src_ip, [...(groups.get(row.src_ip) ?? []), row.command])
  }
  return groups
}

function groupProtocols(rows: ProtocolAggRow[]) {
  const groups = new Map<string, ProtocolAggRow[]>()
  for (const row of rows) {
    groups.set(row.src_ip, [...(groups.get(row.src_ip) ?? []), row])
  }
  return groups
}

function buildThreat(ip: string, ssh: SshAggRow | undefined, web: WebAggRow | undefined, cmds: string[], protocols: ProtocolAggRow[]) {
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
  })
  return formatThreatResponse(agg, risk)
}

async function fetchThreats(fastify: FastifyInstance) {
  const [sshRows, cmdRows, webRows, protocolRows] = await Promise.all([
    queryThreatSshRows(fastify.prisma),
    queryThreatCommandRows(fastify.prisma),
    queryThreatWebRows(fastify.prisma),
    queryThreatProtocolRows(fastify.prisma),
  ])
  const sshMap = new Map(sshRows.map((row) => [row.src_ip, row]))
  const webMap = new Map(webRows.map((row) => [row.src_ip, row]))
  const cmdsByIp = groupCommands(cmdRows)
  const protocolsByIp = groupProtocols(protocolRows)
  const ips = new Set([...sshMap.keys(), ...webMap.keys(), ...protocolsByIp.keys()])
  return [...ips].map((ip) => buildThreat(ip, sshMap.get(ip), webMap.get(ip), cmdsByIp.get(ip) ?? [], protocolsByIp.get(ip) ?? []))
}

function filterThreats(threats: ThreatItem[], query: ThreatListQuery) {
  const search = query.q?.toLowerCase()
  return threats.filter((threat) => {
    if (search && !threat.ip.toLowerCase().includes(search)) return false
    if (query.level && threat.level !== query.level) return false
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

async function handleListThreats(fastify: FastifyInstance, query: unknown, reply: FastifyReply) {
  const parsed = threatListQuerySchema.safeParse(query)
  if (!parsed.success) return sendInvalidQuery(reply, parsed.error)
  const { page, pageSize, offset } = getPagination(parsed.data)
  const threats = filterThreats(await fetchThreats(fastify), parsed.data)
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
  const [sshRows, cmdRows, webRows, protocolRows] = await Promise.all([
    queryThreatSshRow(fastify.prisma, ip),
    queryThreatCommandsByIp(fastify.prisma, ip),
    queryThreatWebRow(fastify.prisma, ip),
    queryThreatProtocolRowsByIp(fastify.prisma, ip),
  ])
  const cmds = cmdRows.flatMap((row) => row.command ? [row.command] : [])
  return { threat: buildThreat(ip, sshRows[0], webRows[0], cmds, protocolRows), cmdRows, cmds }
}

async function handleGetThreat(fastify: FastifyInstance, params: unknown, reply: FastifyReply) {
  const { ip } = params as { ip: string }
  const { threat, cmdRows, cmds } = await fetchThreatByIp(fastify, ip)
  return reply.send({
    ip,
    protocolsSeen: threat.protocolsSeen,
    crossProtocol: threat.crossProtocol,
    ssh: threat.ssh ? stripCommandCount(threat.ssh) : null,
    web: threat.web,
    protocols: threat.protocols,
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

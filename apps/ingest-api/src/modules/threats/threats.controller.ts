import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { basePaginationSchema, buildPaginationResponse, getPagination } from '../../lib/pagination.js'
import {
  ThreatService,
  RISK_LEVELS,
  COMMAND_CATEGORIES,
  sortThreats,
  buildSummary,
  classifyCommands,
  type RiskLevel,
  type ThreatListFilters,
} from './threats.service.js'

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

const PERIOD_DAYS: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 }

const threatListQuerySchema = basePaginationSchema.extend({
  q: z.string().trim().min(1).optional(),
  level: z.enum(RISK_LEVELS).optional(),
  levels: csvEnum(RISK_LEVELS),
  commands: csvEnum(COMMAND_CATEGORIES),
  crossProtocol: z.coerce.boolean().optional(),
  sortBy: z.enum(['score', 'sessions', 'webHits', 'protocols']).default('score'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  clientSlug: z.string().trim().min(1).optional(),
  sensorId: z.string().trim().min(1).optional(),
  period: z.enum(['24h', '7d', '30d', '90d']).default('90d'),
})

type ThreatListQuery = z.infer<typeof threatListQuerySchema>

function effectiveLevels(query: ThreatListQuery): RiskLevel[] {
  const set = new Set<RiskLevel>(query.levels)
  if (query.level) set.add(query.level)
  return [...set]
}

function sendInvalidQuery(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({
    error: 'Invalid query params',
    details: error.flatten().fieldErrors,
  })
}

function commandCategory(command: string | null) {
  if (!command) return 'other'
  return Object.entries(classifyCommands([command])).find(([, commands]) => commands.length > 0)?.[0] ?? 'other'
}

export async function threatRoutes(fastify: FastifyInstance) {
  const svc = new ThreatService(fastify.prismaRead)

  fastify.get('/threats', async (request, reply) => {
    const parsed = threatListQuerySchema.safeParse(request.query)
    if (!parsed.success) return sendInvalidQuery(reply, parsed.error)
    const { page, pageSize, offset } = getPagination(parsed.data)

    const { scope, scopeKey } = await svc.resolveScope(parsed.data.clientSlug, parsed.data.sensorId, fastify.prismaRead)
    const levels = effectiveLevels(parsed.data)

    const filters: ThreatListFilters = {
      q: parsed.data.q,
      levels,
      commands: parsed.data.commands,
      crossProtocol: parsed.data.crossProtocol,
      sortBy: parsed.data.sortBy,
      sortDir: parsed.data.sortDir,
    }

    const windowDays = PERIOD_DAYS[parsed.data.period]
    const threats = await svc.listThreats(fastify.cache, filters, scopeKey, scope, windowDays)
    sortThreats(threats, parsed.data.sortBy, parsed.data.sortDir)
    const items = threats.slice(offset, offset + pageSize)
    return reply.send({
      items,
      summary: buildSummary(threats),
      pagination: buildPaginationResponse(threats.length, page, pageSize),
    })
  })

  fastify.get('/threats/:ip', async (request, reply) => {
    const { ip } = request.params as { ip: string }
    const { threat, cmdRows, cmds, portScanEvents, portScanUniquePorts, scannedPorts } = await svc.getThreatByIp(ip)
    return reply.send({
      ip,
      protocolsSeen: threat.protocolsSeen,
      crossProtocol: threat.crossProtocol,
      ssh: threat.ssh
        ? { sessions: threat.ssh.sessions, authAttempts: threat.ssh.authAttempts, loginSuccess: threat.ssh.loginSuccess }
        : null,
      web: threat.web,
      protocols: threat.protocols,
      portScans: portScanEvents > 0
        ? { events: portScanEvents, uniquePorts: portScanUniquePorts, ports: scannedPorts }
        : null,
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
        category: commandCategory(row.command),
      })),
    })
  })
}

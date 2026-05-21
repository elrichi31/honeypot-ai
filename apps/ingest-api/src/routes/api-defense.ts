import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { buildPagination } from '../lib/client-helpers.js'

const VALID_TYPES = new Set(['scanner', 'path_probe', 'injection', 'brute_force'])

type EventRow = {
  id: string; src_ip: string; method: string; path: string
  user_agent: string; attack_type: string; details: string
  status_code: number | null; timestamp: Date
}
type TypeCount = { attack_type: string; count: bigint }
type IpCount   = { src_ip: string; count: bigint }

function mapEvent(r: EventRow) {
  return {
    id: r.id, srcIp: r.src_ip, method: r.method, path: r.path,
    userAgent: r.user_agent, attackType: r.attack_type,
    details: (() => { try { return JSON.parse(r.details) } catch { return {} } })(),
    statusCode: r.status_code, timestamp: r.timestamp,
  }
}

export async function apiDefenseRoutes(fastify: FastifyInstance) {
  fastify.get('/api-defense/events', async (request, reply) => {
    const query = z.object({
      page:       z.coerce.number().int().min(1).default(1),
      pageSize:   z.coerce.number().int().min(1).max(100).default(25),
      attackType: z.string().trim().optional(),
      ip:         z.string().trim().optional(),
    }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'Invalid query params' })

    const { page, pageSize, attackType, ip } = query.data
    const offset = (page - 1) * pageSize

    const validType = attackType && VALID_TYPES.has(attackType) ? attackType : undefined
    const typeCond  = validType ? Prisma.sql`AND attack_type = ${validType}` : Prisma.sql``
    const ipCond    = ip        ? Prisma.sql`AND src_ip = ${ip}`             : Prisma.sql``

    const [rows, countRows] = await Promise.all([
      fastify.prisma.$queryRaw<EventRow[]>`
        SELECT id, src_ip, method, path, user_agent, attack_type, details::text, status_code, timestamp
        FROM api_defense_events
        WHERE 1=1 ${typeCond} ${ipCond}
        ORDER BY timestamp DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      fastify.prisma.$queryRaw<[{ total: bigint }]>`
        SELECT COUNT(*) AS total FROM api_defense_events
        WHERE 1=1 ${typeCond} ${ipCond}
      `,
    ])

    return reply.send({
      items: rows.map(mapEvent),
      pagination: buildPagination(page, pageSize, Number(countRows[0]?.total ?? 0)),
    })
  })

  fastify.get('/api-defense/summary', async (_request, reply) => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

    const [typeCounts, topIps, totalToday] = await Promise.all([
      fastify.prisma.$queryRaw<TypeCount[]>`
        SELECT attack_type, COUNT(*)::bigint AS count
        FROM api_defense_events
        WHERE timestamp >= ${todayStart}
        GROUP BY attack_type ORDER BY count DESC
      `,
      fastify.prisma.$queryRaw<IpCount[]>`
        SELECT src_ip, COUNT(*)::bigint AS count
        FROM api_defense_events
        WHERE timestamp >= ${todayStart}
        GROUP BY src_ip ORDER BY count DESC LIMIT 10
      `,
      fastify.prisma.$queryRaw<[{ total: bigint }]>`
        SELECT COUNT(*) AS total FROM api_defense_events WHERE timestamp >= ${todayStart}
      `,
    ])

    return reply.send({
      totalToday:  Number(totalToday[0]?.total ?? 0),
      byType:      typeCounts.map(r => ({ type: r.attack_type, count: Number(r.count) })),
      topIps:      topIps.map(r => ({ ip: r.src_ip, count: Number(r.count) })),
    })
  })
}

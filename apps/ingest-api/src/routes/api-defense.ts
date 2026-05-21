import { Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { buildPagination } from '../lib/client-helpers.js'

const VALID_TYPES = new Set(['scanner', 'path_probe', 'injection', 'brute_force'])

// RFC 1918 + loopback — always treated as trusted regardless of allowlist
const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/

type EventRow   = { id: string; src_ip: string; method: string; path: string; user_agent: string; attack_type: string; details: string; status_code: number | null; timestamp: Date }
type TypeCount  = { attack_type: string; count: bigint }
type IpCount    = { src_ip: string; count: bigint }
type AllowRow   = { id: string; entry: string; label: string; created_at: Date }

function mapEvent(r: EventRow) {
  return {
    id: r.id, srcIp: r.src_ip, method: r.method, path: r.path,
    userAgent: r.user_agent, attackType: r.attack_type,
    details: (() => { try { return JSON.parse(r.details) } catch { return {} } })(),
    statusCode: r.status_code, timestamp: r.timestamp,
  }
}

function mapAllow(r: AllowRow) {
  return { id: r.id, entry: r.entry, label: r.label, createdAt: r.created_at }
}

export async function apiDefenseRoutes(fastify: FastifyInstance) {
  // ── Events ────────────────────────────────────────────────────────────────
  fastify.get('/api-defense/events', async (request, reply) => {
    const query = z.object({
      page:       z.coerce.number().int().min(1).default(1),
      pageSize:   z.coerce.number().int().min(1).max(100).default(25),
      attackType: z.string().trim().optional(),
      ip:         z.string().trim().optional(),
    }).safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: 'Invalid query params' })

    const { page, pageSize, attackType, ip } = query.data
    const offset    = (page - 1) * pageSize
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
        SELECT COUNT(*) AS total FROM api_defense_events WHERE 1=1 ${typeCond} ${ipCond}
      `,
    ])

    return reply.send({
      items:      rows.map(mapEvent),
      pagination: buildPagination(page, pageSize, Number(countRows[0]?.total ?? 0)),
    })
  })

  fastify.get('/api-defense/summary', async (_request, reply) => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

    const [typeCounts, topIps, totalToday] = await Promise.all([
      fastify.prisma.$queryRaw<TypeCount[]>`
        SELECT attack_type, COUNT(*)::bigint AS count FROM api_defense_events
        WHERE timestamp >= ${todayStart} GROUP BY attack_type ORDER BY count DESC
      `,
      fastify.prisma.$queryRaw<IpCount[]>`
        SELECT src_ip, COUNT(*)::bigint AS count FROM api_defense_events
        WHERE timestamp >= ${todayStart} GROUP BY src_ip ORDER BY count DESC LIMIT 10
      `,
      fastify.prisma.$queryRaw<[{ total: bigint }]>`
        SELECT COUNT(*) AS total FROM api_defense_events WHERE timestamp >= ${todayStart}
      `,
    ])

    return reply.send({
      totalToday: Number(totalToday[0]?.total ?? 0),
      byType:     typeCounts.map(r => ({ type: r.attack_type, count: Number(r.count) })),
      topIps:     topIps.map(r => ({ ip: r.src_ip, count: Number(r.count) })),
    })
  })

  // ── Allowlist ─────────────────────────────────────────────────────────────
  fastify.get('/api-defense/allowlist', async (_request, reply) => {
    const rows = await fastify.prisma.$queryRaw<AllowRow[]>`
      SELECT id, entry, label, created_at FROM defense_allowlist ORDER BY created_at DESC
    `
    return reply.send(rows.map(mapAllow))
  })

  fastify.post('/api-defense/allowlist', async (request, reply) => {
    const body = z.object({
      entry: z.string().trim().regex(CIDR_RE, 'Must be a valid IPv4 address or CIDR (e.g. 1.2.3.4 or 1.2.3.0/24)'),
      label: z.string().trim().max(120).default(''),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.errors[0].message })

    const { entry, label } = body.data
    const id = randomUUID()
    try {
      await fastify.prisma.$executeRaw`
        INSERT INTO defense_allowlist (id, entry, label) VALUES (${id}, ${entry}, ${label})
      `
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('unique') || msg.includes('duplicate')) {
        return reply.status(409).send({ error: 'Entry already exists' })
      }
      throw err
    }
    return reply.status(201).send({ id, entry, label, createdAt: new Date() })
  })

  fastify.delete('/api-defense/allowlist/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await fastify.prisma.$executeRaw`DELETE FROM defense_allowlist WHERE id = ${id}`
    if (result === 0) return reply.status(404).send({ error: 'Not found' })
    return reply.status(204).send()
  })

  // ── Blocked IPs ───────────────────────────────────────────────────────────
  fastify.get('/api-defense/blocked', async (_request, reply) => {
    const rows = await fastify.prisma.$queryRaw<
      { id: string; ip: string; reason: string; auto_blocked: boolean; blocked_at: Date }[]
    >`SELECT id, ip, reason, auto_blocked, blocked_at FROM blocked_ips ORDER BY blocked_at DESC`
    return reply.send(rows.map(r => ({
      id: r.id, ip: r.ip, reason: r.reason,
      autoBlocked: r.auto_blocked, blockedAt: r.blocked_at,
    })))
  })

  fastify.post('/api-defense/blocked', async (request, reply) => {
    const body = z.object({
      ip:     z.string().trim().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Must be a valid IPv4 address'),
      reason: z.string().trim().max(120).default('manual'),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.errors[0].message })

    const { ip, reason } = body.data
    const id = randomUUID()
    try {
      await fastify.prisma.$executeRaw`
        INSERT INTO blocked_ips (id, ip, reason, auto_blocked) VALUES (${id}, ${ip}, ${reason}, false)
      `
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('unique') || msg.includes('duplicate')) {
        return reply.status(409).send({ error: 'IP is already blocked' })
      }
      throw err
    }
    return reply.status(201).send({ id, ip, reason, autoBlocked: false, blockedAt: new Date() })
  })

  fastify.delete('/api-defense/blocked/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await fastify.prisma.$executeRaw`DELETE FROM blocked_ips WHERE id = ${id}`
    if (result === 0) return reply.status(404).send({ error: 'Not found' })
    return reply.status(204).send()
  })
}

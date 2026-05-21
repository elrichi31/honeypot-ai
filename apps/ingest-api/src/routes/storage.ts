import { statfs } from 'fs/promises'
import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

type TableSize = { table_name: string; total_bytes: bigint }
type DayCount  = { day: Date; count: bigint }

async function getDiskStats() {
  try {
    const s = await statfs('/')
    const total = Number(BigInt(s.blocks) * BigInt(s.bsize))
    const free  = Number(BigInt(s.bfree)  * BigInt(s.bsize))
    return { totalBytes: total, freeBytes: free, usedBytes: total - free }
  } catch {
    return { totalBytes: 0, freeBytes: 0, usedBytes: 0 }
  }
}

async function getDbStats(fastify: FastifyInstance) {
  const [tables, dbSize] = await Promise.all([
    fastify.prisma.$queryRaw<TableSize[]>`
      SELECT relname AS table_name, pg_total_relation_size(relid) AS total_bytes
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY total_bytes DESC
    `,
    fastify.prisma.$queryRaw<[{ size: bigint }]>`
      SELECT pg_database_size(current_database()) AS size
    `,
  ])
  return {
    totalBytes: Number(dbSize[0]?.size ?? 0),
    tables: tables.map(t => ({ name: t.table_name, bytes: Number(t.total_bytes) })),
  }
}

async function getDailyIngestion(fastify: FastifyInstance) {
  const [ssh, web, protocol, defense] = await Promise.all([
    fastify.prisma.$queryRaw<DayCount[]>`
      SELECT date_trunc('day', event_ts) AS day, COUNT(*)::bigint AS count
      FROM events WHERE event_ts >= NOW() - INTERVAL '14 days'
      GROUP BY day ORDER BY day
    `,
    fastify.prisma.$queryRaw<DayCount[]>`
      SELECT date_trunc('day', timestamp) AS day, COUNT(*)::bigint AS count
      FROM web_hits WHERE timestamp >= NOW() - INTERVAL '14 days'
      GROUP BY day ORDER BY day
    `,
    fastify.prisma.$queryRaw<DayCount[]>`
      SELECT date_trunc('day', timestamp) AS day, COUNT(*)::bigint AS count
      FROM protocol_hits WHERE timestamp >= NOW() - INTERVAL '14 days'
      GROUP BY day ORDER BY day
    `,
    fastify.prisma.$queryRaw<DayCount[]>`
      SELECT date_trunc('day', timestamp) AS day, COUNT(*)::bigint AS count
      FROM api_defense_events WHERE timestamp >= NOW() - INTERVAL '14 days'
      GROUP BY day ORDER BY day
    `,
  ])

  // Build a map for the last 14 days, fill in zeros for missing days
  const days: Record<string, { ssh: number; web: number; protocol: number; defense: number }> = {}
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0)
    days[d.toISOString().slice(0, 10)] = { ssh: 0, web: 0, protocol: 0, defense: 0 }
  }

  const fill = (rows: DayCount[], key: 'ssh' | 'web' | 'protocol' | 'defense') => {
    for (const r of rows) {
      const k = new Date(r.day).toISOString().slice(0, 10)
      if (days[k]) days[k][key] = Number(r.count)
    }
  }
  fill(ssh, 'ssh'); fill(web, 'web'); fill(protocol, 'protocol'); fill(defense, 'defense')

  return Object.entries(days).map(([date, v]) => ({ date, ...v }))
}

export async function storageRoutes(fastify: FastifyInstance) {
  fastify.get('/storage/stats', async (_request, reply) => {
    const [disk, db, ingestion] = await Promise.all([
      getDiskStats(),
      getDbStats(fastify),
      getDailyIngestion(fastify),
    ])
    return reply.send({ disk, db, ingestion })
  })

  fastify.get('/storage/retention', async (_request, reply) => {
    const rows = await fastify.prisma.retentionSettings.findMany({ orderBy: { tableName: 'asc' } })
    return reply.send(rows)
  })

  fastify.put('/storage/retention/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      retentionDays: z.number().int().min(1).max(3650).optional(),
      enabled:       z.boolean().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid body' })

    const updated = await fastify.prisma.$executeRaw`
      UPDATE retention_settings
      SET
        retention_days = COALESCE(${body.data.retentionDays ?? null}, retention_days),
        enabled        = COALESCE(${body.data.enabled ?? null},       enabled),
        updated_at     = now()
      WHERE id = ${id}
    `
    if (updated === 0) return reply.status(404).send({ error: 'Not found' })
    const row = await fastify.prisma.retentionSettings.findUnique({ where: { id } })
    return reply.send(row)
  })
}

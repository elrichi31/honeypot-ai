import { statfs } from 'fs/promises'
import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getRetentionIntervalMinutes } from '../lib/runtime-config.js'

type TableSize  = { table_name: string; total_bytes: bigint }
type PeriodCount = { period: Date; count: bigint }
type AvgRowSize = { table_name: string; avg_bytes: number }

const RANGE_CONFIG = {
  '24h': { trunc: 'hour',  slots: 24, intervalSql: "24 hours" },
  '7d':  { trunc: 'day',   slots: 7,  intervalSql: "7 days"   },
  '30d': { trunc: 'day',   slots: 30, intervalSql: "30 days"  },
} as const
type Range = keyof typeof RANGE_CONFIG

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

async function getIngestion(fastify: FastifyInstance, range: Range) {
  const { trunc, slots, intervalSql } = RANGE_CONFIG[range]
  const truncSql    = Prisma.raw(trunc)
  const intervalRaw = Prisma.raw(`'${intervalSql}'`)

  // Average bytes per row
  const avgRows = await fastify.prisma.$queryRaw<AvgRowSize[]>`
    SELECT c.relname AS table_name,
      CASE WHEN c.reltuples > 0
        THEN pg_total_relation_size(c.oid)::float / c.reltuples
        ELSE 512
      END AS avg_bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('events', 'web_hits', 'protocol_hits', 'api_defense_events')
  `
  const avg: Record<string, number> = {}
  for (const r of avgRows) avg[r.table_name] = r.avg_bytes

  const [ssh, web, protocol, defense] = await Promise.all([
    fastify.prisma.$queryRaw<PeriodCount[]>(Prisma.sql`
      SELECT date_trunc(${trunc}, event_ts) AS period, COUNT(*)::bigint AS count
      FROM events WHERE event_ts >= NOW() - INTERVAL ${intervalRaw}
      GROUP BY period ORDER BY period`),
    fastify.prisma.$queryRaw<PeriodCount[]>(Prisma.sql`
      SELECT date_trunc(${trunc}, timestamp) AS period, COUNT(*)::bigint AS count
      FROM web_hits WHERE timestamp >= NOW() - INTERVAL ${intervalRaw}
      GROUP BY period ORDER BY period`),
    fastify.prisma.$queryRaw<PeriodCount[]>(Prisma.sql`
      SELECT date_trunc(${trunc}, timestamp) AS period, COUNT(*)::bigint AS count
      FROM protocol_hits WHERE timestamp >= NOW() - INTERVAL ${intervalRaw}
      GROUP BY period ORDER BY period`),
    fastify.prisma.$queryRaw<PeriodCount[]>(Prisma.sql`
      SELECT date_trunc(${trunc}, timestamp) AS period, COUNT(*)::bigint AS count
      FROM api_defense_events WHERE timestamp >= NOW() - INTERVAL ${intervalRaw}
      GROUP BY period ORDER BY period`),
  ])

  // Build complete time series with zeros
  const buckets: Record<string, { ssh: number; web: number; protocol: number; defense: number }> = {}
  const now = new Date()
  for (let i = slots - 1; i >= 0; i--) {
    const d = new Date(now)
    if (trunc === 'hour') { d.setMinutes(0, 0, 0); d.setHours(d.getHours() - i) }
    else                  { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i) }
    buckets[d.toISOString()] = { ssh: 0, web: 0, protocol: 0, defense: 0 }
  }

  const fill = (rows: PeriodCount[], key: 'ssh' | 'web' | 'protocol' | 'defense', table: string) => {
    const a = avg[table] ?? 512
    for (const r of rows) {
      // Match to the closest bucket key
      const d = new Date(r.period)
      if (trunc === 'hour') { d.setMinutes(0, 0, 0) }
      else                  { d.setHours(0, 0, 0, 0) }
      const k = d.toISOString()
      if (buckets[k]) buckets[k][key] = Math.round(Number(r.count) * a)
    }
  }
  fill(ssh,      'ssh',      'events')
  fill(web,      'web',      'web_hits')
  fill(protocol, 'protocol', 'protocol_hits')
  fill(defense,  'defense',  'api_defense_events')

  return Object.entries(buckets).map(([period, v]) => ({ period, ...v }))
}

export async function storageRoutes(fastify: FastifyInstance) {
  fastify.get('/storage/stats', async (_request, reply) => {
    const [disk, db] = await Promise.all([getDiskStats(), getDbStats(fastify)])
    return reply.send({ disk, db })
  })

  fastify.get('/storage/ingestion', async (request, reply) => {
    const q = z.object({
      range: z.enum(['24h', '7d', '30d']).default('7d'),
    }).safeParse(request.query)
    if (!q.success) return reply.status(400).send({ error: 'Invalid range' })
    const data = await getIngestion(fastify, q.data.range)
    return reply.send(data)
  })

  fastify.get('/storage/retention', async (_request, reply) => {
    const TIMESTAMP_COL: Record<string, string> = {
      events:             'event_ts',
      sessions:           'started_at',
      web_hits:           'timestamp',
      protocol_hits:      'timestamp',
      api_defense_events: 'timestamp',
      suricata_alerts:    'timestamp',
    }

    const rows = await fastify.prisma.retentionSettings.findMany({ orderBy: { tableName: 'asc' } })

    // Per table: how old the oldest row is, and how many rows are already past
    // the retention window (i.e. what the next purge will delete from it).
    const perTableResults = await Promise.all(
      rows.map(async row => {
        const col = TIMESTAMP_COL[row.tableName]
        if (!col) return { id: row.id, oldestDaysAgo: null, pendingRows: null }
        try {
          const res = await fastify.prisma.$queryRawUnsafe<[{ days: number | null; pending: bigint }]>(
            `SELECT
               EXTRACT(EPOCH FROM (NOW() - MIN("${col}"))) / 86400 AS days,
               COUNT(*) FILTER (WHERE "${col}" < NOW() - (${row.retentionDays} * INTERVAL '1 day')) AS pending
             FROM "${row.tableName}"`
          )
          const days = res[0]?.days != null ? Math.floor(Number(res[0].days)) : null
          const pending = res[0]?.pending != null ? Number(res[0].pending) : 0
          return { id: row.id, oldestDaysAgo: days, pendingRows: pending }
        } catch {
          return { id: row.id, oldestDaysAgo: null, pendingRows: null }
        }
      })
    )

    const byId = Object.fromEntries(perTableResults.map(r => [r.id, r]))
    const enriched = rows.map(r => ({
      ...r,
      oldestDaysAgo: byId[r.id]?.oldestDaysAgo ?? null,
      pendingRows: byId[r.id]?.pendingRows ?? null,
    }))

    // Last retention job run + the next scheduled run (last run + configured
    // interval). Lets the UI show when and what will purge.
    const lastRun = await fastify.prisma.retentionRun.findFirst({
      orderBy: { startedAt: 'desc' },
    })
    const intervalMinutes = getRetentionIntervalMinutes()
    const nextRunAt = lastRun
      ? new Date(new Date(lastRun.startedAt).getTime() + intervalMinutes * 60 * 1000).toISOString()
      : null

    return reply.send({ settings: enriched, lastRun, nextRunAt, intervalMinutes })
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

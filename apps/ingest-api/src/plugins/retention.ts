import fp from 'fastify-plugin'
import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

// Map each tracked table to its timestamp column
const TIMESTAMP_COL: Record<string, string> = {
  events:             'event_ts',
  sessions:           'started_at',
  web_hits:           'timestamp',
  protocol_hits:      'timestamp',
  api_defense_events: 'timestamp',
}

async function runRetention(fastify: FastifyInstance) {
  const settings = await fastify.prisma.retentionSettings.findMany({ where: { enabled: true } })

  for (const { tableName, retentionDays } of settings) {
    const col = TIMESTAMP_COL[tableName]
    if (!col) continue
    try {
      const deleted = await fastify.prisma.$executeRaw(
        Prisma.sql`
          DELETE FROM ${Prisma.raw(`"${tableName}"`)}
          WHERE ${Prisma.raw(`"${col}"`)} < NOW() - (${retentionDays} * INTERVAL '1 day')
        `
      )
      if (deleted > 0) {
        fastify.log.info(`[retention] Purged ${deleted} rows from ${tableName} (>${retentionDays}d)`)
      }
    } catch (err) {
      fastify.log.error(`[retention] Failed to purge ${tableName}: ${err}`)
    }
  }
}

export const retentionPlugin = fp(async function (fastify: FastifyInstance) {
  // Run once at startup (catches anything accumulated while the service was down)
  runRetention(fastify).catch(err => fastify.log.error('[retention] startup run failed:', err))

  // Then every hour
  setInterval(() => {
    runRetention(fastify).catch(err => fastify.log.error('[retention] scheduled run failed:', err))
  }, 60 * 60 * 1000).unref()
})

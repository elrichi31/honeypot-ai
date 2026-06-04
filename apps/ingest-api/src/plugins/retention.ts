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
  suricata_alerts:    'timestamp',
}

// Delete in bounded batches so a large backlog (millions of old rows) doesn't
// lock a table for a long single statement and starve live ingest.
const BATCH_SIZE = 20000
const MAX_BATCHES_PER_RUN = 200

async function purgeTable(fastify: FastifyInstance, tableName: string, col: string, retentionDays: number) {
  let totalDeleted = 0
  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const deleted = await fastify.prisma.$executeRaw(
      Prisma.sql`
        DELETE FROM ${Prisma.raw(`"${tableName}"`)}
        WHERE ctid IN (
          SELECT ctid FROM ${Prisma.raw(`"${tableName}"`)}
          WHERE ${Prisma.raw(`"${col}"`)} < NOW() - (${retentionDays} * INTERVAL '1 day')
          LIMIT ${BATCH_SIZE}
        )
      `
    )
    totalDeleted += deleted
    if (deleted < BATCH_SIZE) break // caught up
  }
  return totalDeleted
}

async function runRetention(fastify: FastifyInstance) {
  const settings = await fastify.prisma.retentionSettings.findMany({ where: { enabled: true } })

  for (const { tableName, retentionDays } of settings) {
    const col = TIMESTAMP_COL[tableName]
    if (!col) continue
    try {
      const deleted = await purgeTable(fastify, tableName, col, retentionDays)
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

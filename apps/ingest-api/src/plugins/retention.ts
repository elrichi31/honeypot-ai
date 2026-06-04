import fp from 'fastify-plugin'
import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { getRetentionIntervalMinutes } from '../lib/runtime-config.js'

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

  const perTable: Record<string, number> = {}
  let total = 0
  let ok = true
  let errorMsg: string | null = null

  for (const { tableName, retentionDays } of settings) {
    const col = TIMESTAMP_COL[tableName]
    if (!col) continue
    try {
      const deleted = await purgeTable(fastify, tableName, col, retentionDays)
      perTable[tableName] = deleted
      total += deleted
      if (deleted > 0) {
        fastify.log.info(`[retention] Purged ${deleted} rows from ${tableName} (>${retentionDays}d)`)
      }
    } catch (err) {
      ok = false
      errorMsg = `${tableName}: ${err instanceof Error ? err.message : String(err)}`
      fastify.log.error(`[retention] Failed to purge ${tableName}: ${err}`)
    }
  }

  // Record the run so the dashboard can show when retention last ran and whether
  // it succeeded. Best-effort: never let logging the run break retention itself.
  try {
    await fastify.prisma.retentionRun.create({
      data: { finishedAt: new Date(), rowsDeleted: total, perTable, ok, error: errorMsg },
    })
  } catch (err) {
    fastify.log.error(`[retention] Failed to record run: ${err}`)
  }
}

// Skip the startup purge if a successful run already happened within the current
// interval. Otherwise a container that restarts often (OOM, redeploys, crash
// loop) re-runs retention on every boot, making "last purge" jump to "just now"
// far more often than the configured frequency.
async function startupShouldRun(fastify: FastifyInstance, intervalMinutes: number): Promise<boolean> {
  try {
    const last = await fastify.prisma.retentionRun.findFirst({
      where: { ok: true },
      orderBy: { startedAt: 'desc' },
    })
    if (!last) return true
    const ageMs = Date.now() - new Date(last.startedAt).getTime()
    return ageMs >= intervalMinutes * 60 * 1000
  } catch {
    return true // if we can't tell, run (safe default)
  }
}

export const retentionPlugin = fp(async function (fastify: FastifyInstance) {
  // Run at startup only if the last successful run is older than the interval —
  // catches a backlog from downtime without re-purging on every restart.
  void (async () => {
    const minutes = getRetentionIntervalMinutes()
    if (await startupShouldRun(fastify, minutes)) {
      await runRetention(fastify)
    } else {
      fastify.log.info('[retention] startup purge skipped (ran recently)')
    }
  })().catch(err => fastify.log.error(`[retention] startup run failed: ${err}`))

  // Self-schedule the next run with setTimeout so the interval is re-read from
  // config each time — changing it in the dashboard takes effect without a
  // restart (at most one cycle late).
  function scheduleNext() {
    const minutes = getRetentionIntervalMinutes()
    const timer = setTimeout(async () => {
      try {
        await runRetention(fastify)
      } catch (err) {
        fastify.log.error(`[retention] scheduled run failed: ${err}`)
      }
      scheduleNext()
    }, minutes * 60 * 1000)
    timer.unref()
  }
  scheduleNext()
})

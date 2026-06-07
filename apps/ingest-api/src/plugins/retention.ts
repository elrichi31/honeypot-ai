import fp from 'fastify-plugin'
import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { getRetentionIntervalMinutes } from '../lib/runtime-config.js'

// Map each tracked table to its timestamp column. NOTE: `events` and `sessions`
// are purged with bespoke, login_success-aware logic in runRetention (see below)
// and are intentionally absent here so the generic loop skips them.
const TIMESTAMP_COL: Record<string, string> = {
  web_hits:           'timestamp',
  protocol_hits:      'timestamp',
  api_defense_events: 'timestamp',
  suricata_alerts:    'timestamp',
}

// Logical config keys that map back to the real `sessions` table. They let the
// dashboard edit two separate retention windows for one table.
const SESSIONS_FAILED_KEY = 'sessions'              // login_success false/null
const SESSIONS_COMPROMISED_KEY = 'sessions_compromised' // login_success = true
const DEFAULT_SESSIONS_FAILED_DAYS = 7
const DEFAULT_SESSIONS_COMPROMISED_DAYS = 90

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

// Batched delete for a JOIN/subquery-based DELETE. `selectCtid` must be a query
// that SELECTs the ctid column of the target table, already filtered, WITHOUT a
// LIMIT (we append it). Same batching guarantees as purgeTable.
async function purgeJoined(
  fastify: FastifyInstance,
  targetTable: string,
  selectCtid: Prisma.Sql,
) {
  let totalDeleted = 0
  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const deleted = await fastify.prisma.$executeRaw(
      Prisma.sql`
        DELETE FROM ${Prisma.raw(`"${targetTable}"`)}
        WHERE ctid IN (
          ${selectCtid}
          LIMIT ${BATCH_SIZE}
        )
      `
    )
    totalDeleted += deleted
    if (deleted < BATCH_SIZE) break // caught up
  }
  return totalDeleted
}

// Purge events + sessions, treating compromised (login_success = true) sessions
// with a longer window than failed ones. The FK events.session_id -> sessions.id
// is ON DELETE RESTRICT, so events MUST be deleted before their parent sessions.
// Returns per-bucket counts for the run record.
async function purgeSessions(
  fastify: FastifyInstance,
  failedDays: number,
  compromisedDays: number,
): Promise<Record<string, number>> {
  // failed = login_success is not true (covers both false and NULL)
  const failedPredicate = Prisma.sql`s.login_success IS DISTINCT FROM true`
  const compromisedPredicate = Prisma.sql`s.login_success = true`

  // 1 & 2: events first (children), filtered by their parent session's outcome.
  const eventsFailed = await purgeJoined(fastify, 'events', Prisma.sql`
    SELECT e.ctid FROM events e
    JOIN sessions s ON s.id = e.session_id
    WHERE ${failedPredicate}
      AND e.event_ts < NOW() - (${failedDays} * INTERVAL '1 day')
  `)
  const eventsCompromised = await purgeJoined(fastify, 'events', Prisma.sql`
    SELECT e.ctid FROM events e
    JOIN sessions s ON s.id = e.session_id
    WHERE ${compromisedPredicate}
      AND e.event_ts < NOW() - (${compromisedDays} * INTERVAL '1 day')
  `)

  // 3 & 4: sessions, only once they have no remaining events (NOT EXISTS guards
  // against the FK RESTRICT for sessions whose events aren't past the cutoff yet).
  const sessionsFailed = await purgeJoined(fastify, 'sessions', Prisma.sql`
    SELECT s.ctid FROM sessions s
    WHERE ${failedPredicate}
      AND s.started_at < NOW() - (${failedDays} * INTERVAL '1 day')
      AND NOT EXISTS (SELECT 1 FROM events e WHERE e.session_id = s.id)
  `)
  const sessionsCompromised = await purgeJoined(fastify, 'sessions', Prisma.sql`
    SELECT s.ctid FROM sessions s
    WHERE ${compromisedPredicate}
      AND s.started_at < NOW() - (${compromisedDays} * INTERVAL '1 day')
      AND NOT EXISTS (SELECT 1 FROM events e WHERE e.session_id = s.id)
  `)

  return {
    events_failed: eventsFailed,
    events_compromised: eventsCompromised,
    sessions_failed: sessionsFailed,
    sessions_compromised: sessionsCompromised,
  }
}

// Re-entrancy guard: a purge can take longer than the schedule interval. Without
// this, the startup run and a scheduled run (or two scheduled runs) could overlap
// and double-delete / contend. Skip if one is already in progress.
let retentionRunning = false

async function runRetention(fastify: FastifyInstance) {
  if (retentionRunning) {
    fastify.log.warn('[retention] previous run still in progress, skipping this tick')
    return
  }
  retentionRunning = true
  try {
    await runRetentionInner(fastify)
  } finally {
    retentionRunning = false
  }
}

async function runRetentionInner(fastify: FastifyInstance) {
  const settings = await fastify.prisma.retentionSettings.findMany({ where: { enabled: true } })

  const perTable: Record<string, number> = {}
  let total = 0
  let ok = true
  let errorMsg: string | null = null

  // Resolve the two session windows from their config rows (falling back to the
  // documented defaults if a row is missing or disabled).
  const failedRow = settings.find(s => s.tableName === SESSIONS_FAILED_KEY)
  const compromisedRow = settings.find(s => s.tableName === SESSIONS_COMPROMISED_KEY)
  if (failedRow || compromisedRow) {
    const failedDays = failedRow?.retentionDays ?? DEFAULT_SESSIONS_FAILED_DAYS
    const compromisedDays = compromisedRow?.retentionDays ?? DEFAULT_SESSIONS_COMPROMISED_DAYS
    try {
      const counts = await purgeSessions(fastify, failedDays, compromisedDays)
      Object.assign(perTable, counts)
      const sessionTotal = Object.values(counts).reduce((a, b) => a + b, 0)
      total += sessionTotal
      if (sessionTotal > 0) {
        fastify.log.info(
          `[retention] Purged sessions — failed >${failedDays}d (events ${counts.events_failed}, sessions ${counts.sessions_failed}); ` +
          `compromised >${compromisedDays}d (events ${counts.events_compromised}, sessions ${counts.sessions_compromised})`
        )
      }
    } catch (err) {
      ok = false
      errorMsg = `sessions: ${err instanceof Error ? err.message : String(err)}`
      fastify.log.error(`[retention] Failed to purge sessions/events: ${err}`)
    }
  }

  for (const { tableName, retentionDays } of settings) {
    const col = TIMESTAMP_COL[tableName]
    if (!col) continue // skip logical session keys + tables handled above
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

import fp from 'fastify-plugin'
import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

// How often to refresh the credential_attempts materialized view. Credentials
// telemetry tolerates a few minutes of staleness, and the refresh is cheap with
// CONCURRENTLY (it doesn't block reads). Configurable via env for tuning.
const REFRESH_INTERVAL_MS = Number(process.env.MATVIEW_REFRESH_MINUTES ?? 5) * 60 * 1000

let refreshing = false

async function refreshCredentialAttempts(fastify: FastifyInstance) {
  if (refreshing) {
    fastify.log.warn('[matview] previous refresh still running, skipping tick')
    return
  }
  refreshing = true
  const started = Date.now()
  try {
    // CONCURRENTLY avoids locking the view against reads; it needs the unique
    // index created in the migration. Falls back to a plain refresh if the view
    // was just created and has never been populated (CONCURRENTLY can't run on a
    // never-refreshed matview).
    try {
      await fastify.prisma.$executeRaw(Prisma.sql`REFRESH MATERIALIZED VIEW CONCURRENTLY credential_attempts`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/has not been populated|cannot refresh/i.test(msg)) {
        await fastify.prisma.$executeRaw(Prisma.sql`REFRESH MATERIALIZED VIEW credential_attempts`)
      } else {
        throw err
      }
    }
    fastify.log.info(`[matview] refreshed credential_attempts in ${Date.now() - started}ms`)
  } catch (err) {
    fastify.log.error(`[matview] refresh failed: ${err}`)
  } finally {
    refreshing = false
  }
}

export const matviewRefreshPlugin = fp(async function (fastify: FastifyInstance) {
  // Refresh once at startup so a fresh deploy / restart serves current data.
  void refreshCredentialAttempts(fastify).catch(err =>
    fastify.log.error(`[matview] startup refresh failed: ${err}`),
  )

  const timer = setInterval(() => {
    void refreshCredentialAttempts(fastify)
  }, REFRESH_INTERVAL_MS)
  timer.unref()
})

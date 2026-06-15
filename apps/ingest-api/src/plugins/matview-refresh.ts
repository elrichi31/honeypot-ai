import fp from 'fastify-plugin'
import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

// How often to refresh materialized views. Both credential_attempts and
// threat_ip_summary tolerate a few minutes of staleness; CONCURRENTLY never
// blocks reads. Configurable via env for tuning.
const REFRESH_INTERVAL_MS = Number(process.env.MATVIEW_REFRESH_MINUTES ?? 5) * 60 * 1000

async function refreshConcurrently(fastify: FastifyInstance, viewName: string) {
  const started = Date.now()
  try {
    try {
      await fastify.prisma.$executeRaw(
        Prisma.sql`REFRESH MATERIALIZED VIEW CONCURRENTLY ${Prisma.raw(viewName)}`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // CONCURRENTLY cannot run on a never-populated view; fall back once.
      if (/has not been populated|cannot refresh/i.test(msg)) {
        await fastify.prisma.$executeRaw(
          Prisma.sql`REFRESH MATERIALIZED VIEW ${Prisma.raw(viewName)}`,
        )
      } else {
        throw err
      }
    }
    fastify.log.info(`[matview] refreshed ${viewName} in ${Date.now() - started}ms`)
  } catch (err) {
    fastify.log.error(`[matview] ${viewName} refresh failed: ${err}`)
  }
}

// Guards to skip a tick if a previous refresh is still running.
let credRefreshing = false
let threatRefreshing = false

async function refreshCredentialAttempts(fastify: FastifyInstance) {
  if (credRefreshing) {
    fastify.log.warn('[matview] credential_attempts refresh still running, skipping tick')
    return
  }
  credRefreshing = true
  try { await refreshConcurrently(fastify, 'credential_attempts') }
  finally { credRefreshing = false }
}

async function refreshThreatIpSummary(fastify: FastifyInstance) {
  if (threatRefreshing) {
    fastify.log.warn('[matview] threat_ip_summary refresh still running, skipping tick')
    return
  }
  threatRefreshing = true
  try { await refreshConcurrently(fastify, 'threat_ip_summary') }
  finally { threatRefreshing = false }
}

export const matviewRefreshPlugin = fp(async function (fastify: FastifyInstance) {
  // Refresh both views at startup so a fresh deploy serves current data.
  void refreshCredentialAttempts(fastify).catch(err =>
    fastify.log.error(`[matview] startup refresh (credentials) failed: ${err}`),
  )
  void refreshThreatIpSummary(fastify).catch(err =>
    fastify.log.error(`[matview] startup refresh (threats) failed: ${err}`),
  )

  const timer = setInterval(() => {
    void refreshCredentialAttempts(fastify)
    void refreshThreatIpSummary(fastify)
  }, REFRESH_INTERVAL_MS)
  timer.unref()
})

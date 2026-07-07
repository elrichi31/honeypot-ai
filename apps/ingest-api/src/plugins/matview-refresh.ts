import fp from 'fastify-plugin'
import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

// How often to refresh materialized views. Both credential_attempts and
// threat_ip_summary tolerate several minutes of staleness (the dashboard reads
// them behind withCache), so we default to 30 min. Configurable via env.
const REFRESH_INTERVAL_MS = Number(process.env.MATVIEW_REFRESH_MINUTES ?? 30) * 60 * 1000

// Plain REFRESH (TRUNCATE + INSERT), not CONCURRENTLY. credential_attempts is a
// derived view of ~1.6M rows; CONCURRENTLY additionally diffs the whole new
// result against the old rows, which burned CPU (~275s/refresh) and generated
// enough WAL to peg the replica's single-threaded replay. Plain REFRESH skips
// the diff — far less CPU/WAL — at the cost of a brief AccessExclusiveLock that
// blocks reads for a few seconds. Invisible to users thanks to withCache.
async function refreshView(fastify: FastifyInstance, viewName: string) {
  const started = Date.now()
  try {
    await fastify.prisma.$executeRaw(
      Prisma.sql`REFRESH MATERIALIZED VIEW ${Prisma.raw(viewName)}`,
    )
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
  try { await refreshView(fastify, 'credential_attempts') }
  finally { credRefreshing = false }
}

async function refreshThreatIpSummary(fastify: FastifyInstance) {
  if (threatRefreshing) {
    fastify.log.warn('[matview] threat_ip_summary refresh still running, skipping tick')
    return
  }
  threatRefreshing = true
  try { await refreshView(fastify, 'threat_ip_summary') }
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

import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'

// Global-scope dashboard routes to pre-warm at boot. These are exactly the
// requests OverviewSection/CrossTimelineSection/etc. make on first load (see
// apps/dashboard/app/page.tsx) — hitting them via fastify.inject() runs the
// real route handler (including withCache) without a network round-trip or an
// ingest token, so the 24h-retention cache is already populated before the
// first real visitor shows up. Only the global scope is warmed; per-client
// scopes benefit from the long retention after their own first visit.
const WARMUP_ROUTES = [
  '/stats/honeypot-overview',
  '/stats/kpi-trends',
  '/stats/dashboards',
  '/stats/geo',
  '/stats/mitre-matrix',
  '/stats/cross-sensor-timeline?range=day',
  '/stats/novelty?hours=24',
  '/stats/bot-ratio',
]

async function warmupOne(fastify: FastifyInstance, route: string) {
  const started = Date.now()
  try {
    const res = await fastify.inject({ method: 'GET', url: route })
    if (res.statusCode >= 400) {
      fastify.log.warn(`[cache-warmup] ${route} returned ${res.statusCode}`)
    } else {
      fastify.log.info(`[cache-warmup] warmed ${route} in ${Date.now() - started}ms`)
    }
  } catch (err) {
    fastify.log.error(`[cache-warmup] ${route} failed: ${err}`)
  }
}

// The dashboard's Service activity section calls /protocol-hits/stats and then
// one /protocol-hits/insights per active protocol. We can't list the insights
// routes statically (the protocol set is data-dependent), so warm stats first,
// then warm insights for exactly the protocols it returns.
async function warmupProtocolInsights(fastify: FastifyInstance) {
  try {
    const res = await fastify.inject({ method: 'GET', url: '/protocol-hits/stats' })
    if (res.statusCode >= 400) {
      fastify.log.warn(`[cache-warmup] /protocol-hits/stats returned ${res.statusCode}`)
      return
    }
    fastify.log.info('[cache-warmup] warmed /protocol-hits/stats')
    const stats = res.json() as Array<{ protocol: string }>
    for (const { protocol } of stats) {
      await warmupOne(fastify, `/protocol-hits/insights?protocol=${encodeURIComponent(protocol)}`)
    }
  } catch (err) {
    fastify.log.error(`[cache-warmup] protocol insights warm-up failed: ${err}`)
  }
}

async function warmupAll(fastify: FastifyInstance) {
  // Serial, not parallel: warming 7-8 heavy endpoints at once is exactly the
  // cold-start stampede this is meant to prevent. The compute-level semaphore
  // in cache-helper.ts caps this too, but staying serial here keeps startup
  // load predictable and easy to read in logs.
  for (const route of WARMUP_ROUTES) {
    await warmupOne(fastify, route)
  }
  await warmupProtocolInsights(fastify)
}

export const cacheWarmupPlugin = fp(async function (fastify: FastifyInstance) {
  if (!fastify.cache) {
    fastify.log.info('[cache-warmup] no cache backend — skipping warm-up')
    return
  }
  void warmupAll(fastify).catch((err) =>
    fastify.log.error(`[cache-warmup] startup warm-up failed: ${err}`),
  )
})

import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import type { ClickHouseClient } from '@clickhouse/client'
import { createClickHouseClient, closeClickHouseClient, isClickHouseConfigured } from '../lib/clickhouse.js'

declare module 'fastify' {
  interface FastifyInstance {
    clickhouse: ClickHouseClient | null
  }
}

// Decorates fastify.clickhouse whenever CLICKHOUSE_URL is set — NOT gated on
// a boot-time ping (that was the original design here, and it lost a real
// startup race in prod: ingest-api and clickhouse have no depends_on between
// them by design, so ClickHouse can still be starting when this plugin's
// ping ran, permanently disabling analytics for the process lifetime with no
// retry). Reachability is discovered per-request instead: the analytics
// controller catches query failures and returns 503, so a slow/late
// ClickHouse start — or a later restart — recovers on the very next request,
// no ingest-api restart needed.
export default fp(async (fastify: FastifyInstance) => {
  if (!isClickHouseConfigured()) {
    fastify.decorate('clickhouse', null)
    fastify.log.info('CLICKHOUSE_URL not set — analytics module disabled')
    return
  }

  const client = createClickHouseClient()
  fastify.decorate('clickhouse', client)
  fastify.log.info('ClickHouse client configured — analytics module enabled')

  // Best-effort background check, logging only — never gates the decoration.
  setImmediate(async () => {
    try {
      const result = await client!.ping()
      fastify.log.info(result.success ? 'ClickHouse reachable' : 'ClickHouse ping returned success:false — queries will retry per-request')
    } catch (err) {
      fastify.log.warn({ err }, 'ClickHouse not reachable yet — analytics queries will 503 until it is')
    }
  })

  fastify.addHook('onClose', () => closeClickHouseClient())
}, { name: 'clickhouse' })

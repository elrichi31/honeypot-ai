import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import type { ClickHouseClient } from '@clickhouse/client'
import { createClickHouseClient, closeClickHouseClient, isClickHouseConfigured } from '../lib/clickhouse.js'

declare module 'fastify' {
  interface FastifyInstance {
    clickhouse: ClickHouseClient | null
  }
}

// Same shape as plugins/redis.ts: absent/unreachable -> decorate null, the
// analytics module (the only consumer of fastify.clickhouse) disables itself.
// Never blocks or fails Fastify startup — Postgres and everything else on
// this API is completely independent of ClickHouse being up.
export default fp(async (fastify: FastifyInstance) => {
  if (!isClickHouseConfigured()) {
    fastify.decorate('clickhouse', null)
    fastify.log.info('CLICKHOUSE_URL not set — analytics module disabled')
    return
  }

  const client = createClickHouseClient()
  try {
    const result = await client!.ping()
    if (!result.success) throw new Error('ping returned success:false')
    fastify.log.info('ClickHouse connected — analytics module enabled')
  } catch (err) {
    fastify.log.warn({ err }, 'ClickHouse ping failed — analytics module disabled')
    await closeClickHouseClient()
    fastify.decorate('clickhouse', null)
    return
  }

  fastify.decorate('clickhouse', client)
  fastify.addHook('onClose', () => closeClickHouseClient())
}, { name: 'clickhouse' })

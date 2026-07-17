import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { lakeProducer } from '../lib/lake-producer.js'

// Connects the KAFKA_LAKE Fase 2 tee producer. Same KAFKA_BROKERS gate as the
// (now retired) consumer: no brokers -> disabled, and tee() is a no-op. Connects
// in the background so a slow/absent broker never blocks Fastify startup; events
// in the connect gap simply aren't teed (best-effort, Postgres still has them).
export default fp(async (fastify: FastifyInstance) => {
  const brokers = process.env.KAFKA_BROKERS
  if (!brokers) {
    fastify.log.info('KAFKA_BROKERS not set — lake producer disabled')
    return
  }

  setImmediate(async () => {
    try {
      await lakeProducer.connect(brokers, fastify.log)
    } catch (err) {
      fastify.log.error({ err }, 'Lake producer failed to connect — lake tee disabled until restart')
    }
  })

  fastify.addHook('onClose', () => lakeProducer.disconnect())
}, { name: 'lake-producer' })

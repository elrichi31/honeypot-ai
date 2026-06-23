import fp from 'fastify-plugin'
import { Kafka } from 'kafkajs'
import type { FastifyInstance } from 'fastify'

export default fp(async (fastify: FastifyInstance) => {
  const brokers = process.env.KAFKA_BROKERS
  if (!brokers) {
    fastify.log.info('KAFKA_BROKERS not set — Kafka consumer disabled')
    return
  }

  const kafka = new Kafka({
    clientId: 'ingest-api',
    brokers: brokers.split(','),
    retry: { retries: 10, initialRetryTime: 3000, maxRetryTime: 30000 },
  })

  const consumer = kafka.consumer({
    groupId: 'ingest-api',
    retry: { retries: 10, initialRetryTime: 3000, maxRetryTime: 30000 },
  })

  consumer.on('consumer.crash', ({ payload }) => {
    fastify.log.warn({ err: payload.error }, 'Kafka consumer crashed — will restart')
  })

  fastify.addHook('onClose', async () => {
    await consumer.disconnect()
  })

  // Connect + run in background so the plugin registers immediately without
  // blocking Fastify startup. The consumer retries internally if Kafka is slow.
  setImmediate(async () => {
    try {
      await consumer.connect()
      fastify.log.info('Kafka consumer connected')
      await consumer.subscribe({ topics: ['honeypot.cowrie', 'honeypot.suricata'], fromBeginning: true })
      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const value = message.value?.toString()
          fastify.log.info({ topic, partition, value }, 'Kafka message received')
        },
      })
    } catch (err) {
      fastify.log.error({ err }, 'Kafka consumer failed to start')
    }
  })
})

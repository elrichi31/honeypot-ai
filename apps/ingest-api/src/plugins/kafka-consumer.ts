import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'

// KAFKA_LAKE Fase 1 (docs/plans/KAFKA_LAKE.md): cowrie/suricata now ship to the
// ingest-api over HTTP like every other sensor, so the ingest-api no longer
// CONSUMES from Kafka to write Postgres — that path is retired. Kafka sits idle
// until Fase 2 introduces the API->Kafka producer tee and a lake consumer. This
// stub only preserves the /health/kafka decoration; it consumes nothing.
export type KafkaConsumerStatus = 'disabled' | 'connecting' | 'running' | 'crashed'

declare module 'fastify' {
  interface FastifyInstance {
    kafkaConsumerStatus: () => KafkaConsumerStatus
  }
}

export default fp(async (fastify: FastifyInstance) => {
  // No topics to consume (Fase 1). 'disabled' is healthy by design — /health/kafka
  // treats it the same as a dev box with no KAFKA_BROKERS.
  fastify.decorate('kafkaConsumerStatus', () => 'disabled' as KafkaConsumerStatus)
}, { name: 'kafka-consumer' })

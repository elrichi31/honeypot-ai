import type { FastifyInstance } from 'fastify';
import { withCache } from '../../lib/cache-helper.js';

export async function healthRoutes(fastify: FastifyInstance) {
  // Liveness: must NOT touch the DB. It only confirms the process can serve
  // requests. A slow/saturated database must never mark the container as
  // unhealthy — that would cut traffic while the app is actually alive.
  fastify.get('/health', async () => {
    return { status: 'ok' };
  });

  // Diagnostics for the Kafka consumer. Isolated from the container healthcheck
  // on purpose: a transient Kafka blip should not restart the whole process
  // (HTTP ingestion stays up). External monitoring polls this for alerting.
  // 'disabled' (no KAFKA_BROKERS) is healthy by design — dev runs without Kafka.
  fastify.get('/health/kafka', async (_request, reply) => {
    const status = fastify.kafkaConsumerStatus()
    if (status === 'crashed') {
      return reply.status(503).send({ status: 'degraded', consumer: status })
    }
    return { status: 'ok', consumer: status };
  });

  // Readiness/diagnostics: checks DB reachability explicitly. Cached so it
  // can't become a load amplifier, and isolated from the container healthcheck.
  fastify.get('/health/db', async (_request, reply) => {
    try {
      const lastEventAt = await withCache(fastify.cache, 'health:last-event', 60, async () => {
        const rows = await fastify.prisma.$queryRaw<Array<{ last_at: Date | null }>>`
          SELECT MAX(started_at) AS last_at FROM sessions
        `
        return rows[0]?.last_at?.toISOString() ?? null
      })
      return { status: 'ok', lastEventAt };
    } catch {
      return reply.status(503).send({ status: 'degraded', error: 'database unreachable' });
    }
  });
}

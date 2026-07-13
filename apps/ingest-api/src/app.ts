import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import { ZodError } from 'zod';
import cors from '@fastify/cors';
import { checkRateLimit } from './lib/ingest-rate-limiter.js';
import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import { healthRoutes } from './modules/health/health.controller.js';
import { ingestRoutes } from './modules/ingest/ingest.controller.js';
import { sessionRoutes } from './modules/sessions/sessions.controller.js';
import { eventRoutes } from './modules/events/events.controller.js';
import { statsRoutes } from './modules/stats/controllers/index.js';
import { webRoutes } from './modules/web/web.controller.js';
import { threatRoutes } from './modules/threats/threats.controller.js';
import { liveRoutes } from './modules/live/live.controller.js';
import { protocolRoutes } from './modules/protocol/protocol.controller.js'
import { clientRoutes } from './modules/clients/clients.controller.js';
import { clientObservabilityRoutes } from './modules/clients/clients.observability.controller.js';
import { apiDefenseRoutes } from './modules/api-defense/api-defense.controller.js';
import { defensePlugin } from './plugins/defense.js';
import { sensorRoutes } from './modules/sensors/sensors.controller.js';
import { attacksTodayRoutes } from './modules/attacks-today/attacks-today.controller.js';
import { sensorProvisionRoutes } from './modules/sensors/sensors.provision.controller.js'
import { malwareRoutes } from './modules/malware/malware.controller.js';
import { iocsRoutes } from './modules/iocs/iocs.controller.js';
import { storageRoutes } from './modules/storage/storage.controller.js';
import { retentionPlugin } from './plugins/retention.js';
import { matviewRefreshPlugin } from './plugins/matview-refresh.js';
import { cacheWarmupPlugin } from './plugins/cache-warmup.js';
import kafkaConsumerPlugin from './plugins/kafka-consumer.js';
import { suricataRoutes } from './modules/suricata/suricata.controller.js';
import { monitoringRoutes } from './modules/monitoring/monitoring.controller.js';
import { alertRoutes } from './modules/alerts/alerts.controller.js';
import { deceptionRoutes } from './modules/deception/deception.controller.js';

export async function buildApp() {
  // cloudflared runs on the same host and connects from loopback, forwarding the
  // visitor IP in X-Forwarded-For. Trusting only loopback lets us read the real
  // client IP (for defense/rate-limiting) without allowing external XFF spoofing.
  const app = Fastify({ logger: true, trustProxy: 'loopback' });

  // Consistent error shape: log the full error server-side, but only surface the
  // message for client errors (4xx). 5xx responses stay generic so internal
  // details (stack traces, SQL) never leak to callers.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Validation errors (manual zod .parse() in handlers) are client errors, not
    // 500s — a ZodError has no statusCode and would otherwise leak as a 500.
    if (error instanceof ZodError) {
      request.log.warn({ url: request.url }, 'Validation error')
      return reply.status(400).send({ error: 'Invalid request', details: error.flatten() })
    }
    const statusCode = error.statusCode ?? 500
    if (statusCode >= 500) {
      request.log.error({ err: error, url: request.url }, 'Unhandled route error')
      // requestId lets a user-reported error be grepped to this exact log line
      // without reproducing the bug — see ERROR_HANDLING.md Fase 5.
      return reply.status(statusCode).send({ error: 'Internal server error', requestId: request.id })
    }
    request.log.warn({ err: error, url: request.url }, 'Client error')
    return reply.status(statusCode).send({ error: error.message })
  });

  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || process.env.DASHBOARD_URL || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)

  await app.register(cors, {
    origin: allowedOrigins.length > 0
      ? allowedOrigins
      : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(kafkaConsumerPlugin);
  await app.register(defensePlugin);

  const ingestRpmLimit = parseInt(process.env.INGEST_RATE_LIMIT_RPM ?? '300', 10)
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/ingest/')) return
    if (!checkRateLimit(request.ip, ingestRpmLimit)) {
      return reply.status(429).send({
        error: `Rate limit exceeded. Maximum ${ingestRpmLimit} ingest requests per minute per IP.`,
      })
    }
  })

  await app.register(healthRoutes);
  await app.register(ingestRoutes);
  await app.register(sessionRoutes);
  await app.register(eventRoutes);
  await app.register(statsRoutes);
  await app.register(webRoutes);
  await app.register(threatRoutes);
  await app.register(liveRoutes);
  await app.register(protocolRoutes);
  await app.register(clientRoutes);
  await app.register(clientObservabilityRoutes);
  await app.register(apiDefenseRoutes);
  await app.register(sensorRoutes);
  await app.register(attacksTodayRoutes);
  await app.register(sensorProvisionRoutes);
  await app.register(malwareRoutes);
  await app.register(iocsRoutes);
  await app.register(storageRoutes);
  await app.register(suricataRoutes);
  await app.register(monitoringRoutes);
  await app.register(alertRoutes);
  await app.register(deceptionRoutes);
  await app.register(retentionPlugin);
  await app.register(matviewRefreshPlugin);
  await app.register(cacheWarmupPlugin);

  return app;
}

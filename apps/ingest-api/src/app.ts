import Fastify from 'fastify';
import cors from '@fastify/cors';
import { checkIngestRateLimit } from './lib/ingest-rate-limiter.js';
import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import { healthRoutes } from './routes/health.js';
import { ingestRoutes } from './routes/ingest.js';
import { sessionRoutes } from './routes/sessions.js';
import { eventRoutes } from './routes/events.js';
import { statsRoutes } from './routes/stats/index.js';
import { webRoutes } from './routes/web.js';
import { threatRoutes } from './routes/threats.js';
import { liveRoutes } from './routes/live.js';
import { protocolRoutes } from './routes/protocol.js'
import { clientRoutes } from './routes/clients.js';
import { clientObservabilityRoutes } from './routes/client-observability.js';
import { apiDefenseRoutes } from './routes/api-defense.js';
import { defensePlugin } from './plugins/defense.js';
import { sensorRoutes } from './routes/sensors.js';
import { attacksTodayRoutes } from './routes/attacksToday.js';
import { sensorProvisionRoutes } from './routes/sensor-provision.js'
import { malwareRoutes } from './routes/malware.js';
import { storageRoutes } from './routes/storage.js';
import { retentionPlugin } from './plugins/retention.js';
import { suricataRoutes } from './routes/suricata.js';
import { monitoringRoutes } from './routes/monitoring.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

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
  await app.register(defensePlugin);

  const ingestRpmLimit = parseInt(process.env.INGEST_RATE_LIMIT_RPM ?? '300', 10)
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/ingest/')) return
    if (!checkIngestRateLimit(request.ip, ingestRpmLimit)) {
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
  await app.register(storageRoutes);
  await app.register(suricataRoutes);
  await app.register(monitoringRoutes);
  await app.register(retentionPlugin);

  return app;
}

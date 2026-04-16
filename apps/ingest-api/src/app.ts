import Fastify from 'fastify';
import cors from '@fastify/cors';
import prismaPlugin from './plugins/prisma.js';
import { healthRoutes } from './routes/health.js';
import { ingestRoutes } from './routes/ingest.js';
import { sessionRoutes } from './routes/sessions.js';
import { eventRoutes } from './routes/events.js';
import { statsRoutes } from './routes/stats.js';
import { webRoutes } from './routes/web.js';
import { threatRoutes } from './routes/threats.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(prismaPlugin);
  await app.register(healthRoutes);
  await app.register(ingestRoutes);
  await app.register(sessionRoutes);
  await app.register(eventRoutes);
  await app.register(statsRoutes);
  await app.register(webRoutes);
  await app.register(threatRoutes);

  return app;
}

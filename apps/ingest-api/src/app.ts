import Fastify from 'fastify';
import prismaPlugin from './plugins/prisma.js';
import { healthRoutes } from './routes/health.js';
import { ingestRoutes } from './routes/ingest.js';
import { sessionRoutes } from './routes/sessions.js';
import { eventRoutes } from './routes/events.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(prismaPlugin);
  await app.register(healthRoutes);
  await app.register(ingestRoutes);
  await app.register(sessionRoutes);
  await app.register(eventRoutes);

  return app;
}

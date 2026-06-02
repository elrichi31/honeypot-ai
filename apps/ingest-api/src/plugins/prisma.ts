import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { setThreatAlertReadClient } from '../lib/threat-alerts.js';

/**
 * Two Prisma clients: the primary (read+write) and an optional read replica.
 *
 * We deliberately do NOT use @prisma/extension-read-replicas: it routes every
 * `$queryRaw` to the replica, but this codebase uses `$queryRaw ... RETURNING`
 * for several INSERT/UPDATE/DELETE statements, which would then fail on the
 * read-only standby. Instead routing is explicit:
 *
 *   - `fastify.prisma`      → primary. Default for everything (writes + any
 *                             read that must be consistent). Nothing breaks.
 *   - `fastify.prismaRead`  → replica when REPLICA_DATABASE_URL is set, else the
 *                             primary. Use ONLY for heavy dashboard read
 *                             queries (threats/sessions/credentials/stats),
 *                             where a few ms of replication lag is fine.
 */
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    prismaRead: PrismaClient;
  }
}

/**
 * The replica client connects directly to the standby (no pgbouncer), so its
 * Prisma pool counts against the replica's max_connections. Cap it so a burst
 * of dashboard queries can't exhaust connections and wedge the API. Honors an
 * explicit connection_limit in the URL if the operator set one.
 */
const REPLICA_CONNECTION_LIMIT = Number(process.env.REPLICA_CONNECTION_LIMIT ?? '10');

function withConnectionLimit(url: string, limit: number): string {
  if (/[?&]connection_limit=/.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=${limit}`;
}

export default fp(async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();
  await prisma.$connect();

  const replicaUrl = process.env.REPLICA_DATABASE_URL?.trim();
  const prismaRead = replicaUrl
    ? new PrismaClient({
        datasources: { db: { url: withConnectionLimit(replicaUrl, REPLICA_CONNECTION_LIMIT) } },
      })
    : prisma;

  if (prismaRead !== prisma) {
    await prismaRead.$connect();
    fastify.log.info('Read replica enabled for dashboard queries');
  }

  fastify.decorate('prisma', prisma);
  fastify.decorate('prismaRead', prismaRead);

  // Route the heavy threat-alert aggregate reads to the replica too.
  setThreatAlertReadClient(prismaRead);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
    if (prismaRead !== prisma) await prismaRead.$disconnect();
  });
});

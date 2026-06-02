import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

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

export default fp(async (fastify: FastifyInstance) => {
  const prisma = new PrismaClient();
  await prisma.$connect();

  const replicaUrl = process.env.REPLICA_DATABASE_URL?.trim();
  const prismaRead = replicaUrl
    ? new PrismaClient({ datasources: { db: { url: replicaUrl } } })
    : prisma;

  if (prismaRead !== prisma) {
    await prismaRead.$connect();
    fastify.log.info('Read replica enabled for dashboard queries');
  }

  fastify.decorate('prisma', prisma);
  fastify.decorate('prismaRead', prismaRead);

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
    if (prismaRead !== prisma) await prismaRead.$disconnect();
  });
});

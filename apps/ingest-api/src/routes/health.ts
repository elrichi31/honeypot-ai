import type { FastifyInstance } from 'fastify';
import { withCache } from '../lib/cache-helper.js';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    const result = await withCache(fastify.cache, 'health:last-event', 60, async () => {
      const rows = await fastify.prisma.$queryRaw<Array<{ last_at: Date | null }>>`
        SELECT MAX(started_at) AS last_at FROM sessions
      `
      return rows[0]?.last_at?.toISOString() ?? null
    })
    return { status: 'ok', lastEventAt: result }
  });
}

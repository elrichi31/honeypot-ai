import type { FastifyInstance } from 'fastify';

/**
 * GET /stats/session-commands
 * Returns a map of { [sessionId]: string[] } with all commands per session.
 * Used by the dashboard for behavioral clustering.
 */
export async function statsRoutes(fastify: FastifyInstance) {
  fastify.get('/stats/session-commands', async (request) => {
    const { limit = '500' } = request.query as Record<string, string>;

    const events = await fastify.prisma.event.findMany({
      where: { eventType: 'command.input', command: { not: null } },
      select: { sessionId: true, command: true },
      take: Math.min(Number(limit), 5000),
      orderBy: { eventTs: 'asc' },
    });

    const result: Record<string, string[]> = {};
    for (const e of events) {
      if (!e.command) continue;
      if (!result[e.sessionId]) result[e.sessionId] = [];
      result[e.sessionId].push(e.command);
    }

    return result;
  });
}

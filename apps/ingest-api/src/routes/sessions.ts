import type { FastifyInstance } from 'fastify';

export async function sessionRoutes(fastify: FastifyInstance) {
  fastify.get('/sessions', async (request) => {
    const { limit = '50', offset = '0' } = request.query as Record<string, string>;

    const sessions = await fastify.prisma.session.findMany({
      take: Math.min(Number(limit), 100),
      skip: Number(offset),
      orderBy: { startedAt: 'desc' },
      include: { _count: { select: { events: true } } },
    });

    return sessions;
  });

  fastify.get('/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const session = await fastify.prisma.session.findUnique({
      where: { id },
      include: { events: { orderBy: { eventTs: 'asc' } } },
    });

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    return session;
  });
}

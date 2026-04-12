import type { FastifyInstance } from 'fastify';

export async function eventRoutes(fastify: FastifyInstance) {
  fastify.get('/events', async (request) => {
    const { limit = '50', offset = '0', type } = request.query as Record<string, string>;

    const events = await fastify.prisma.event.findMany({
      take: Math.min(Number(limit), 100),
      skip: Number(offset),
      orderBy: { eventTs: 'desc' },
      ...(type && { where: { eventType: type } }),
    });

    return events;
  });
}

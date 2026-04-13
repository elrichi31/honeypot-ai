import type { FastifyInstance } from 'fastify';

const UTC_OFFSET_HOURS = -5;

function toOffsetISOString(date: Date): string {
  const offsetMs = UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  const sign = UTC_OFFSET_HOURS >= 0 ? '+' : '-';
  const abs = Math.abs(UTC_OFFSET_HOURS).toString().padStart(2, '0');
  return local.toISOString().replace('Z', `${sign}${abs}:00`);
}

export async function eventRoutes(fastify: FastifyInstance) {
  fastify.get('/events', async (request) => {
    const { limit = '50', offset = '0', type } = request.query as Record<string, string>;

    const events = await fastify.prisma.event.findMany({
      take: Math.min(Number(limit), 100),
      skip: Number(offset),
      orderBy: { eventTs: 'desc' },
      ...(type && { where: { eventType: type } }),
    });

    return events.map((e) => ({
      ...e,
      eventTs: toOffsetISOString(e.eventTs),
      createdAt: toOffsetISOString(e.createdAt),
      cowrieTs: toOffsetISOString(new Date(e.cowrieTs as string)),
    }));
  });
}

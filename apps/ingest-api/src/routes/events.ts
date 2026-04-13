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
    const { limit = '50', offset = '0', type, startDate, endDate } = request.query as Record<string, string>;

    const where: Record<string, unknown> = {};
    if (type) where.eventType = type;
    if (startDate || endDate) {
      where.eventTs = {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      };
    }

    const events = await fastify.prisma.event.findMany({
      take: Math.min(Number(limit), 2000),
      skip: Number(offset),
      orderBy: { eventTs: 'desc' },
      ...(Object.keys(where).length > 0 && { where }),
    });

    return events.map((e) => ({
      ...e,
      eventTs: toOffsetISOString(e.eventTs),
      createdAt: toOffsetISOString(e.createdAt),
      cowrieTs: toOffsetISOString(new Date(e.cowrieTs as string)),
    }));
  });
}

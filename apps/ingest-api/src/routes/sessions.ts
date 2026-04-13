import type { FastifyInstance } from 'fastify';

const UTC_OFFSET_HOURS = -5;

function toOffsetISOString(date: Date): string {
  const offsetMs = UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  const sign = UTC_OFFSET_HOURS >= 0 ? '+' : '-';
  const abs = Math.abs(UTC_OFFSET_HOURS).toString().padStart(2, '0');
  return local.toISOString().replace('Z', `${sign}${abs}:00`);
}

function formatSession(s: any) {
  return {
    ...s,
    startedAt: toOffsetISOString(s.startedAt),
    endedAt: s.endedAt ? toOffsetISOString(s.endedAt) : null,
    createdAt: toOffsetISOString(s.createdAt),
    updatedAt: toOffsetISOString(s.updatedAt),
  };
}

function formatEvent(e: any) {
  return {
    ...e,
    eventTs: toOffsetISOString(e.eventTs),
    createdAt: toOffsetISOString(e.createdAt),
    cowrieTs: toOffsetISOString(new Date(e.cowrieTs as string)),
  };
}

export async function sessionRoutes(fastify: FastifyInstance) {
  fastify.get('/sessions', async (request) => {
    const { limit = '50', offset = '0' } = request.query as Record<string, string>;

    const sessions = await fastify.prisma.session.findMany({
      take: Math.min(Number(limit), 100),
      skip: Number(offset),
      orderBy: { startedAt: 'desc' },
      include: { _count: { select: { events: true } } },
    });

    return sessions.map(formatSession);
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

    return {
      ...formatSession(session),
      events: session.events.map(formatEvent),
    };
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { toOffsetISOString } from '../lib/date-utils.js';
import { basePaginationSchema, getPagination, buildPaginationResponse } from '../lib/pagination.js';

const eventListQuerySchema = basePaginationSchema.extend({
  type: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

export async function eventRoutes(fastify: FastifyInstance) {
  fastify.get('/events', async (request, reply) => {
    const parsed = eventListQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query params',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { page, pageSize, offset } = getPagination(parsed.data);
    const search = parsed.data.q?.trim();

    const where = {
      ...(parsed.data.type ? { eventType: parsed.data.type } : {}),
      ...((parsed.data.startDate || parsed.data.endDate)
        ? {
            eventTs: {
              ...(parsed.data.startDate && { gte: new Date(parsed.data.startDate) }),
              ...(parsed.data.endDate && { lte: new Date(parsed.data.endDate) }),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { srcIp: { startsWith: search, mode: 'insensitive' as const } },
              { command: { contains: search, mode: 'insensitive' as const } },
              { message: { contains: search, mode: 'insensitive' as const } },
              { username: { contains: search, mode: 'insensitive' as const } },
              { password: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [events, total] = await Promise.all([
      fastify.prisma.event.findMany({
        where,
        take: pageSize,
        skip: offset,
        orderBy: { eventTs: 'desc' },
      }),
      fastify.prisma.event.count({ where }),
    ]);

    return {
      items: events.map((e) => ({
        ...e,
        eventTs: toOffsetISOString(e.eventTs),
        createdAt: toOffsetISOString(e.createdAt),
        cowrieTs: toOffsetISOString(new Date(e.cowrieTs as string)),
      })),
      pagination: buildPaginationResponse(total, page, pageSize),
    };
  });
}

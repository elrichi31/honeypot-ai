import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const UTC_OFFSET_HOURS = -5;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 5000;

const eventListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  type: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

function toOffsetISOString(date: Date): string {
  const offsetMs = UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  const sign = UTC_OFFSET_HOURS >= 0 ? '+' : '-';
  const abs = Math.abs(UTC_OFFSET_HOURS).toString().padStart(2, '0');
  return local.toISOString().replace('Z', `${sign}${abs}:00`);
}

export async function eventRoutes(fastify: FastifyInstance) {
  fastify.get('/events', async (request, reply) => {
    const parsed = eventListQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query params',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const pageSize = Math.min(
      parsed.data.pageSize ?? parsed.data.limit ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const offset = parsed.data.offset ?? ((parsed.data.page ?? 1) - 1) * pageSize;
    const page = parsed.data.page ?? Math.floor(offset / pageSize) + 1;
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

    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

    return {
      items: events.map((e) => ({
        ...e,
        eventTs: toOffsetISOString(e.eventTs),
        createdAt: toOffsetISOString(e.createdAt),
        cowrieTs: toOffsetISOString(new Date(e.cowrieTs as string)),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  });
}

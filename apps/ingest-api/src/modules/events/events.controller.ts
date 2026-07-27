import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { toOffsetISOString } from '../../lib/date-utils.js';
import { classifyCommand } from '../../lib/risk-score.js';
import { basePaginationSchema, getPagination, buildPaginationResponse } from '../../lib/pagination.js';
import { parseSensorScope } from '../../lib/sensor-scope.js';

const eventListQuerySchema = basePaginationSchema.extend({
  type: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

function buildEventWhere(
  data: { type?: string; q?: string; startDate?: string; endDate?: string },
  scope: ReturnType<typeof parseSensorScope>,
) {
  const search = data.q?.trim();
  return {
    // events have no sensor_id — scope through the owning session's sensor.
    // Empty sensorIds (fail-closed / __none__) → `in: []` matches nothing.
    ...(scope.all ? {} : { session: { sensorId: { in: scope.sensorIds } } }),
    ...(data.type ? { eventType: data.type } : {}),
    ...((data.startDate || data.endDate)
      ? {
          eventTs: {
            ...(data.startDate && { gte: new Date(data.startDate) }),
            ...(data.endDate && { lte: new Date(data.endDate) }),
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

    const { page, pageSize, offset } = getPagination(parsed.data);
    const scope = parseSensorScope(request.query as Record<string, unknown>);
    const where = buildEventWhere(parsed.data, scope);

    // Threat-category filter: reuse the single TS classifier (no SQL regex
    // duplication). Classify the distinct matching commands, keep those in the
    // requested category, then filter the list to `command IN (...)` — an
    // indexed filter that paginates correctly.
    if (parsed.data.category) {
      const grouped = await fastify.prisma.event.groupBy({
        by: ['command'],
        where: { ...where, eventType: 'command.input', command: { not: null } },
      });
      const wanted = grouped
        .map((g) => g.command)
        .filter((cmd): cmd is string => cmd != null && (classifyCommand(cmd) ?? 'other') === parsed.data.category);
      Object.assign(where, { command: { in: wanted } });
    }

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
        commandCategory: e.command ? classifyCommand(e.command) : null,
      })),
      pagination: buildPaginationResponse(total, page, pageSize),
    };
  });

  // Global threat-category breakdown over ALL matching command events (not just
  // one page). Groups by distinct command — bots reuse the same strings, so the
  // set stays small — then classifies each once and sums occurrences.
  fastify.get('/events/command-categories', async (request, reply) => {
    const parsed = eventListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query params',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const scope = parseSensorScope(request.query as Record<string, unknown>);
    const where = { ...buildEventWhere(parsed.data, scope), eventType: 'command.input', command: { not: null } };

    const grouped = await fastify.prisma.event.groupBy({
      by: ['command'],
      where,
      _count: { _all: true },
    });

    const categories: Record<string, number> = {};
    let total = 0;
    let malicious = 0;
    for (const row of grouped) {
      const count = row._count._all;
      total += count;
      const category = row.command ? classifyCommand(row.command) : null;
      const key = category ?? 'other';
      categories[key] = (categories[key] ?? 0) + count;
      if (category && category !== 'recon') malicious += count;
    }

    return { categories, total, malicious };
  });
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ensureIngestToken } from '../lib/ingest-auth.js';

const webHitSchema = z.object({
  eventId:    z.string().uuid(),
  timestamp:  z.string().datetime({ offset: true }),
  srcIp:      z.string().min(1),
  method:     z.string().min(1),
  path:       z.string().min(1),
  query:      z.string().default(''),
  userAgent:  z.string().default(''),
  headers:    z.record(z.string()).default({}),
  body:       z.string().default(''),
  attackType: z.string().min(1),
});

export async function webRoutes(fastify: FastifyInstance) {
  fastify.post('/ingest/web/event', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply;

    const parsed = webHitSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid web event',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const d = parsed.data;

    try {
      const hit = await fastify.prisma.webHit.create({
        data: {
          eventId:    d.eventId,
          srcIp:      d.srcIp,
          method:     d.method,
          path:       d.path,
          query:      d.query,
          userAgent:  d.userAgent,
          headers:    d.headers,
          body:       d.body,
          attackType: d.attackType,
          timestamp:  new Date(d.timestamp),
        },
      });

      return reply.status(201).send({ id: hit.id, attackType: hit.attackType });
    } catch (err: unknown) {
      // Duplicate eventId — idempotent, treat as success
      if (err instanceof Error && err.message.includes('Unique constraint')) {
        return reply.status(200).send({ duplicate: true });
      }
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: msg });
    }
  });

  fastify.get('/web-hits', async (request, reply) => {
    const querySchema = z.object({
      limit:      z.coerce.number().min(1).max(500).default(100),
      offset:     z.coerce.number().min(0).default(0),
      attackType: z.string().optional(),
      srcIp:      z.string().optional(),
    });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query params' });
    }

    const { limit, offset, attackType, srcIp } = parsed.data;

    const where = {
      ...(attackType ? { attackType } : {}),
      ...(srcIp      ? { srcIp }      : {}),
    };

    const [hits, total] = await Promise.all([
      fastify.prisma.webHit.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true, srcIp: true, method: true, path: true,
          query: true, userAgent: true, attackType: true, timestamp: true,
        },
      }),
      fastify.prisma.webHit.count({ where }),
    ]);

    return reply.send({ total, hits });
  });

  // Hits por día desglosados por tipo de ataque (últimos 30 días)
  fastify.get('/web-hits/timeline', async (_request, reply) => {
    const rows = await fastify.prisma.$queryRaw<Array<{
      day:         string;
      attack_type: string;
      count:       bigint;
    }>>`
      SELECT
        TO_CHAR(timestamp AT TIME ZONE 'UTC', 'DD/MM') AS day,
        attack_type,
        COUNT(*)                                        AS count
      FROM web_hits
      WHERE timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY day, attack_type
      ORDER BY MIN(timestamp), attack_type
    `;

    // Pivot: { day -> { attackType -> count } }
    const dayMap = new Map<string, Record<string, number>>();
    for (const r of rows) {
      if (!dayMap.has(r.day)) dayMap.set(r.day, {});
      dayMap.get(r.day)![r.attack_type] = Number(r.count);
    }

    const attackTypes = [...new Set(rows.map(r => r.attack_type))];

    return reply.send({
      days: Array.from(dayMap.entries()).map(([day, types]) => ({ day, ...types })),
      attackTypes,
    });
  });

  // Top paths con desglose por tipo de ataque
  fastify.get('/web-hits/paths', async (_request, reply) => {
    const rows = await fastify.prisma.$queryRaw<Array<{
      path:        string;
      attack_type: string;
      count:       bigint;
    }>>`
      SELECT
        path,
        attack_type,
        COUNT(*) AS count
      FROM web_hits
      GROUP BY path, attack_type
      ORDER BY COUNT(*) DESC
      LIMIT 200
    `;

    // Agrupar por path
    const pathMap = new Map<string, { total: number; byType: Record<string, number> }>();
    for (const r of rows) {
      if (!pathMap.has(r.path)) pathMap.set(r.path, { total: 0, byType: {} });
      const entry = pathMap.get(r.path)!;
      entry.byType[r.attack_type] = Number(r.count);
      entry.total += Number(r.count);
    }

    const paths = Array.from(pathMap.entries())
      .map(([path, data]) => ({ path, total: data.total, byType: data.byType }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 50);

    return reply.send({ paths });
  });

  // Hits agrupados por IP — equivalente a la vista de sesiones SSH
  fastify.get('/web-hits/by-ip', async (_request, reply) => {
    const rows = await fastify.prisma.$queryRaw<Array<{
      src_ip:       string;
      total_hits:   bigint;
      first_seen:   Date;
      last_seen:    Date;
      attack_types: string[];
      top_paths:    string[];
      user_agents:  string[];
    }>>`
      SELECT
        src_ip,
        COUNT(*)                                          AS total_hits,
        MIN(timestamp)                                    AS first_seen,
        MAX(timestamp)                                    AS last_seen,
        ARRAY_AGG(DISTINCT attack_type)                   AS attack_types,
        (ARRAY_AGG(path ORDER BY timestamp DESC))[1:5]   AS top_paths,
        ARRAY_AGG(DISTINCT user_agent)
          FILTER (WHERE user_agent <> '')                 AS user_agents
      FROM web_hits
      GROUP BY src_ip
      ORDER BY total_hits DESC
    `;

    return reply.send(rows.map(r => ({
      srcIp:       r.src_ip,
      totalHits:   Number(r.total_hits),
      firstSeen:   r.first_seen,
      lastSeen:    r.last_seen,
      attackTypes: r.attack_types ?? [],
      topPaths:    r.top_paths   ?? [],
      userAgents:  (r.user_agents ?? []).slice(0, 3),
    })));
  });

  fastify.get('/web-hits/stats', async (_request, reply) => {
    const [byAttackType, byIp, total] = await Promise.all([
      fastify.prisma.webHit.groupBy({
        by: ['attackType'],
        _count: { _all: true },
        orderBy: { _count: { attackType: 'desc' } },
      }),
      fastify.prisma.webHit.groupBy({
        by: ['srcIp'],
        _count: { _all: true },
        orderBy: { _count: { srcIp: 'desc' } },
        take: 10,
      }),
      fastify.prisma.webHit.count(),
    ]);

    return reply.send({
      total,
      byAttackType: byAttackType.map(r => ({ attackType: r.attackType, count: r._count._all })),
      topIps:       byIp.map(r => ({ srcIp: r.srcIp, count: r._count._all })),
    });
  });
}

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { ensureIngestToken } from '../lib/ingest-auth.js';
import { isWebHitBot } from '../lib/bot-detector.js';
import { eventBus } from '../lib/event-bus.js';
import { lookupGeo } from '../lib/geo.js';
import { scheduleThreatAlert, evaluateCanaryAlert } from '../lib/threat-alerts.js';
import { forwardClientEventBySensorId } from '../lib/client-forward.js';
import { basePaginationSchema, getPagination, buildPaginationResponse } from '../lib/pagination.js';
import { withCache } from '../lib/cache-helper.js';
import { webHitSchema, normalizeHeaders, parseWebHitBatch } from '../lib/web-normalize.js';
import {
  insertWebHit,
  buildByIpWhereSql,
  buildWebHitsWhereSql,
  buildSortSql,
  rangeToInterval,
  queryWebBursts,
  countWebBursts,
  countWebHitsByIp,
  queryWebHitsByIp,
  type WebHitsByIpRow,
  type WebHitRow,
  type AttackTypeStatRow,
  type IpStatRow,
} from '../lib/web-queries.js';

const webHitsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(500).default(100),
  offset: z.coerce.number().min(0).default(0),
  attackType: z.string().optional(),
  srcIp: z.string().optional(),
});

const ATTACK_TYPES = ['sqli', 'xss', 'lfi', 'rfi', 'cmdi', 'log4shell', 'ssti', 'xxe', 'deserialization', 'scanner', 'info_disclosure', 'recon'] as const;

const RANGES = ['24h', '7d', '30d', 'all'] as const;

const byIpQuerySchema = basePaginationSchema.extend({
  q: z.string().trim().min(1).optional(),
  attackType: z.enum(ATTACK_TYPES).optional(),
  range: z.enum(RANGES).optional(),
  sortBy: z.enum(['totalHits', 'lastSeen', 'firstSeen']).default('totalHits'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

function emitAttackEvent(srcIp: string, timestamp: string) {
  const geo = lookupGeo(srcIp);
  if (geo) eventBus.emit('attack', { type: 'http', ip: srcIp, ...geo, timestamp });
}

function forwardWebEvent(
  fastify: FastifyInstance,
  d: z.infer<typeof webHitSchema> & { headers: Record<string, string> },
  sensorId: string | null
) {
  void forwardClientEventBySensorId(fastify.prisma, sensorId, {
    kind: 'web.event',
    event: {
      eventId: d.eventId,
      sensorId,
      timestamp: d.timestamp,
      srcIp: d.srcIp,
      method: d.method,
      path: d.path,
      query: d.query,
      userAgent: d.userAgent,
      headers: d.headers,
      body: d.body,
      attackType: d.attackType,
    },
  });
}

async function handleSingleEvent(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  if (!ensureIngestToken(request, reply)) return reply;

  const parsed = webHitSchema.safeParse(request.body);
  if (!parsed.success) {
    fastify.log.warn({ details: parsed.error.flatten().fieldErrors, body: request.body }, 'Rejected invalid web event');
    return reply.status(400).send({ error: 'Invalid web event', details: parsed.error.flatten().fieldErrors });
  }

  const d = { ...parsed.data, headers: normalizeHeaders(parsed.data.headers) };
  const sensorId = d.sensorId ?? null;

  try {
    const row = await insertWebHit(fastify.prisma, d, sensorId);
    if (row) {
      emitAttackEvent(d.srcIp, d.timestamp);
      forwardWebEvent(fastify, d, sensorId);
      scheduleThreatAlert(fastify.prisma, d.srcIp);
      if (d.canaryTriggered) {
        void evaluateCanaryAlert(fastify.prisma, { ip: d.srcIp, path: d.path });
      }
      return reply.status(201).send({ id: row.id, attackType: row.attack_type });
    }
    return reply.status(200).send({ duplicate: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fastify.log.error({ err, srcIp: d.srcIp, path: d.path, userAgent: d.userAgent, attackType: d.attackType }, 'Failed to insert web hit');
    return reply.status(500).send({ error: msg });
  }
}

async function handleBatchEvents(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  if (!ensureIngestToken(request, reply)) return reply;

  const raw = Array.isArray(request.body) ? request.body : [request.body];
  const { events, invalidCount } = parseWebHitBatch(raw);

  if (invalidCount > 0) {
    fastify.log.warn({ invalid: invalidCount, total: raw.length }, 'Rejected invalid Galah web events');
  }
  if (events.length === 0) return reply.status(200).send({ inserted: 0, invalid: invalidCount });

  let inserted = 0;
  for (const d of events) {
    try {
      const row = await insertWebHit(fastify.prisma, d, d.sensorId ?? null);
      if (row) {
        inserted++;
        emitAttackEvent(d.srcIp, d.timestamp);
        forwardWebEvent(fastify, d, d.sensorId ?? null);
        scheduleThreatAlert(fastify.prisma, d.srcIp);
        if (d.canaryTriggered) {
          void evaluateCanaryAlert(fastify.prisma, { ip: d.srcIp, path: d.path });
        }
      }
    } catch {
      // skip malformed individual events
    }
  }

  return reply.status(200).send({ inserted, total: events.length, invalid: invalidCount });
}

async function handleListHits(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const parsed = webHitsQuerySchema.safeParse(request.query);
  if (!parsed.success) return reply.status(400).send({ error: 'Invalid query params' });

  const { limit, offset, attackType, srcIp } = parsed.data;
  const whereSql = buildWebHitsWhereSql({ attackType, srcIp });

  const [countRows, hits] = await Promise.all([
    fastify.prisma.$queryRaw<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM web_hits ${whereSql}`,
    fastify.prisma.$queryRaw<WebHitRow[]>`
      SELECT id, src_ip AS "srcIp", method, path, query, user_agent AS "userAgent",
        attack_type AS "attackType", canary_triggered AS "canaryTriggered",
        body, headers, timestamp,
        headers->>'x-galah-result' AS "galahResult",
        headers->>'x-galah-error-type' AS "galahErrorType",
        FALSE AS "isBot"
      FROM web_hits ${whereSql}
      ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}
    `,
  ]);

  return reply.send({
    total: countRows[0]?.total ?? 0,
    hits: hits.map((h) => ({ ...h, isBot: isWebHitBot(h.attackType, h.userAgent) })),
  });
}

async function handleTimeline(fastify: FastifyInstance, _request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await withCache(fastify.cache, 'web-hits:timeline', 300, async () => {
    const rows = await fastify.prisma.$queryRaw<Array<{ isoDay: string; attack_type: string; count: bigint }>>`
      SELECT
        TO_CHAR(DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "isoDay",
        attack_type, COUNT(*) AS count
      FROM web_hits
      WHERE timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY 1, 2 ORDER BY 1, 2
    `;

    const dayMap = new Map<string, Record<string, number>>();
    for (const row of rows) {
      if (!dayMap.has(row.isoDay)) dayMap.set(row.isoDay, {});
      dayMap.get(row.isoDay)![row.attack_type] = Number(row.count);
    }

    type WebTimelineDay = { day: string } & Record<string, string | number>;
    const attackTypes = [...new Set(rows.map((r) => r.attack_type))];
    const days: WebTimelineDay[] = [];
    const now = new Date();
    for (let i = 30; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const isoDay = d.toISOString().slice(0, 10);
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      days.push({ day: label, ...(dayMap.get(isoDay) ?? {}) });
    }

    return { days, attackTypes };
  }));
}

async function handlePaths(fastify: FastifyInstance, _request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await withCache(fastify.cache, 'web-hits:paths', 600, async () => {
    const rows = await fastify.prisma.$queryRaw<Array<{ path: string; attack_type: string; count: bigint }>>`
      SELECT path, attack_type, COUNT(*) AS count
      FROM web_hits
      WHERE timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY path, attack_type
      ORDER BY COUNT(*) DESC LIMIT 200
    `;
    const pathMap = new Map<string, { total: number; byType: Record<string, number> }>();
    for (const row of rows) {
      if (!pathMap.has(row.path)) pathMap.set(row.path, { total: 0, byType: {} });
      const entry = pathMap.get(row.path)!;
      entry.byType[row.attack_type] = Number(row.count);
      entry.total += Number(row.count);
    }
    const paths = Array.from(pathMap.entries())
      .map(([path, data]) => ({ path, total: data.total, byType: data.byType }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 50);
    return { paths };
  }));
}

function mapByIpRow(row: WebHitsByIpRow) {
  return {
    srcIp: row.src_ip,
    totalHits: row.total_hits,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    attackTypes: row.attack_types ?? [],
    topPaths: row.top_paths ?? [],
    userAgents: (row.user_agents ?? []).slice(0, 3),
    botHits: row.bot_hits ?? 0,
    isBot: (row.bot_hits ?? 0) >= row.total_hits * 0.8,
    canaryHits: row.canary_hits ?? 0,
  };
}

async function handleByIp(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const parsed = byIpQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Invalid query params', details: parsed.error.flatten().fieldErrors });
  }

  const { page, pageSize, offset } = getPagination(parsed.data);
  const cacheKey = `web-hits:by-ip:${page}:${pageSize}:${parsed.data.q ?? ''}:${parsed.data.attackType ?? ''}:${parsed.data.range ?? ''}:${parsed.data.sortBy}:${parsed.data.sortDir}`

  return reply.send(await withCache(fastify.cache, cacheKey, 60, async () => {
    const whereSql = buildByIpWhereSql(parsed.data.q, parsed.data.attackType, parsed.data.range);
    const orderCol = buildSortSql(parsed.data.sortBy);
    const orderDir = parsed.data.sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    const [total, rows] = await Promise.all([
      countWebHitsByIp(fastify.prisma, whereSql),
      queryWebHitsByIp(fastify.prisma, whereSql, orderCol, orderDir, pageSize, offset),
    ]);

    return {
      items: rows.map(mapByIpRow),
      pagination: buildPaginationResponse(total, page, pageSize),
    };
  }));
}

const statsQuerySchema = z.object({ range: z.enum(RANGES).optional() });

async function handleStats(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const parsed = statsQuerySchema.safeParse(request.query);
  const range = parsed.success ? parsed.data.range : undefined;
  // Default window is 30 days; an explicit range narrows or opens it ('all').
  const interval = rangeToInterval(range);
  const windowSql = interval
    ? Prisma.sql`WHERE timestamp >= NOW() - ${interval}::interval`
    : range === 'all'
      ? Prisma.sql``
      : Prisma.sql`WHERE timestamp >= NOW() - INTERVAL '30 days'`;

  return reply.send(await withCache(fastify.cache, `web-hits:stats:${range ?? ''}`, 300, async () => {
    const [attackTypeRows, topIpRows, totalRows] = await Promise.all([
      fastify.prisma.$queryRaw<AttackTypeStatRow[]>`
        SELECT attack_type, COUNT(*)::int AS count FROM web_hits
        ${windowSql}
        GROUP BY attack_type ORDER BY count DESC
      `,
      fastify.prisma.$queryRaw<IpStatRow[]>`
        SELECT src_ip, COUNT(*)::int AS count FROM web_hits
        ${windowSql}
        GROUP BY src_ip ORDER BY count DESC LIMIT 10
      `,
      fastify.prisma.$queryRaw<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM web_hits ${windowSql}`,
    ]);
    return {
      total: totalRows[0]?.total ?? 0,
      byAttackType: attackTypeRows.map((r) => ({ attackType: r.attack_type, count: r.count })),
      topIps: topIpRows.map((r) => ({ srcIp: r.src_ip, count: r.count })),
    };
  }));
}

const burstsQuerySchema = basePaginationSchema.extend({
  q: z.string().trim().min(1).optional(),
  attackType: z.enum(ATTACK_TYPES).optional(),
  range: z.enum(RANGES).optional(),
  gapMinutes: z.coerce.number().int().min(1).max(240).default(15),
});

async function handleBursts(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const parsed = burstsQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    return reply.status(400).send({ error: 'Invalid query params', details: parsed.error.flatten().fieldErrors });
  }

  const { page, pageSize, offset } = getPagination(parsed.data);
  const { q, attackType, range, gapMinutes } = parsed.data;
  const cacheKey = `web-hits:bursts:${page}:${pageSize}:${q ?? ''}:${attackType ?? ''}:${range ?? ''}:${gapMinutes}`;

  return reply.send(await withCache(fastify.cache, cacheKey, 60, async () => {
    const whereSql = buildByIpWhereSql(q, attackType, range);
    const [total, rows] = await Promise.all([
      countWebBursts(fastify.prisma, whereSql, gapMinutes),
      queryWebBursts(fastify.prisma, whereSql, gapMinutes, pageSize, offset),
    ]);
    const items = rows.map((r) => {
      const durationSec = r.duration_sec ?? 0;
      // Intensity in hits/min; a single-hit burst (0s) reports its raw hit count.
      const intensity = durationSec > 0 ? (r.hits / (durationSec / 60)) : r.hits;
      return {
        srcIp: r.src_ip,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        hits: r.hits,
        durationSec,
        intensityPerMin: Math.round(intensity * 10) / 10,
        attackTypes: r.attack_types ?? [],
        topPaths: r.top_paths ?? [],
        canaryHits: r.canary_hits ?? 0,
      };
    });
    return { items, pagination: buildPaginationResponse(total, page, pageSize) };
  }));
}

async function handleHourly(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const parsed = statsQuerySchema.safeParse(request.query);
  const range = parsed.success ? parsed.data.range : undefined;
  const interval = rangeToInterval(range);
  const windowSql = interval
    ? Prisma.sql`WHERE timestamp >= NOW() - ${interval}::interval`
    : range === 'all'
      ? Prisma.sql``
      : Prisma.sql`WHERE timestamp >= NOW() - INTERVAL '7 days'`;

  return reply.send(await withCache(fastify.cache, `web-hits:hourly:${range ?? ''}`, 300, async () => {
    // Hits bucketed by day + hour-of-day, for an activity heatmap.
    const rows = await fastify.prisma.$queryRaw<Array<{ day: string; hour: number; count: number }>>`
      SELECT TO_CHAR(DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
        EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC')::int AS hour,
        COUNT(*)::int AS count
      FROM web_hits ${windowSql}
      GROUP BY 1, 2 ORDER BY 1, 2
    `;
    return { cells: rows };
  }));
}

export async function webRoutes(fastify: FastifyInstance) {
  fastify.post('/ingest/web/event', (req, rep) => handleSingleEvent(fastify, req, rep));
  fastify.post('/ingest/web/vector', (req, rep) => handleBatchEvents(fastify, req, rep));
  fastify.get('/web-hits', (req, rep) => handleListHits(fastify, req, rep));
  fastify.get('/web-hits/timeline', (req, rep) => handleTimeline(fastify, req, rep));
  fastify.get('/web-hits/paths', (req, rep) => handlePaths(fastify, req, rep));
  fastify.get('/web-hits/by-ip', (req, rep) => handleByIp(fastify, req, rep));
  fastify.get('/web-hits/bursts', (req, rep) => handleBursts(fastify, req, rep));
  fastify.get('/web-hits/hourly', (req, rep) => handleHourly(fastify, req, rep));
  fastify.get('/web-hits/stats', (req, rep) => handleStats(fastify, req, rep));
}

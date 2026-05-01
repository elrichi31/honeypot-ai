import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ensureIngestToken } from '../lib/ingest-auth.js';
import { isWebHitBot } from '../lib/bot-detector.js';
import { eventBus } from '../lib/event-bus.js';
import { lookupGeo } from '../lib/geo.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 5000;

const webHitSchema = z.object({
  eventId: z.string().uuid(),
  timestamp: z.string().datetime({ offset: true }),
  srcIp: z.string().min(1),
  method: z.string().min(1),
  path: z.string().min(1),
  query: z.string().default(''),
  userAgent: z.string().default(''),
  headers: z.record(z.string()).default({}),
  body: z.string().default(''),
  attackType: z.string().min(1),
});

const byIpQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().min(1).optional(),
});

type WebHitsByIpRow = {
  src_ip: string;
  total_hits: number;
  first_seen: Date;
  last_seen: Date;
  attack_types: string[] | null;
  top_paths: string[] | null;
  user_agents: string[] | null;
  bot_hits: number;
};

type WebHitRow = {
  id: string;
  srcIp: string;
  method: string;
  path: string;
  query: string;
  userAgent: string;
  attackType: string;
  timestamp: Date;
  isBot: boolean;
};

type AttackTypeStatRow = {
  attack_type: string;
  count: number;
};

type IpStatRow = {
  src_ip: string;
  count: number;
};

function buildByIpWhereSql(query?: string) {
  const clauses: Prisma.Sql[] = [Prisma.sql`1 = 1`];

  if (query?.trim()) {
    const wildcard = /^[0-9a-fA-F:.]+$/.test(query) ? `${query}%` : `%${query}%`;
    clauses.push(Prisma.sql`src_ip ILIKE ${wildcard}`);
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
}

function buildWebHitsWhereSql(params: { attackType?: string; srcIp?: string }) {
  const clauses: Prisma.Sql[] = [Prisma.sql`1 = 1`];

  if (params.attackType) {
    clauses.push(Prisma.sql`attack_type = ${params.attackType}`);
  }

  if (params.srcIp) {
    clauses.push(Prisma.sql`src_ip = ${params.srcIp}`);
  }

  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
}

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
      const createdRows = await fastify.prisma.$queryRaw<Array<{ id: string; attack_type: string }>>`
        INSERT INTO web_hits (
          event_id,
          src_ip,
          method,
          path,
          query,
          user_agent,
          headers,
          body,
          attack_type,
          timestamp
        )
        VALUES (
          ${d.eventId},
          ${d.srcIp},
          ${d.method},
          ${d.path},
          ${d.query},
          ${d.userAgent},
          CAST(${JSON.stringify(d.headers)} AS jsonb),
          ${d.body},
          ${d.attackType},
          ${new Date(d.timestamp)}
        )
        ON CONFLICT (event_id) DO NOTHING
        RETURNING id, attack_type
      `;

      if (createdRows[0]) {
        const geo = lookupGeo(d.srcIp)
        if (geo) {
          eventBus.emit('attack', { type: 'http', ip: d.srcIp, ...geo, timestamp: d.timestamp })
        }
        return reply.status(201).send({
          id: createdRows[0].id,
          attackType: createdRows[0].attack_type,
        });
      }

      return reply.status(200).send({ duplicate: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: msg });
    }
  });

  // Batch endpoint used by Vector to ship Galah events
  fastify.post('/ingest/web/vector', async (request, reply) => {
    if (!ensureIngestToken(request, reply)) return reply;

    const raw = Array.isArray(request.body) ? request.body : [request.body];
    const events = raw
      .map((item) => webHitSchema.safeParse(item))
      .filter((r): r is { success: true; data: z.infer<typeof webHitSchema> } => r.success)
      .map((r) => r.data);

    if (events.length === 0) {
      return reply.status(200).send({ inserted: 0 });
    }

    let inserted = 0;
    for (const d of events) {
      try {
        const rows = await fastify.prisma.$queryRaw<Array<{ id: string }>>`
          INSERT INTO web_hits (
            event_id, src_ip, method, path, query,
            user_agent, headers, body, attack_type, timestamp
          )
          VALUES (
            ${d.eventId}, ${d.srcIp}, ${d.method}, ${d.path}, ${d.query},
            ${d.userAgent},
            CAST(${JSON.stringify(d.headers)} AS jsonb),
            ${d.body}, ${d.attackType},
            ${new Date(d.timestamp)}
          )
          ON CONFLICT (event_id) DO NOTHING
          RETURNING id
        `;
        if (rows[0]) {
          inserted++;
          const geo = lookupGeo(d.srcIp);
          if (geo) {
            eventBus.emit('attack', { type: 'http', ip: d.srcIp, ...geo, timestamp: d.timestamp });
          }
        }
      } catch {
        // skip malformed individual events
      }
    }

    return reply.status(200).send({ inserted, total: events.length });
  });

  fastify.get('/web-hits', async (request, reply) => {
    const querySchema = z.object({
      limit: z.coerce.number().min(1).max(500).default(100),
      offset: z.coerce.number().min(0).default(0),
      attackType: z.string().optional(),
      srcIp: z.string().optional(),
    });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query params' });
    }

    const { limit, offset, attackType, srcIp } = parsed.data;
    const whereSql = buildWebHitsWhereSql({ attackType, srcIp });

    const [countRows, hits] = await Promise.all([
      fastify.prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM web_hits
        ${whereSql}
      `,
      fastify.prisma.$queryRaw<WebHitRow[]>`
        SELECT
          id,
          src_ip AS "srcIp",
          method,
          path,
          query,
          user_agent AS "userAgent",
          attack_type AS "attackType",
          timestamp,
          FALSE AS "isBot"
        FROM web_hits
        ${whereSql}
        ORDER BY timestamp DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `,
    ]);

    return reply.send({
      total: countRows[0]?.total ?? 0,
      hits: hits.map(h => ({ ...h, isBot: isWebHitBot(h.attackType, h.userAgent) })),
    });
  });

  fastify.get('/web-hits/timeline', async (_request, reply) => {
    const rows = await fastify.prisma.$queryRaw<Array<{
      isoDay: string;
      attack_type: string;
      count: bigint;
    }>>`
      SELECT
        TO_CHAR(DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "isoDay",
        attack_type,
        COUNT(*) AS count
      FROM web_hits
      WHERE timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY 1, 2
      ORDER BY 1, 2
    `;

    const dayMap = new Map<string, Record<string, number>>();
    for (const row of rows) {
      if (!dayMap.has(row.isoDay)) dayMap.set(row.isoDay, {});
      dayMap.get(row.isoDay)![row.attack_type] = Number(row.count);
    }

    const attackTypes = [...new Set(rows.map((row) => row.attack_type))];

    // Dynamic attack-type keys coexist with the string day label.
    type WebTimelineDay = { day: string } & Record<string, string | number>;

    // Fill all 31 days so the chart shows a continuous series (empty days = zeros)
    const days: WebTimelineDay[] = [];
    const now = new Date();
    for (let i = 30; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const isoDay = d.toISOString().slice(0, 10);
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      days.push({ day: label, ...(dayMap.get(isoDay) ?? {}) });
    }

    return reply.send({ days, attackTypes });
  });

  fastify.get('/web-hits/paths', async (_request, reply) => {
    const rows = await fastify.prisma.$queryRaw<Array<{
      path: string;
      attack_type: string;
      count: bigint;
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

    return reply.send({ paths });
  });

  fastify.get('/web-hits/by-ip', async (request, reply) => {
    const parsed = byIpQuerySchema.safeParse(request.query);

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
    const whereSql = buildByIpWhereSql(parsed.data.q);

    const [countRows, rows] = await Promise.all([
      fastify.prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM (
          SELECT src_ip
          FROM web_hits
          ${whereSql}
          GROUP BY src_ip
        ) grouped_hits
      `,
      fastify.prisma.$queryRaw<WebHitsByIpRow[]>`
        WITH grouped_hits AS (
          SELECT
            src_ip,
            COUNT(*)::int AS total_hits,
            MIN(timestamp) AS first_seen,
            MAX(timestamp) AS last_seen,
            ARRAY_AGG(DISTINCT attack_type) AS attack_types,
            (ARRAY_AGG(path ORDER BY timestamp DESC))[1:5] AS top_paths,
            ARRAY_AGG(DISTINCT user_agent)
              FILTER (WHERE user_agent <> '') AS user_agents,
            COUNT(*) FILTER (
              WHERE attack_type IN ('scanner', 'recon')
                 OR user_agent ~* 'sqlmap|nikto|nmap|masscan|zgrab|nuclei|dirbuster|gobuster|wfuzz|hydra|medusa|burpsuite|metasploit|acunetix|nessus|openvas|shodan|censys|curl/|python-requests|go-http-client|libwww-perl|scrapy'
            )::int AS bot_hits
          FROM web_hits
          ${whereSql}
          GROUP BY src_ip
        )
        SELECT *
        FROM grouped_hits
        ORDER BY total_hits DESC, last_seen DESC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `,
    ]);

    const total = countRows[0]?.total ?? 0;
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

    return reply.send({
      items: rows.map((row) => ({
        srcIp: row.src_ip,
        totalHits: row.total_hits,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        attackTypes: row.attack_types ?? [],
        topPaths: row.top_paths ?? [],
        userAgents: (row.user_agents ?? []).slice(0, 3),
        botHits: row.bot_hits ?? 0,
        isBot: (row.bot_hits ?? 0) >= row.total_hits * 0.8,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  });

  fastify.get('/web-hits/stats', async (_request, reply) => {
    const [attackTypeRows, topIpRows, totalRows] = await Promise.all([
      fastify.prisma.$queryRaw<AttackTypeStatRow[]>`
        SELECT attack_type, COUNT(*)::int AS count
        FROM web_hits
        GROUP BY attack_type
        ORDER BY count DESC
      `,
      fastify.prisma.$queryRaw<IpStatRow[]>`
        SELECT src_ip, COUNT(*)::int AS count
        FROM web_hits
        GROUP BY src_ip
        ORDER BY count DESC
        LIMIT 10
      `,
      fastify.prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total
        FROM web_hits
      `,
    ]);

    return reply.send({
      total: totalRows[0]?.total ?? 0,
      byAttackType: attackTypeRows.map((row) => ({
        attackType: row.attack_type,
        count: row.count,
      })),
      topIps: topIpRows.map((row) => ({
        srcIp: row.src_ip,
        count: row.count,
      })),
    });
  });
}

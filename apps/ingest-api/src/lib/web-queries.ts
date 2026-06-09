import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { WebHit } from './web-normalize.js';

export type WebHitsByIpRow = {
  src_ip: string;
  total_hits: number;
  first_seen: Date;
  last_seen: Date;
  attack_types: string[] | null;
  top_paths: string[] | null;
  user_agents: string[] | null;
  bot_hits: number;
  canary_hits: number;
  sensor_ids: string[] | null;
  sensor_names: string[] | null;
  client_names: string[] | null;
};

export type WebHitRow = {
  id: string;
  srcIp: string;
  method: string;
  path: string;
  query: string;
  userAgent: string;
  attackType: string;
  canaryTriggered: boolean;
  body: string;
  headers: Record<string, string> | null;
  timestamp: Date;
  galahResult: string | null;
  galahErrorType: string | null;
  isBot: boolean;
};

export type AttackTypeStatRow = {
  attack_type: string;
  count: number;
};

export type IpStatRow = {
  src_ip: string;
  count: number;
};

/** Maps a range token to a Postgres interval, or null for "all time". */
export function rangeToInterval(range?: string): string | null {
  switch (range) {
    case '24h': return '24 hours';
    case '7d':  return '7 days';
    case '30d': return '30 days';
    default:    return null;
  }
}

export function buildByIpWhereSql(
  query?: string,
  attackType?: string,
  range?: string,
  sensorIds?: string[],
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [Prisma.sql`1 = 1`];
  if (query?.trim()) {
    const wildcard = /^[0-9a-fA-F:.]+$/.test(query) ? `${query}%` : `%${query}%`;
    clauses.push(Prisma.sql`src_ip ILIKE ${wildcard}`);
  }
  if (attackType?.trim()) {
    clauses.push(Prisma.sql`attack_type = ${attackType}`);
  }
  const interval = rangeToInterval(range);
  if (interval) {
    clauses.push(Prisma.sql`timestamp >= NOW() - ${interval}::interval`);
  }
  // Scope to a client/sensor selection. An empty (but defined) list means the
  // selection resolved to zero sensors, so match nothing rather than everything.
  if (sensorIds) {
    clauses.push(
      sensorIds.length > 0
        ? Prisma.sql`sensor_id IN (${Prisma.join(sensorIds)})`
        : Prisma.sql`FALSE`,
    );
  }
  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
}

export function buildWebHitsWhereSql(params: { attackType?: string; srcIp?: string }): Prisma.Sql {
  const clauses: Prisma.Sql[] = [Prisma.sql`1 = 1`];
  if (params.attackType) clauses.push(Prisma.sql`attack_type = ${params.attackType}`);
  if (params.srcIp) clauses.push(Prisma.sql`src_ip = ${params.srcIp}`);
  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
}

export function buildSortSql(
  sortBy: 'totalHits' | 'lastSeen' | 'firstSeen'
): Prisma.Sql {
  if (sortBy === 'lastSeen') return Prisma.sql`last_seen`;
  if (sortBy === 'firstSeen') return Prisma.sql`first_seen`;
  return Prisma.sql`total_hits`;
}

const BOT_USER_AGENT_PATTERN =
  'sqlmap|nikto|nmap|masscan|zgrab|nuclei|dirbuster|gobuster|wfuzz|hydra|medusa|burpsuite|metasploit|acunetix|nessus|openvas|shodan|censys|curl/|python-requests|go-http-client|libwww-perl|scrapy';

export async function countWebHitsByIp(
  prisma: PrismaClient,
  whereSql: Prisma.Sql
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: number }>>`
    SELECT COUNT(*)::int AS total
    FROM (SELECT src_ip FROM web_hits ${whereSql} GROUP BY src_ip) grouped_hits
  `;
  return rows[0]?.total ?? 0;
}

export async function queryWebHitsByIp(
  prisma: PrismaClient,
  whereSql: Prisma.Sql,
  orderCol: Prisma.Sql,
  orderDir: Prisma.Sql,
  pageSize: number,
  offset: number
): Promise<WebHitsByIpRow[]> {
  return prisma.$queryRaw<WebHitsByIpRow[]>`
    WITH grouped_hits AS (
      SELECT src_ip, COUNT(*)::int AS total_hits, MIN(timestamp) AS first_seen, MAX(timestamp) AS last_seen,
        ARRAY_AGG(DISTINCT attack_type) AS attack_types,
        (ARRAY_AGG(path ORDER BY timestamp DESC))[1:5] AS top_paths,
        ARRAY_AGG(DISTINCT user_agent) FILTER (WHERE user_agent <> '') AS user_agents,
        ARRAY_AGG(DISTINCT sensor_id) FILTER (WHERE sensor_id IS NOT NULL) AS sensor_ids,
        COUNT(*) FILTER (
          WHERE attack_type IN ('scanner', 'recon')
             OR user_agent ~* ${BOT_USER_AGENT_PATTERN}
        )::int AS bot_hits,
        COUNT(*) FILTER (WHERE canary_triggered)::int AS canary_hits
      FROM web_hits ${whereSql} GROUP BY src_ip
    )
    SELECT g.*,
      (SELECT ARRAY_AGG(DISTINCT s.name) FROM sensors s WHERE s.sensor_id = ANY(g.sensor_ids)) AS sensor_names,
      (SELECT ARRAY_AGG(DISTINCT c.name) FROM sensors s JOIN clients c ON c.id = s.client_id WHERE s.sensor_id = ANY(g.sensor_ids)) AS client_names
    FROM grouped_hits g ORDER BY ${orderCol} ${orderDir}, last_seen DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;
}

export type WebBurstRow = {
  src_ip: string;
  started_at: Date;
  ended_at: Date;
  hits: number;
  duration_sec: number;
  attack_types: string[] | null;
  top_paths: string[] | null;
  canary_hits: number;
};

/**
 * Detect attack "bursts": runs of hits from one IP with no inter-hit gap larger
 * than `gapMinutes`. A scanner firing 1000 requests in 10 minutes collapses into
 * a single burst row; if that IP returns hours later it starts a new burst. This
 * is what makes a one-off scan stop drowning out the rest of the timeline.
 *
 * Technique: mark each hit where the gap from the previous hit (same IP) exceeds
 * the threshold, take a running sum of those marks as a burst id, then aggregate.
 */
export type BurstSortBy = 'startedAt' | 'hits' | 'durationSec' | 'intensity';

/** Maps a sort key to its aggregate SQL expression in the burst query. */
export function buildBurstSortSql(sortBy: BurstSortBy): Prisma.Sql {
  switch (sortBy) {
    case 'hits':        return Prisma.sql`COUNT(*)`;
    case 'durationSec': return Prisma.sql`GREATEST(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))), 0)`;
    // hits per second; ordering by it is equivalent to hits/min and avoids /0.
    case 'intensity':   return Prisma.sql`COUNT(*)::numeric / GREATEST(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))), 1)`;
    default:            return Prisma.sql`MIN(timestamp)`;
  }
}

export async function queryWebBursts(
  prisma: PrismaClient,
  whereSql: Prisma.Sql,
  gapMinutes: number,
  orderCol: Prisma.Sql,
  orderDir: Prisma.Sql,
  limit: number,
  offset: number,
): Promise<WebBurstRow[]> {
  return prisma.$queryRaw<WebBurstRow[]>`
    WITH ordered AS (
      SELECT src_ip, timestamp, attack_type, path, canary_triggered,
        EXTRACT(EPOCH FROM (
          timestamp - LAG(timestamp) OVER (PARTITION BY src_ip ORDER BY timestamp)
        )) AS gap_sec
      FROM web_hits ${whereSql}
    ),
    marked AS (
      SELECT *,
        SUM(CASE WHEN gap_sec IS NULL OR gap_sec > ${gapMinutes} * 60 THEN 1 ELSE 0 END)
          OVER (PARTITION BY src_ip ORDER BY timestamp) AS burst_id
      FROM ordered
    )
    SELECT src_ip,
      MIN(timestamp) AS started_at,
      MAX(timestamp) AS ended_at,
      COUNT(*)::int AS hits,
      GREATEST(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))), 0)::int AS duration_sec,
      ARRAY_AGG(DISTINCT attack_type) AS attack_types,
      (ARRAY_AGG(path ORDER BY timestamp DESC))[1:5] AS top_paths,
      COUNT(*) FILTER (WHERE canary_triggered)::int AS canary_hits
    FROM marked
    GROUP BY src_ip, burst_id
    ORDER BY ${orderCol} ${orderDir}, MIN(timestamp) DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function countWebBursts(
  prisma: PrismaClient,
  whereSql: Prisma.Sql,
  gapMinutes: number,
): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: number }>>`
    WITH ordered AS (
      SELECT src_ip, timestamp,
        EXTRACT(EPOCH FROM (
          timestamp - LAG(timestamp) OVER (PARTITION BY src_ip ORDER BY timestamp)
        )) AS gap_sec
      FROM web_hits ${whereSql}
    ),
    marked AS (
      SELECT src_ip, timestamp,
        SUM(CASE WHEN gap_sec IS NULL OR gap_sec > ${gapMinutes} * 60 THEN 1 ELSE 0 END)
          OVER (PARTITION BY src_ip ORDER BY timestamp) AS burst_id
      FROM ordered
    )
    SELECT COUNT(*)::int AS total
    FROM (SELECT src_ip, burst_id FROM marked GROUP BY src_ip, burst_id) b
  `;
  return rows[0]?.total ?? 0;
}

type InsertedWebHit = { id: string; attack_type: string };

export async function insertWebHit(
  prisma: PrismaClient,
  d: WebHit & { headers: Record<string, string> },
  sensorId: string | null
): Promise<InsertedWebHit | null> {
  const rows = await prisma.$queryRaw<InsertedWebHit[]>`
    INSERT INTO web_hits (
      id, event_id, src_ip, sensor_id, method, path, query,
      user_agent, headers, body, attack_type, canary_triggered, timestamp
    )
    VALUES (
      gen_random_uuid()::text,
      ${d.eventId}, ${d.srcIp}, ${sensorId}, ${d.method}, ${d.path}, ${d.query},
      ${d.userAgent},
      CAST(${JSON.stringify(d.headers)} AS jsonb),
      ${d.body}, ${d.attackType}, ${d.canaryTriggered},
      ${new Date(d.timestamp)}
    )
    ON CONFLICT (event_id) DO NOTHING
    RETURNING id, attack_type
  `;
  return rows[0] ?? null;
}

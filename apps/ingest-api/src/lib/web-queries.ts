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

export function buildByIpWhereSql(query?: string, attackType?: string, range?: string): Prisma.Sql {
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
        COUNT(*) FILTER (
          WHERE attack_type IN ('scanner', 'recon')
             OR user_agent ~* ${BOT_USER_AGENT_PATTERN}
        )::int AS bot_hits,
        COUNT(*) FILTER (WHERE canary_triggered)::int AS canary_hits
      FROM web_hits ${whereSql} GROUP BY src_ip
    )
    SELECT * FROM grouped_hits ORDER BY ${orderCol} ${orderDir}, last_seen DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;
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

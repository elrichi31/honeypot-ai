import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { WebHit } from '../../lib/web-normalize.js'

export type WebHitsByIpRow = {
  src_ip: string
  total_hits: number
  first_seen: Date
  last_seen: Date
  attack_types: string[] | null
  top_paths: string[] | null
  user_agents: string[] | null
  bot_hits: number
  canary_hits: number
  sensor_ids: string[] | null
  sensor_names: string[] | null
  client_names: string[] | null
}

export type WebHitRow = {
  id: string
  srcIp: string
  method: string
  path: string
  query: string
  userAgent: string
  attackType: string
  canaryTriggered: boolean
  body: string
  headers: Record<string, string> | null
  timestamp: Date
  galahResult: string | null
  galahErrorType: string | null
  sessionHits: number | null
  sessionElapsedS: number | null
  pathsVisited: string[] | null
  attackChain: string[] | null
  isChainAttack: boolean | null
  clientFingerprint: string | null
  canaryTokenType: string | null
  referer: string | null
  httpVersion: string | null
  isBot: boolean
}

export type AttackTypeStatRow = {
  attack_type: string
  count: number
}

export type IpStatRow = {
  src_ip: string
  count: number
}

export type WebSessionRow = {
  client_fingerprint: string
  src_ips: string[]
  total_hits: number
  first_seen: Date
  last_seen: Date
  chain_hits: number
  canary_hits: number
  attack_types: string[]
  top_paths: string[]
  is_multi_ip: boolean
}

export type WebBurstRow = {
  src_ip: string
  started_at: Date
  ended_at: Date
  hits: number
  duration_sec: number
  attack_types: string[] | null
  top_paths: string[] | null
  canary_hits: number
}

export type BurstSortBy = 'startedAt' | 'hits' | 'durationSec' | 'intensity'

export function rangeToInterval(range?: string): string | null {
  switch (range) {
    case '24h': return '24 hours'
    case '7d':  return '7 days'
    case '30d': return '30 days'
    default:    return null
  }
}

/** Bare tenant sensor filter on web_hits: `sensor_id IN (...)` / `FALSE` / null (global). */
export function sensorCondition(sensorIds?: string[]): Prisma.Sql | null {
  if (!sensorIds) return null
  return sensorIds.length > 0
    ? Prisma.sql`sensor_id IN (${Prisma.join(sensorIds)})`
    : Prisma.sql`FALSE`
}

/** `AND <cond>` fragment for appending to a query that already has a WHERE. */
function andSensor(sensorIds?: string[]): Prisma.Sql {
  const cond = sensorCondition(sensorIds)
  return cond ? Prisma.sql`AND ${cond}` : Prisma.empty
}

export function buildByIpWhereSql(
  query?: string,
  attackType?: string,
  range?: string,
  sensorIds?: string[],
): Prisma.Sql {
  const clauses: Prisma.Sql[] = [Prisma.sql`1 = 1`]
  if (query?.trim()) {
    const wildcard = /^[0-9a-fA-F:.]+$/.test(query) ? `${query}%` : `%${query}%`
    clauses.push(Prisma.sql`src_ip ILIKE ${wildcard}`)
  }
  if (attackType?.trim()) {
    clauses.push(Prisma.sql`attack_type = ${attackType}`)
  }
  const interval = rangeToInterval(range)
  if (interval) {
    clauses.push(Prisma.sql`timestamp >= NOW() - ${interval}::interval`)
  }
  const sensorCond = sensorCondition(sensorIds)
  if (sensorCond) clauses.push(sensorCond)
  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`
}

export function buildWebHitsWhereSql(params: { attackType?: string; srcIp?: string; sensorIds?: string[] }): Prisma.Sql {
  const clauses: Prisma.Sql[] = [Prisma.sql`1 = 1`]
  if (params.attackType) clauses.push(Prisma.sql`attack_type = ${params.attackType}`)
  if (params.srcIp) clauses.push(Prisma.sql`src_ip = ${params.srcIp}`)
  const sensorCond = sensorCondition(params.sensorIds)
  if (sensorCond) clauses.push(sensorCond)
  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`
}

export function buildSortSql(sortBy: 'totalHits' | 'lastSeen' | 'firstSeen'): Prisma.Sql {
  if (sortBy === 'lastSeen') return Prisma.sql`last_seen`
  if (sortBy === 'firstSeen') return Prisma.sql`first_seen`
  return Prisma.sql`total_hits`
}

export function buildBurstSortSql(sortBy: BurstSortBy): Prisma.Sql {
  switch (sortBy) {
    case 'hits':        return Prisma.sql`COUNT(*)`
    case 'durationSec': return Prisma.sql`GREATEST(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))), 0)`
    case 'intensity':   return Prisma.sql`COUNT(*)::numeric / GREATEST(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))), 1)`
    default:            return Prisma.sql`MIN(timestamp)`
  }
}

const BOT_USER_AGENT_PATTERN =
  'sqlmap|nikto|nmap|masscan|zgrab|nuclei|dirbuster|gobuster|wfuzz|hydra|medusa|burpsuite|metasploit|acunetix|nessus|openvas|shodan|censys|curl/|python-requests|go-http-client|libwww-perl|scrapy'

type InsertedWebHit = { id: string; attack_type: string }

export class WebRepository {
  constructor(private prisma: PrismaClient) {}

  async insertWebHit(
    d: WebHit & { headers: Record<string, string> },
    sensorId: string | null,
  ): Promise<InsertedWebHit | null> {
    const pathsJson = d.pathsVisited?.length ? JSON.stringify(d.pathsVisited) : null
    const chainJson = d.attackTypes?.length   ? JSON.stringify(d.attackTypes)  : null

    const rows = await this.prisma.$queryRaw<InsertedWebHit[]>`
      INSERT INTO web_hits (
        id, event_id, src_ip, sensor_id, method, path, query,
        user_agent, headers, body, attack_type, canary_triggered, timestamp,
        session_hits, session_elapsed_s, paths_visited, attack_chain,
        is_chain_attack, client_fingerprint, canary_token_type, referer, http_version
      )
      VALUES (
        gen_random_uuid()::text,
        ${d.eventId}, ${d.srcIp}, ${sensorId}, ${d.method}, ${d.path}, ${d.query},
        ${d.userAgent},
        CAST(${JSON.stringify(d.headers)} AS jsonb),
        ${d.body}, ${d.attackType}, ${d.canaryTriggered},
        ${new Date(d.timestamp)},
        ${d.sessionHits ?? null},
        ${d.sessionElapsedS ?? null},
        ${pathsJson ? Prisma.sql`ARRAY(SELECT jsonb_array_elements_text(${pathsJson}::jsonb))` : Prisma.sql`NULL`},
        ${chainJson ? Prisma.sql`ARRAY(SELECT jsonb_array_elements_text(${chainJson}::jsonb))` : Prisma.sql`NULL`},
        ${d.isChainAttack ?? null},
        ${d.clientFingerprint ?? null},
        ${d.canaryTokenType ?? null},
        ${d.referer ?? null},
        ${d.httpVersion ?? null}
      )
      ON CONFLICT (event_id) DO NOTHING
      RETURNING id, attack_type
    `
    return rows[0] ?? null
  }

  async listHits(whereSql: Prisma.Sql, limit: number, offset: number): Promise<{ total: number; hits: WebHitRow[] }> {
    const [countRows, hits] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM web_hits ${whereSql}`,
      this.prisma.$queryRaw<WebHitRow[]>`
        SELECT id, src_ip AS "srcIp", method, path, query, user_agent AS "userAgent",
          attack_type AS "attackType", canary_triggered AS "canaryTriggered",
          body, headers, timestamp,
          headers->>'x-galah-result' AS "galahResult",
          headers->>'x-galah-error-type' AS "galahErrorType",
          session_hits AS "sessionHits", session_elapsed_s AS "sessionElapsedS",
          paths_visited AS "pathsVisited", attack_chain AS "attackChain",
          is_chain_attack AS "isChainAttack", client_fingerprint AS "clientFingerprint",
          canary_token_type AS "canaryTokenType", referer, http_version AS "httpVersion",
          FALSE AS "isBot"
        FROM web_hits ${whereSql}
        ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}
      `,
    ])
    return { total: countRows[0]?.total ?? 0, hits }
  }

  async getTimeline(sensorIds?: string[]): Promise<{ days: Array<{ day: string } & Record<string, string | number>>; attackTypes: string[] }> {
    const rows = await this.prisma.$queryRaw<Array<{ isoDay: string; attack_type: string; count: bigint }>>`
      SELECT
        TO_CHAR(DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "isoDay",
        attack_type, COUNT(*) AS count
      FROM web_hits
      WHERE timestamp >= NOW() - INTERVAL '30 days' ${andSensor(sensorIds)}
      GROUP BY 1, 2 ORDER BY 1, 2
    `

    const dayMap = new Map<string, Record<string, number>>()
    for (const row of rows) {
      if (!dayMap.has(row.isoDay)) dayMap.set(row.isoDay, {})
      dayMap.get(row.isoDay)![row.attack_type] = Number(row.count)
    }

    type WebTimelineDay = { day: string } & Record<string, string | number>
    const attackTypes = [...new Set(rows.map((r) => r.attack_type))]
    const days: WebTimelineDay[] = []
    const now = new Date()
    for (let i = 30; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const isoDay = d.toISOString().slice(0, 10)
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
      days.push({ day: label, ...(dayMap.get(isoDay) ?? {}) })
    }

    return { days, attackTypes }
  }

  async getPaths(sensorIds?: string[]): Promise<{ paths: Array<{ path: string; total: number; byType: Record<string, number> }> }> {
    const rows = await this.prisma.$queryRaw<Array<{ path: string; attack_type: string; count: bigint }>>`
      SELECT path, attack_type, COUNT(*) AS count
      FROM web_hits
      WHERE timestamp >= NOW() - INTERVAL '30 days' ${andSensor(sensorIds)}
      GROUP BY path, attack_type
      ORDER BY COUNT(*) DESC LIMIT 200
    `
    const pathMap = new Map<string, { total: number; byType: Record<string, number> }>()
    for (const row of rows) {
      if (!pathMap.has(row.path)) pathMap.set(row.path, { total: 0, byType: {} })
      const entry = pathMap.get(row.path)!
      entry.byType[row.attack_type] = Number(row.count)
      entry.total += Number(row.count)
    }
    const paths = Array.from(pathMap.entries())
      .map(([path, data]) => ({ path, total: data.total, byType: data.byType }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 50)
    return { paths }
  }

  async getStats(windowSql: Prisma.Sql): Promise<{
    total: number
    byAttackType: Array<{ attackType: string; count: number }>
    topIps: Array<{ srcIp: string; count: number }>
  }> {
    const [attackTypeRows, topIpRows, totalRows] = await Promise.all([
      this.prisma.$queryRaw<AttackTypeStatRow[]>`
        SELECT attack_type, COUNT(*)::int AS count FROM web_hits
        ${windowSql}
        GROUP BY attack_type ORDER BY count DESC
      `,
      this.prisma.$queryRaw<IpStatRow[]>`
        SELECT src_ip, COUNT(*)::int AS count FROM web_hits
        ${windowSql}
        GROUP BY src_ip ORDER BY count DESC LIMIT 10
      `,
      this.prisma.$queryRaw<Array<{ total: number }>>`SELECT COUNT(*)::int AS total FROM web_hits ${windowSql}`,
    ])
    return {
      total: totalRows[0]?.total ?? 0,
      byAttackType: attackTypeRows.map((r) => ({ attackType: r.attack_type, count: r.count })),
      topIps: topIpRows.map((r) => ({ srcIp: r.src_ip, count: r.count })),
    }
  }

  async getHourly(windowSql: Prisma.Sql): Promise<{ cells: Array<{ day: string; hour: number; count: number }> }> {
    const rows = await this.prisma.$queryRaw<Array<{ day: string; hour: number; count: number }>>`
      SELECT TO_CHAR(DATE_TRUNC('day', timestamp AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
        EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC')::int AS hour,
        COUNT(*)::int AS count
      FROM web_hits ${windowSql}
      GROUP BY 1, 2 ORDER BY 1, 2
    `
    return { cells: rows }
  }

  async countWebHitsByIp(whereSql: Prisma.Sql): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ total: number }>>`
      SELECT COUNT(*)::int AS total
      FROM (SELECT src_ip FROM web_hits ${whereSql} GROUP BY src_ip) grouped_hits
    `
    return rows[0]?.total ?? 0
  }

  async queryWebHitsByIp(
    whereSql: Prisma.Sql,
    orderCol: Prisma.Sql,
    orderDir: Prisma.Sql,
    pageSize: number,
    offset: number,
  ): Promise<WebHitsByIpRow[]> {
    return this.prisma.$queryRaw<WebHitsByIpRow[]>`
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
    `
  }

  async queryWebBursts(
    whereSql: Prisma.Sql,
    gapMinutes: number,
    orderCol: Prisma.Sql,
    orderDir: Prisma.Sql,
    limit: number,
    offset: number,
  ): Promise<WebBurstRow[]> {
    return this.prisma.$queryRaw<WebBurstRow[]>`
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
    `
  }

  async countWebBursts(whereSql: Prisma.Sql, gapMinutes: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ total: number }>>`
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
    `
    return rows[0]?.total ?? 0
  }

  async queryWebSessions(
    whereSql: Prisma.Sql,
    onlyChains: boolean,
    pageSize: number,
    offset: number,
  ): Promise<WebSessionRow[]> {
    const chainFilter = onlyChains ? Prisma.sql`AND is_chain_attack = true` : Prisma.sql``
    return this.prisma.$queryRaw<WebSessionRow[]>`
      SELECT
        COALESCE(client_fingerprint, src_ip)  AS client_fingerprint,
        ARRAY_AGG(DISTINCT src_ip)            AS src_ips,
        COUNT(*)::int                         AS total_hits,
        MIN(timestamp)                        AS first_seen,
        MAX(timestamp)                        AS last_seen,
        COUNT(*) FILTER (WHERE is_chain_attack)::int  AS chain_hits,
        COUNT(*) FILTER (WHERE canary_triggered)::int AS canary_hits,
        ARRAY_AGG(DISTINCT attack_type)       AS attack_types,
        (ARRAY_AGG(path ORDER BY timestamp DESC))[1:5] AS top_paths,
        (COUNT(DISTINCT src_ip) > 1)         AS is_multi_ip
      FROM web_hits
      ${whereSql}
      ${chainFilter}
      GROUP BY COALESCE(client_fingerprint, src_ip)
      ORDER BY last_seen DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `
  }

  async countWebSessions(whereSql: Prisma.Sql, onlyChains: boolean): Promise<number> {
    const chainFilter = onlyChains ? Prisma.sql`AND is_chain_attack = true` : Prisma.sql``
    const rows = await this.prisma.$queryRaw<Array<{ total: number }>>`
      SELECT COUNT(DISTINCT COALESCE(client_fingerprint, src_ip))::int AS total
      FROM web_hits
      ${whereSql}
      ${chainFilter}
    `
    return rows[0]?.total ?? 0
  }

  async querySessionHits(fingerprint: string, limit: number, sensorIds?: string[]): Promise<WebHitRow[]> {
    return this.prisma.$queryRaw<WebHitRow[]>`
      SELECT id, src_ip AS "srcIp", method, path, query,
        user_agent AS "userAgent", attack_type AS "attackType",
        canary_triggered AS "canaryTriggered", body, headers, timestamp,
        headers->>'x-galah-result'     AS "galahResult",
        headers->>'x-galah-error-type' AS "galahErrorType",
        session_hits AS "sessionHits", session_elapsed_s AS "sessionElapsedS",
        paths_visited AS "pathsVisited", attack_chain AS "attackChain",
        is_chain_attack AS "isChainAttack", client_fingerprint AS "clientFingerprint",
        canary_token_type AS "canaryTokenType", referer, http_version AS "httpVersion"
      FROM web_hits
      WHERE COALESCE(client_fingerprint, src_ip) = ${fingerprint} ${andSensor(sensorIds)}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `
  }
}

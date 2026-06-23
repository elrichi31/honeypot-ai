import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'

export type ClientRow = {
  id: string; name: string; slug: string; code: string; description: string
  forward_url: string; crowdstrike_hec_url: string; crowdstrike_api_key: string; created_at: Date
}

export type LogRow = {
  id: string; source: string; protocol: string; src_ip: string; event_type: string
  ts: Date; message: string | null; command: string | null; username: string | null
  password: string | null; session_id: string | null; extra: string | null
}

export type ThreatRow = {
  src_ip: string; total_events: bigint; sources: string; last_seen: Date
  login_successes: bigint; protocols: string
}

export type BucketRow  = { bucket: Date; protocol: string; count: bigint }
export type MetricsRow = { total_events: number; unique_ips: number; login_successes: number }

export class ClientRepository {
  constructor(private prisma: PrismaClient) {}

  async list(): Promise<ClientRow[]> {
    return this.prisma.$queryRaw<ClientRow[]>`
      SELECT id, name, slug, code, description, forward_url, crowdstrike_hec_url, crowdstrike_api_key, created_at
      FROM clients ORDER BY name ASC, created_at ASC
    `
  }

  async findById(id: string): Promise<ClientRow | null> {
    const rows = await this.prisma.$queryRaw<ClientRow[]>`
      SELECT id, name, slug, code, description, forward_url, crowdstrike_hec_url, crowdstrike_api_key, created_at
      FROM clients WHERE id = ${id} LIMIT 1
    `
    return rows[0] ?? null
  }

  async findByIdExists(id: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM clients WHERE id = ${id} LIMIT 1
    `
    return !!rows[0]
  }

  async upsert(args: {
    name: string; slug: string; code: string; description: string
    forwardUrl: string; crowdstrikeHecUrl: string; crowdstrikeApiKey: string
  }): Promise<ClientRow> {
    const { name, slug, code, description, forwardUrl, crowdstrikeHecUrl, crowdstrikeApiKey } = args
    const rows = await this.prisma.$queryRaw<ClientRow[]>`
      INSERT INTO clients (id, name, slug, code, description, forward_url, crowdstrike_hec_url, crowdstrike_api_key, created_at)
      VALUES (gen_random_uuid()::text, ${name}, ${slug}, ${code}, ${description}, ${forwardUrl}, ${crowdstrikeHecUrl}, ${crowdstrikeApiKey}, ${new Date()})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name, code = EXCLUDED.code,
        description = EXCLUDED.description, forward_url = EXCLUDED.forward_url,
        crowdstrike_hec_url = EXCLUDED.crowdstrike_hec_url, crowdstrike_api_key = EXCLUDED.crowdstrike_api_key
      RETURNING id, name, slug, code, description, forward_url, crowdstrike_hec_url, crowdstrike_api_key, created_at
    `
    return rows[0]
  }

  async update(id: string, args: {
    name: string; code: string; description: string
    forwardUrl: string; crowdstrikeHecUrl: string; crowdstrikeApiKey: string
  }): Promise<ClientRow | null> {
    const { name, code, description, forwardUrl, crowdstrikeHecUrl, crowdstrikeApiKey } = args
    const rows = await this.prisma.$queryRaw<ClientRow[]>`
      UPDATE clients SET name = ${name}, code = ${code},
        description = ${description}, forward_url = ${forwardUrl},
        crowdstrike_hec_url = ${crowdstrikeHecUrl}, crowdstrike_api_key = ${crowdstrikeApiKey}
      WHERE id = ${id}
      RETURNING id, name, slug, code, description, forward_url, crowdstrike_hec_url, crowdstrike_api_key, created_at
    `
    return rows[0] ?? null
  }

  async delete(id: string): Promise<void> {
    await this.prisma.$executeRaw`UPDATE sensors SET client_id = NULL WHERE client_id = ${id}`
    await this.prisma.$executeRaw`DELETE FROM clients WHERE id = ${id}`
  }

  async getEventLog(args: {
    sids: ReturnType<typeof Prisma.join>
    wantSsh: boolean; wantProtocol: boolean; wantWeb: boolean
    ipCond: Prisma.Sql; qCond: Prisma.Sql
    hasFilters: boolean; pageSize: number; offset: number; perBranch: number
    prismaRead: PrismaClient
  }): Promise<LogRow[]> {
    const { sids, wantSsh, wantProtocol, wantWeb, ipCond, qCond, hasFilters, pageSize, offset, perBranch, prismaRead } = args
    if (hasFilters) {
      return prismaRead.$queryRaw<LogRow[]>`
        SELECT id, source, protocol, src_ip, event_type, ts, message, command, username, password, session_id, extra
        FROM (
          SELECT e.id::text, 'ssh'::text AS source, 'ssh'::text AS protocol, e.src_ip, e.event_type,
                 e.event_ts AS ts, e.message, e.command, e.username, e.password,
                 e.session_id::text AS session_id, e.normalized_json::text AS extra
          FROM events e JOIN sessions s ON s.id = e.session_id
          WHERE s.sensor_id IN (${sids}) AND ${wantSsh}
          UNION ALL
          SELECT ph.id::text, 'protocol'::text, ph.protocol, ph.src_ip, ph.event_type,
                 ph.timestamp, NULL::text, (ph.data->>'command'), ph.username, ph.password,
                 NULL::text, ph.data::text
          FROM protocol_hits ph WHERE ph.sensor_id IN (${sids}) AND ${wantProtocol}
          UNION ALL
          SELECT wh.id::text, 'web'::text, 'http'::text, wh.src_ip, wh.attack_type,
                 wh.timestamp, NULL::text, wh.path, NULL::text, NULL::text, NULL::text,
                 json_build_object('method',wh.method,'path',wh.path,'query',wh.query,'userAgent',wh.user_agent,'attackType',wh.attack_type)::text
          FROM web_hits wh WHERE wh.sensor_id IN (${sids}) AND ${wantWeb}
        ) AS combined
        WHERE 1=1 ${ipCond} ${qCond}
        ORDER BY ts DESC LIMIT ${pageSize} OFFSET ${offset}
      `
    }
    return prismaRead.$queryRaw<LogRow[]>`
      SELECT id, source, protocol, src_ip, event_type, ts, message, command, username, password, session_id, extra
      FROM (
        (SELECT e.id::text, 'ssh'::text AS source, 'ssh'::text AS protocol, e.src_ip, e.event_type,
               e.event_ts AS ts, e.message, e.command, e.username, e.password,
               e.session_id::text AS session_id, e.normalized_json::text AS extra
         FROM events e JOIN sessions s ON s.id = e.session_id
         WHERE s.sensor_id IN (${sids}) AND ${wantSsh}
         ORDER BY e.event_ts DESC LIMIT ${perBranch})
        UNION ALL
        (SELECT ph.id::text, 'protocol'::text, ph.protocol, ph.src_ip, ph.event_type,
               ph.timestamp, NULL::text, (ph.data->>'command'), ph.username, ph.password,
               NULL::text, ph.data::text
         FROM protocol_hits ph WHERE ph.sensor_id IN (${sids}) AND ${wantProtocol}
         ORDER BY ph.timestamp DESC LIMIT ${perBranch})
        UNION ALL
        (SELECT wh.id::text, 'web'::text, 'http'::text, wh.src_ip, wh.attack_type,
               wh.timestamp, NULL::text, wh.path, NULL::text, NULL::text, NULL::text,
               json_build_object('method',wh.method,'path',wh.path,'query',wh.query,'userAgent',wh.user_agent,'attackType',wh.attack_type)::text
         FROM web_hits wh WHERE wh.sensor_id IN (${sids}) AND ${wantWeb}
         ORDER BY wh.timestamp DESC LIMIT ${perBranch})
      ) AS combined
      ORDER BY ts DESC LIMIT ${pageSize} OFFSET ${offset}
    `
  }

  async getEventLogCount(args: {
    sids: ReturnType<typeof Prisma.join>
    wantSsh: boolean; wantProtocol: boolean; wantWeb: boolean
    ipCond: Prisma.Sql; qCond: Prisma.Sql
    prismaRead: PrismaClient
  }): Promise<number> {
    const { sids, wantSsh, wantProtocol, wantWeb, ipCond, qCond, prismaRead } = args
    const rows = await prismaRead.$queryRaw<[{ total: bigint }]>`
      SELECT COUNT(*) AS total FROM (
        SELECT e.src_ip, e.event_type, e.username, e.command FROM events e
        JOIN sessions s ON s.id = e.session_id
        WHERE s.sensor_id IN (${sids}) AND ${wantSsh}
        UNION ALL
        SELECT ph.src_ip, ph.event_type, ph.username, (ph.data->>'command') FROM protocol_hits ph
        WHERE ph.sensor_id IN (${sids}) AND ${wantProtocol}
        UNION ALL
        SELECT wh.src_ip, wh.attack_type, NULL, wh.path FROM web_hits wh
        WHERE wh.sensor_id IN (${sids}) AND ${wantWeb}
      ) AS t WHERE 1=1 ${ipCond} ${qCond}
    `
    return Number(rows[0]?.total ?? 0)
  }

  async getTimeline(args: {
    sids: ReturnType<typeof Prisma.join>
    bucketUnit: string; intervalSql: string
    prismaRead: PrismaClient
  }): Promise<BucketRow[]> {
    const { sids, bucketUnit, intervalSql, prismaRead } = args
    return prismaRead.$queryRaw<BucketRow[]>`
      SELECT bucket, protocol, SUM(count) AS count
      FROM (
        SELECT date_trunc(${bucketUnit}, e.event_ts) AS bucket, 'ssh'::text AS protocol, COUNT(*) AS count
        FROM events e JOIN sessions s ON s.id = e.session_id
        WHERE s.sensor_id IN (${sids}) AND e.event_ts >= NOW() - ${intervalSql}::interval
        GROUP BY 1
        UNION ALL
        SELECT date_trunc(${bucketUnit}, ph.timestamp), ph.protocol, COUNT(*)
        FROM protocol_hits ph
        WHERE ph.sensor_id IN (${sids}) AND ph.timestamp >= NOW() - ${intervalSql}::interval
        GROUP BY 1, 2
        UNION ALL
        SELECT date_trunc(${bucketUnit}, wh.timestamp), 'http'::text, COUNT(*)
        FROM web_hits wh
        WHERE wh.sensor_id IN (${sids}) AND wh.timestamp >= NOW() - ${intervalSql}::interval
        GROUP BY 1
      ) AS combined
      GROUP BY bucket, protocol ORDER BY bucket ASC
    `
  }

  async getThreats(args: {
    sids: ReturnType<typeof Prisma.join>
    since: Date; pageSize: number; offset: number
    prismaRead: PrismaClient
  }): Promise<{ rows: ThreatRow[]; total: number }> {
    const { sids, since, pageSize, offset, prismaRead } = args
    const [rows, countRows] = await Promise.all([
      prismaRead.$queryRaw<ThreatRow[]>`
        SELECT src_ip, COUNT(*) AS total_events, STRING_AGG(DISTINCT source, ',') AS sources,
               MAX(ts) AS last_seen, COUNT(*) FILTER (WHERE login_success) AS login_successes,
               STRING_AGG(DISTINCT protocol, ',') AS protocols
        FROM (
          SELECT s.src_ip, 'ssh' AS source, 'ssh' AS protocol,
                 COALESCE(s.ended_at, s.started_at) AS ts, COALESCE(s.login_success, false) AS login_success
          FROM sessions s WHERE s.sensor_id IN (${sids}) AND s.started_at >= ${since}
          UNION ALL
          SELECT ph.src_ip, 'protocol', ph.protocol, ph.timestamp, false
          FROM protocol_hits ph WHERE ph.sensor_id IN (${sids}) AND ph.timestamp >= ${since}
          UNION ALL
          SELECT wh.src_ip, 'web', 'http', wh.timestamp, false
          FROM web_hits wh WHERE wh.sensor_id IN (${sids}) AND wh.timestamp >= ${since}
        ) AS combined
        GROUP BY src_ip ORDER BY login_successes DESC, last_seen DESC, total_events DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      prismaRead.$queryRaw<[{ total: bigint }]>`
        SELECT COUNT(DISTINCT src_ip) AS total FROM (
          SELECT src_ip FROM sessions WHERE sensor_id IN (${sids}) AND started_at >= ${since}
          UNION ALL SELECT src_ip FROM protocol_hits WHERE sensor_id IN (${sids}) AND timestamp >= ${since}
          UNION ALL SELECT src_ip FROM web_hits WHERE sensor_id IN (${sids}) AND timestamp >= ${since}
        ) AS ips
      `,
    ])
    return { rows, total: Number(countRows[0]?.total ?? 0) }
  }

  async getToday(args: {
    sids: ReturnType<typeof Prisma.join>
    todayStart: Date; prismaRead: PrismaClient
  }): Promise<{ metrics: MetricsRow; topProtocol: string | null }> {
    const { sids, todayStart, prismaRead } = args
    const [metricsRows, protoRows] = await Promise.all([
      prismaRead.$queryRaw<MetricsRow[]>`
        SELECT COUNT(*)::int AS total_events, COUNT(DISTINCT src_ip)::int AS unique_ips,
               COUNT(*) FILTER (WHERE login_success)::int AS login_successes
        FROM (
          SELECT s.src_ip, COALESCE(s.login_success, false) AS login_success
          FROM sessions s WHERE s.sensor_id IN (${sids}) AND s.started_at >= ${todayStart}
          UNION ALL
          SELECT ph.src_ip, false FROM protocol_hits ph
          WHERE ph.sensor_id IN (${sids}) AND ph.timestamp >= ${todayStart}
          UNION ALL
          SELECT wh.src_ip, false FROM web_hits wh
          WHERE wh.sensor_id IN (${sids}) AND wh.timestamp >= ${todayStart}
        ) AS t
      `,
      prismaRead.$queryRaw<[{ protocol: string }]>`
        SELECT protocol FROM (
          SELECT 'ssh' AS protocol FROM sessions WHERE sensor_id IN (${sids}) AND started_at >= ${todayStart}
          UNION ALL SELECT protocol FROM protocol_hits WHERE sensor_id IN (${sids}) AND timestamp >= ${todayStart}
          UNION ALL SELECT 'http' AS protocol FROM web_hits WHERE sensor_id IN (${sids}) AND timestamp >= ${todayStart}
        ) AS p GROUP BY protocol ORDER BY COUNT(*) DESC LIMIT 1
      `,
    ])
    const m = metricsRows[0] ?? { total_events: 0, unique_ips: 0, login_successes: 0 }
    return { metrics: m, topProtocol: protoRows[0]?.protocol ?? null }
  }
}

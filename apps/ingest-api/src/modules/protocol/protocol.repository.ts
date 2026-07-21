import type { PrismaClient } from '@prisma/client'
import type { SensorScope } from '../../lib/sensor-scope.js'

export type HitRow = {
  id: string; protocol: string; src_ip: string; src_port: number | null
  dst_port: number; event_type: string; username: string | null
  password: string | null; data: unknown; timestamp: Date
}

export class ProtocolRepository {
  constructor(private prismaRead: PrismaClient) {}

  async list(protocol: string | null, limit: number, offset: number, scope: SensorScope): Promise<HitRow[]> {
    return this.prismaRead.$queryRaw<HitRow[]>`
      SELECT id, protocol, src_ip, src_port, dst_port, event_type, username, password, data, timestamp
      FROM protocol_hits
      WHERE (${protocol}::text IS NULL OR protocol = ${protocol}) ${scope.cond('sensor_id')}
      ORDER BY timestamp DESC
      LIMIT ${limit} OFFSET ${offset}
    `
  }

  async count(protocol: string | null, scope: SensorScope): Promise<number> {
    const rows = await this.prismaRead.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) FROM protocol_hits
      WHERE (${protocol}::text IS NULL OR protocol = ${protocol}) ${scope.cond('sensor_id')}
    `
    return Number(rows[0]?.count ?? 0)
  }

  async getInsights(protocol: string, isSmb: boolean, scope: SensorScope) {
    const s = scope.cond('sensor_id')
    const [totals, topIps, topPorts, topUsernames, topPasswords, topCommands, topServices, topDatabases, topDomains, topShares, topNativeOS, topNtlmHashes, eventBreakdown, topCredentials] = await Promise.all([
      this.prismaRead.$queryRaw<Array<{ total: number; unique_ips: number; auth_attempts: number; command_events: number; last_seen: Date | null }>>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(DISTINCT src_ip)::int AS unique_ips,
          COUNT(*) FILTER (WHERE event_type = 'auth')::int AS auth_attempts,
          COUNT(*) FILTER (WHERE event_type = 'command')::int AS command_events,
          MAX(timestamp) AS last_seen
        FROM protocol_hits WHERE protocol = ${protocol} ${s}
      `,
      this.prismaRead.$queryRaw<Array<{ src_ip: string; count: number; last_seen: Date }>>`
        SELECT src_ip, COUNT(*)::int AS count, MAX(timestamp) AS last_seen
        FROM protocol_hits WHERE protocol = ${protocol} ${s}
        GROUP BY src_ip ORDER BY count DESC, last_seen DESC LIMIT 10
      `,
      this.prismaRead.$queryRaw<Array<{ dst_port: number; count: number; last_seen: Date }>>`
        SELECT dst_port, COUNT(*)::int AS count, MAX(timestamp) AS last_seen
        FROM protocol_hits WHERE protocol = ${protocol} ${s}
        GROUP BY dst_port ORDER BY count DESC, last_seen DESC LIMIT 10
      `,
      this.prismaRead.$queryRaw<Array<{ username: string; count: number }>>`
        SELECT username, COUNT(*)::int AS count FROM protocol_hits
        WHERE protocol = ${protocol} AND username IS NOT NULL AND username <> '' ${s}
        GROUP BY username ORDER BY count DESC LIMIT 10
      `,
      this.prismaRead.$queryRaw<Array<{ password: string; count: number }>>`
        SELECT password, COUNT(*)::int AS count FROM protocol_hits
        WHERE protocol = ${protocol} AND password IS NOT NULL AND password <> '' ${s}
        GROUP BY password ORDER BY count DESC LIMIT 10
      `,
      this.prismaRead.$queryRaw<Array<{ command: string; count: number }>>`
        SELECT data->>'command' AS command, COUNT(*)::int AS count FROM protocol_hits
        WHERE protocol = ${protocol} AND data ? 'command' AND data->>'command' <> '' ${s}
        GROUP BY data->>'command' ORDER BY count DESC LIMIT 10
      `,
      this.prismaRead.$queryRaw<Array<{ service: string; count: number }>>`
        SELECT data->>'service' AS service, COUNT(*)::int AS count FROM protocol_hits
        WHERE protocol = ${protocol} AND data ? 'service' AND data->>'service' <> '' ${s}
        GROUP BY data->>'service' ORDER BY count DESC LIMIT 10
      `,
      this.prismaRead.$queryRaw<Array<{ database: string; count: number }>>`
        SELECT data->>'database' AS database, COUNT(*)::int AS count FROM protocol_hits
        WHERE protocol = ${protocol} AND data ? 'database' AND data->>'database' <> '' ${s}
        GROUP BY data->>'database' ORDER BY count DESC LIMIT 10
      `,
      isSmb
        ? this.prismaRead.$queryRaw<Array<{ domain: string; count: number }>>`
            SELECT data->>'domain' AS domain, COUNT(*)::int AS count FROM protocol_hits
            WHERE protocol = 'smb' AND data->>'domain' IS NOT NULL AND data->>'domain' <> '' ${s}
            GROUP BY data->>'domain' ORDER BY count DESC LIMIT 10
          `
        : Promise.resolve([]),
      isSmb
        ? this.prismaRead.$queryRaw<Array<{ share: string; count: number }>>`
            SELECT COALESCE(data->>'shareName', data->>'share') AS share, COUNT(*)::int AS count FROM protocol_hits
            WHERE protocol = 'smb'
              AND COALESCE(data->>'shareName', data->>'share') IS NOT NULL
              AND COALESCE(data->>'shareName', data->>'share') <> '' ${s}
            GROUP BY COALESCE(data->>'shareName', data->>'share')
            ORDER BY count DESC LIMIT 10
          `
        : Promise.resolve([]),
      isSmb
        ? this.prismaRead.$queryRaw<Array<{ native_os: string; count: number }>>`
            SELECT COALESCE(data->>'hostName', data->>'nativeOS') AS native_os, COUNT(*)::int AS count FROM protocol_hits
            WHERE protocol = 'smb'
              AND COALESCE(data->>'hostName', data->>'nativeOS') IS NOT NULL
              AND COALESCE(data->>'hostName', data->>'nativeOS') <> '' ${s}
            GROUP BY COALESCE(data->>'hostName', data->>'nativeOS')
            ORDER BY count DESC LIMIT 10
          `
        : Promise.resolve([]),
      isSmb
        ? this.prismaRead.$queryRaw<Array<{ ntlm_hash: string; username: string; count: number }>>`
            SELECT LEFT(data->>'ntlmHash', 32) AS ntlm_hash, username, COUNT(*)::int AS count
            FROM protocol_hits
            WHERE protocol = 'smb' AND data->>'ntlmHash' IS NOT NULL AND data->>'ntlmHash' <> '' ${s}
            GROUP BY LEFT(data->>'ntlmHash', 32), username ORDER BY count DESC LIMIT 10
          `
        : Promise.resolve([]),
      this.prismaRead.$queryRaw<Array<{ event_type: string; count: number }>>`
        SELECT event_type, COUNT(*)::int AS count FROM protocol_hits
        WHERE protocol = ${protocol} ${s}
        GROUP BY event_type ORDER BY count DESC
      `,
      this.prismaRead.$queryRaw<Array<{ username: string; password: string; count: number }>>`
        SELECT username, password, COUNT(*)::int AS count FROM protocol_hits
        WHERE protocol = ${protocol} AND event_type = 'auth'
          AND username IS NOT NULL AND password IS NOT NULL AND password <> '' ${s}
        GROUP BY username, password ORDER BY count DESC LIMIT 12
      `,
    ])
    return { totals, topIps, topPorts, topUsernames, topPasswords, topCommands, topServices, topDatabases, topDomains, topShares, topNativeOS, topNtlmHashes, eventBreakdown, topCredentials }
  }

  async getStats(scope: SensorScope): Promise<Array<{ protocol: string; count: bigint; last_seen: Date; auth_attempts: bigint }>> {
    return this.prismaRead.$queryRaw`
      SELECT protocol, COUNT(*) AS count, MAX(timestamp) AS last_seen,
             COUNT(*) FILTER (WHERE event_type = 'auth') AS auth_attempts
      FROM protocol_hits
      WHERE timestamp >= NOW() - INTERVAL '30 days' ${scope.cond('sensor_id')}
      GROUP BY protocol ORDER BY count DESC
    `
  }

  async getPortStats(scope: SensorScope): Promise<Array<{ protocol: string; dst_port: number; count: bigint; last_seen: Date; auth_attempts: bigint }>> {
    return this.prismaRead.$queryRaw`
      SELECT protocol, dst_port, COUNT(*) AS count, MAX(timestamp) AS last_seen,
             COUNT(*) FILTER (WHERE event_type = 'auth') AS auth_attempts
      FROM protocol_hits
      WHERE timestamp >= NOW() - INTERVAL '30 days' ${scope.cond('sensor_id')}
      GROUP BY protocol, dst_port ORDER BY count DESC, last_seen DESC LIMIT 50
    `
  }
}

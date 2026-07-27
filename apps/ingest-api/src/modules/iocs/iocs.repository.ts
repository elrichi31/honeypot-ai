import { Prisma, type PrismaClient } from '@prisma/client'
import type { SensorScope } from '../../lib/sensor-scope.js'

export const IOCS_WINDOW_DAYS = 90

function cutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

export type IocCommandRow = {
  src_ip: string
  command: string
  event_ts: Date
}

export type IocCredentialRow = {
  username: string
  password: string
  attempts: bigint
  unique_ips: bigint
  first_seen: Date
}

export type IocHasshRow = {
  hassh: string
  sessions: bigint
  unique_ips: bigint
  first_seen: Date
  sample_client: string | null
}

export class IocsRepository {
  constructor(private prismaRead: PrismaClient) {}

  /**
   * Commands (global, all sessions) that can carry an actionable IoC. Pre-filtered
   * in SQL to the handful of shapes the extractor understands — C2 URLs, raw-socket
   * reverse shells, printf Host: headers, planted SSH keys — so the `events` scan
   * stays bounded instead of pulling every shell command in the window.
   */
  async queryCommandRowsForIocs(windowDays = IOCS_WINDOW_DAYS, scope?: SensorScope): Promise<IocCommandRow[]> {
    // events have no sensor_id — scope through the owning session's sensor.
    const scoped = scope && !scope.all
    const scopeJoin = scoped ? Prisma.sql`JOIN sessions s ON s.id = e.session_id` : Prisma.empty
    const scopeClause = scoped ? scope.cond('s.sensor_id') : Prisma.empty
    return this.prismaRead.$queryRaw<IocCommandRow[]>`
      SELECT DISTINCT ON (e.src_ip, e.command)
        e.src_ip, e.command, e.event_ts
      FROM events e
      ${scopeJoin}
      WHERE e.event_type IN ('command.input', 'file.download')
        AND e.command IS NOT NULL
        AND e.event_ts >= ${cutoff(windowDays)}
        ${scopeClause}
        AND (
          e.command ILIKE '%authorized_keys%'
          OR e.command ~ '/dev/tcp/'
          OR e.command ILIKE '%http://%'
          OR e.command ILIKE '%https://%'
          OR e.command ~* 'Host:'
        )
      ORDER BY e.src_ip, e.command, e.event_ts ASC
      LIMIT 20000
    `
  }

  /** Distinct credential pairs attempted in the window — an attacker wordlist IoC. */
  async queryCredentials(windowDays = IOCS_WINDOW_DAYS, scope?: SensorScope): Promise<IocCredentialRow[]> {
    const scopeClause = scope && !scope.all ? scope.cond('sensor_id') : Prisma.empty
    return this.prismaRead.$queryRaw<IocCredentialRow[]>`
      SELECT username, password,
             COUNT(*)::bigint AS attempts,
             COUNT(DISTINCT src_ip)::bigint AS unique_ips,
             MIN(started_at) AS first_seen
      FROM sessions
      WHERE started_at >= ${cutoff(windowDays)}
        AND username IS NOT NULL AND username <> ''
        AND password IS NOT NULL AND password <> ''
        ${scopeClause}
      GROUP BY username, password
      ORDER BY attempts DESC
      LIMIT 5000
    `
  }

  /** Distinct SSH client fingerprints (HASSH) seen in the window. */
  async queryHasshFingerprints(windowDays = IOCS_WINDOW_DAYS, scope?: SensorScope): Promise<IocHasshRow[]> {
    const scopeClause = scope && !scope.all ? scope.cond('sensor_id') : Prisma.empty
    return this.prismaRead.$queryRaw<IocHasshRow[]>`
      SELECT hassh,
             COUNT(*)::bigint AS sessions,
             COUNT(DISTINCT src_ip)::bigint AS unique_ips,
             MIN(started_at) AS first_seen,
             (array_agg(client_version) FILTER (WHERE client_version IS NOT NULL))[1] AS sample_client
      FROM sessions
      WHERE started_at >= ${cutoff(windowDays)}
        AND hassh IS NOT NULL AND hassh <> ''
        ${scopeClause}
      GROUP BY hassh
      ORDER BY sessions DESC
      LIMIT 2000
    `
  }
}

import { Prisma } from '@prisma/client';

export type SessionSummaryRow = {
  total: number;
  compromised: number;
  blocked: number;
  scanGroups: number;
  bots: number;
  humans: number;
};

export type SessionListRow = {
  id: string;
  cowrieSessionId: string;
  srcIp: string;
  protocol: string;
  username: string | null;
  password: string | null;
  loginSuccess: boolean | null;
  hassh: string | null;
  clientVersion: string | null;
  startedAt: Date;
  endedAt: Date | null;
  sessionType: string;
  createdAt: Date;
  updatedAt: Date;
  eventCount: number;
  authAttemptCount: number;
  commandCount: number;
  threatTags: string[];
};

type SessionFilterParams = {
  q?: string;
  startDate?: string;
  endDate?: string;
  outcome?: 'all' | 'compromised' | 'blocked';
  actor?: 'all' | 'bot' | 'human' | 'unknown';
  // Per-client / per-sensor scope. `undefined` = no scope (all sensors); an empty
  // array = scope to nothing (unknown client / client with no sensors), which must
  // yield zero rows rather than silently falling through to the global view.
  sensorIds?: string[];
};

export function buildSessionClauses(params: SessionFilterParams): Prisma.Sql[] {
  const clauses: Prisma.Sql[] = [Prisma.sql`1 = 1`];
  const trimmedQuery = params.q?.trim();

  if (params.sensorIds) {
    clauses.push(
      params.sensorIds.length
        ? Prisma.sql`s.sensor_id IN (${Prisma.join(params.sensorIds)})`
        : Prisma.sql`false`,
    );
  }

  if (trimmedQuery) {
    const wildcard = `%${trimmedQuery}%`;
    const ipPrefix = /^[0-9a-fA-F:.]+$/.test(trimmedQuery) ? `${trimmedQuery}%` : wildcard;
    clauses.push(
      Prisma.sql`(
        s.src_ip ILIKE ${ipPrefix}
        OR COALESCE(s.username, '') ILIKE ${wildcard}
        OR COALESCE(s.password, '') ILIKE ${wildcard}
        OR COALESCE(s.client_version, '') ILIKE ${wildcard}
        OR COALESCE(s.hassh, '') ILIKE ${wildcard}
      )`,
    );
  }

  if (params.startDate) clauses.push(Prisma.sql`s.started_at >= ${new Date(params.startDate)}`);
  if (params.endDate) clauses.push(Prisma.sql`s.started_at <= ${new Date(params.endDate)}`);

  if (params.outcome === 'compromised') {
    clauses.push(Prisma.sql`s.login_success IS TRUE`);
  } else if (params.outcome === 'blocked') {
    clauses.push(Prisma.sql`s.login_success IS DISTINCT FROM TRUE`);
  }

  if (params.actor && params.actor !== 'all') {
    clauses.push(Prisma.sql`s.session_type = ${params.actor}`);
  }

  return clauses;
}

export function buildWhereSql(clauses: Prisma.Sql[]): Prisma.Sql {
  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
}

export function buildThreatTagsSql(): Prisma.Sql {
  return Prisma.sql`
    array_remove(ARRAY[
      CASE WHEN bool_or(e.command ILIKE '%authorized_keys%' AND (e.command ILIKE '%chattr%' OR e.command ILIKE '%ssh-rsa%' OR e.command ILIKE '%ssh-ed25519%')) THEN 'ssh_backdoor' END,
      CASE WHEN bool_or(e.command ILIKE '%D877F783D5D3EF8C%' OR e.command ILIKE '%TelegramDesktop/tdata%' OR e.command ILIKE '%ttyGSM%' OR e.command ILIKE '%/var/spool/sms%') THEN 'honeypot_evasion' END,
      CASE WHEN bool_or(e.command ILIKE '%/proc/1/mounts%' OR e.command ILIKE '%ls /proc/1/%') THEN 'container_escape' END,
      CASE WHEN bool_or(e.command ILIKE '%xmrig%' OR e.command ILIKE '%minerd%' OR e.command ILIKE '%pool.minexmr%' OR e.command ILIKE '%stratum+tcp%') THEN 'crypto_mining' END,
      CASE WHEN bool_or(e.command ILIKE '%wget http%' OR e.command ILIKE '%curl http%') AND bool_or(e.command ILIKE '%chmod +x%' OR e.command ILIKE '%/tmp/%') THEN 'malware_drop' END,
      CASE WHEN bool_or(e.command ILIKE '%crontab%' OR (e.command ILIKE '%authorized_keys%' AND e.command NOT ILIKE '%chattr%')) THEN 'persistence' END,
      CASE WHEN bool_or(e.command ILIKE '%cat /etc/passwd%' OR e.command ILIKE '%history -c%' OR e.command ILIKE '%rm -rf /var/log%') THEN 'data_exfil' END,
      CASE WHEN bool_or(e.command ILIKE '%jito%' OR e.command ILIKE '%firedancer%' OR e.command ILIKE '%shredstream%' OR e.command ILIKE '%solana-validator%' OR e.command ILIKE '%geyser%') THEN 'solana_targeting' END
    ], NULL)
  `;
}

export function sessionSelectFields(): Prisma.Sql {
  return Prisma.sql`
    s.id,
    s.cowrie_session_id AS "cowrieSessionId",
    s.src_ip AS "srcIp",
    s.protocol,
    s.username,
    s.password,
    s.login_success AS "loginSuccess",
    s.hassh,
    s.client_version AS "clientVersion",
    s.started_at AS "startedAt",
    s.ended_at AS "endedAt",
    s.session_type AS "sessionType",
    s.created_at AS "createdAt",
    s.updated_at AS "updatedAt"
  `;
}

export function summaryQuery(whereSql: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE s.login_success IS TRUE)::int AS compromised,
      COUNT(*) FILTER (WHERE s.login_success IS DISTINCT FROM TRUE)::int AS blocked,
      COUNT(DISTINCT s.src_ip) FILTER (WHERE s.login_success IS DISTINCT FROM TRUE)::int AS "scanGroups",
      COUNT(*) FILTER (WHERE s.session_type = 'bot')::int AS bots,
      COUNT(*) FILTER (WHERE s.session_type = 'human')::int AS humans
    FROM sessions s
    ${whereSql}
  `;
}

export function sessionListQuery(
  whereSql: Prisma.Sql,
  sortDir: 'asc' | 'desc',
  pageSize: number,
  offset: number,
): Prisma.Sql {
  const orderDir = sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const threatTagsSql = buildThreatTagsSql();
  return Prisma.sql`
    WITH paged_sessions AS (
      SELECT ${sessionSelectFields()}
      FROM sessions s
      ${whereSql}
      ORDER BY s.started_at ${orderDir}
      LIMIT ${pageSize}
      OFFSET ${offset}
    ),
    event_counts AS (
      SELECT
        e.session_id,
        COUNT(*)::int AS event_count,
        COUNT(*) FILTER (WHERE e.event_type IN ('auth.success', 'auth.failed'))::int AS auth_attempt_count,
        COUNT(*) FILTER (WHERE e.event_type = 'command.input')::int AS command_count
      FROM events e
      INNER JOIN paged_sessions ps ON ps.id = e.session_id
      GROUP BY e.session_id
    ),
    attack_tags AS (
      SELECT
        e.session_id,
        ${threatTagsSql} AS tags
      FROM events e
      INNER JOIN paged_sessions ps ON ps.id = e.session_id
      WHERE e.event_type = 'command.input'
      GROUP BY e.session_id
    )
    SELECT
      ps.*,
      COALESCE(ec.event_count, 0)::int AS "eventCount",
      COALESCE(ec.auth_attempt_count, 0)::int AS "authAttemptCount",
      COALESCE(ec.command_count, 0)::int AS "commandCount",
      COALESCE(at.tags, ARRAY[]::text[]) AS "threatTags"
    FROM paged_sessions ps
    LEFT JOIN event_counts ec ON ec.session_id = ps.id
    LEFT JOIN attack_tags at ON at.session_id = ps.id
    ORDER BY ps."startedAt" ${orderDir}
  `;
}

export function scanGroupListQuery(
  whereSql: Prisma.Sql,
  pageSize: number,
  offset: number,
): Prisma.Sql {
  return Prisma.sql`
    WITH filtered_scans AS (
      SELECT ${sessionSelectFields()}
      FROM sessions s
      ${whereSql}
    ),
    paged_groups AS (
      SELECT
        fs."srcIp",
        MAX(fs."startedAt") AS "lastSeen"
      FROM filtered_scans fs
      GROUP BY fs."srcIp"
      ORDER BY "lastSeen" DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    ),
    grouped_sessions AS (
      SELECT fs.*
      FROM filtered_scans fs
      INNER JOIN paged_groups pg ON pg."srcIp" = fs."srcIp"
    ),
    event_counts AS (
      SELECT
        e.session_id,
        COUNT(*)::int AS event_count,
        COUNT(*) FILTER (WHERE e.event_type IN ('auth.success', 'auth.failed'))::int AS auth_attempt_count,
        COUNT(*) FILTER (WHERE e.event_type = 'command.input')::int AS command_count
      FROM events e
      INNER JOIN grouped_sessions gs ON gs.id = e.session_id
      GROUP BY e.session_id
    )
    SELECT
      gs.*,
      COALESCE(ec.event_count, 0)::int AS "eventCount",
      COALESCE(ec.auth_attempt_count, 0)::int AS "authAttemptCount",
      COALESCE(ec.command_count, 0)::int AS "commandCount",
      COALESCE(ARRAY[]::text[], ARRAY[]::text[]) AS "threatTags"
    FROM grouped_sessions gs
    LEFT JOIN event_counts ec ON ec.session_id = gs.id
    ORDER BY gs."srcIp" ASC, gs."startedAt" DESC
  `;
}

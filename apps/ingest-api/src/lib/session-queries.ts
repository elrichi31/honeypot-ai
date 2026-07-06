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
    )
    SELECT
      ps.*,
      COALESCE(ec.event_count, 0)::int AS "eventCount",
      COALESCE(ec.auth_attempt_count, 0)::int AS "authAttemptCount",
      COALESCE(ec.command_count, 0)::int AS "commandCount"
    FROM paged_sessions ps
    LEFT JOIN event_counts ec ON ec.session_id = ps.id
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
      COALESCE(ec.command_count, 0)::int AS "commandCount"
    FROM grouped_sessions gs
    LEFT JOIN event_counts ec ON ec.session_id = gs.id
    ORDER BY gs."srcIp" ASC, gs."startedAt" DESC
  `;
}

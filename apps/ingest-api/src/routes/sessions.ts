import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { detectBot } from '../lib/bot-detector.js';

const UTC_OFFSET_HOURS = -5;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 5000;

const sessionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().min(1).optional(),
  outcome: z.enum(['all', 'compromised', 'blocked']).optional(),
  actor: z.enum(['all', 'bot', 'human', 'unknown']).optional(),
});

type SessionSummaryRow = {
  total: number;
  compromised: number;
  blocked: number;
  scanGroups: number;
  bots: number;
  humans: number;
};

type SessionListRow = {
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

function toOffsetISOString(date: Date): string {
  const offsetMs = UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  const sign = UTC_OFFSET_HOURS >= 0 ? '+' : '-';
  const abs = Math.abs(UTC_OFFSET_HOURS).toString().padStart(2, '0');
  return local.toISOString().replace('Z', `${sign}${abs}:00`);
}

function toDurationSec(startedAt: Date, endedAt: Date | null): number | null {
  if (!endedAt) return null;
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
}

function formatSession(row: SessionListRow) {
  return {
    id: row.id,
    cowrieSessionId: row.cowrieSessionId,
    srcIp: row.srcIp,
    protocol: row.protocol,
    username: row.username,
    password: row.password,
    loginSuccess: row.loginSuccess,
    hassh: row.hassh,
    clientVersion: row.clientVersion,
    startedAt: toOffsetISOString(row.startedAt),
    endedAt: row.endedAt ? toOffsetISOString(row.endedAt) : null,
    sessionType: row.sessionType ?? 'unknown',
    createdAt: toOffsetISOString(row.createdAt),
    updatedAt: toOffsetISOString(row.updatedAt),
    eventCount: row.eventCount,
    authAttemptCount: row.authAttemptCount,
    commandCount: row.commandCount,
    durationSec: toDurationSec(row.startedAt, row.endedAt),
    threatTags: row.threatTags ?? [],
    _count: { events: row.eventCount },
  };
}

function formatEvent(e: any) {
  return {
    ...e,
    eventTs: toOffsetISOString(e.eventTs),
    createdAt: toOffsetISOString(e.createdAt),
    cowrieTs: toOffsetISOString(new Date(e.cowrieTs as string)),
  };
}

function buildSessionClauses(params: {
  q?: string;
  startDate?: string;
  endDate?: string;
  outcome?: 'all' | 'compromised' | 'blocked';
  actor?: 'all' | 'bot' | 'human' | 'unknown';
}) {
  const clauses: Prisma.Sql[] = [Prisma.sql`1 = 1`];
  const trimmedQuery = params.q?.trim();

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

  if (params.startDate) {
    clauses.push(Prisma.sql`s.started_at >= ${new Date(params.startDate)}`);
  }

  if (params.endDate) {
    clauses.push(Prisma.sql`s.started_at <= ${new Date(params.endDate)}`);
  }

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

function buildWhereSql(clauses: Prisma.Sql[]) {
  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
}

function getPagination(params: z.infer<typeof sessionListQuerySchema>) {
  const pageSize = Math.min(params.pageSize ?? params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = params.offset ?? ((params.page ?? 1) - 1) * pageSize;
  const page = params.page ?? Math.floor(offset / pageSize) + 1;

  return { page, pageSize, offset };
}

export async function sessionRoutes(fastify: FastifyInstance) {
  fastify.get('/sessions', async (request, reply) => {
    const parsed = sessionListQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query params',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { page, pageSize, offset } = getPagination(parsed.data);
    const baseClauses = buildSessionClauses({
      q: parsed.data.q,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      outcome: 'all',
      actor: parsed.data.actor ?? 'all',
    });
    const listClauses = buildSessionClauses({
      q: parsed.data.q,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      outcome: parsed.data.outcome ?? 'all',
      actor: parsed.data.actor ?? 'all',
    });

    const [summaryRows, sessionRows] = await Promise.all([
      fastify.prisma.$queryRaw<SessionSummaryRow[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE s.login_success IS TRUE)::int AS compromised,
          COUNT(*) FILTER (WHERE s.login_success IS DISTINCT FROM TRUE)::int AS blocked,
          COUNT(DISTINCT s.src_ip) FILTER (WHERE s.login_success IS DISTINCT FROM TRUE)::int AS "scanGroups",
          COUNT(*) FILTER (WHERE s.session_type = 'bot')::int AS bots,
          COUNT(*) FILTER (WHERE s.session_type = 'human')::int AS humans
        FROM sessions s
        ${buildWhereSql(baseClauses)}
      `,
      fastify.prisma.$queryRaw<SessionListRow[]>`
        WITH paged_sessions AS (
          SELECT
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
          FROM sessions s
          ${buildWhereSql(listClauses)}
          ORDER BY s.started_at DESC
          LIMIT ${pageSize}
          OFFSET ${offset}
        ),
        event_counts AS (
          SELECT
            e.session_id AS session_id,
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
            array_remove(ARRAY[
              CASE WHEN bool_or(e.command ILIKE '%authorized_keys%' AND (e.command ILIKE '%chattr%' OR e.command ILIKE '%ssh-rsa%' OR e.command ILIKE '%ssh-ed25519%')) THEN 'ssh_backdoor' END,
              CASE WHEN bool_or(e.command ILIKE '%D877F783D5D3EF8C%' OR e.command ILIKE '%TelegramDesktop/tdata%' OR e.command ILIKE '%ttyGSM%' OR e.command ILIKE '%/var/spool/sms%') THEN 'honeypot_evasion' END,
              CASE WHEN bool_or(e.command ILIKE '%/proc/1/mounts%' OR e.command ILIKE '%ls /proc/1/%') THEN 'container_escape' END,
              CASE WHEN bool_or(e.command ILIKE '%xmrig%' OR e.command ILIKE '%minerd%' OR e.command ILIKE '%pool.minexmr%' OR e.command ILIKE '%stratum+tcp%') THEN 'crypto_mining' END,
              CASE WHEN bool_or(e.command ILIKE '%wget http%' OR e.command ILIKE '%curl http%') AND bool_or(e.command ILIKE '%chmod +x%' OR e.command ILIKE '%/tmp/%') THEN 'malware_drop' END,
              CASE WHEN bool_or(e.command ILIKE '%crontab%' OR (e.command ILIKE '%authorized_keys%' AND e.command NOT ILIKE '%chattr%')) THEN 'persistence' END,
              CASE WHEN bool_or(e.command ILIKE '%cat /etc/passwd%' OR e.command ILIKE '%history -c%' OR e.command ILIKE '%rm -rf /var/log%') THEN 'data_exfil' END
            ], NULL) AS tags
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
        ORDER BY ps."startedAt" DESC
      `,
    ]);

    const summary = summaryRows[0] ?? { total: 0, compromised: 0, blocked: 0, scanGroups: 0 };
    const total =
      parsed.data.outcome === 'compromised'
        ? summary.compromised
        : parsed.data.outcome === 'blocked'
          ? summary.blocked
          : summary.total;
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

    return {
      items: sessionRows.map(formatSession),
      summary,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  });

  fastify.get('/sessions/scan-groups', async (request, reply) => {
    const parsed = sessionListQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query params',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { page, pageSize, offset } = getPagination(parsed.data);
    const baseClauses = buildSessionClauses({
      q: parsed.data.q,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      outcome: 'all',
    });
    const blockedClauses = buildSessionClauses({
      q: parsed.data.q,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      outcome: 'blocked',
    });

    const [summaryRows, totalGroupRows, sessionRows] = await Promise.all([
      fastify.prisma.$queryRaw<SessionSummaryRow[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE s.login_success IS TRUE)::int AS compromised,
          COUNT(*) FILTER (WHERE s.login_success IS DISTINCT FROM TRUE)::int AS blocked,
          COUNT(DISTINCT s.src_ip) FILTER (WHERE s.login_success IS DISTINCT FROM TRUE)::int AS "scanGroups",
          COUNT(*) FILTER (WHERE s.session_type = 'bot')::int AS bots,
          COUNT(*) FILTER (WHERE s.session_type = 'human')::int AS humans
        FROM sessions s
        ${buildWhereSql(baseClauses)}
      `,
      fastify.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(DISTINCT s.src_ip)::int AS count
        FROM sessions s
        ${buildWhereSql(blockedClauses)}
      `,
      fastify.prisma.$queryRaw<SessionListRow[]>`
        WITH filtered_scans AS (
          SELECT
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
          FROM sessions s
          ${buildWhereSql(blockedClauses)}
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
            e.session_id AS session_id,
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
      `,
    ]);

    const summary = summaryRows[0] ?? { total: 0, compromised: 0, blocked: 0, scanGroups: 0 };
    const total = totalGroupRows[0]?.count ?? 0;
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

    return {
      items: sessionRows.map(formatSession),
      summary,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  });

  fastify.get('/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const session = await fastify.prisma.session.findUnique({
      where: { id },
      include: { events: { orderBy: { eventTs: 'asc' } } },
    });

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const authAttemptCount = session.events.filter(
      (event) => event.eventType === 'auth.success' || event.eventType === 'auth.failed',
    ).length;
    const commandCount = session.events.filter((event) => event.eventType === 'command.input').length;

    const commands = session.events
      .filter(e => e.eventType === 'command.input')
      .map(e => e.command ?? '')
      .filter(Boolean);

    const durationSec =
      session.endedAt
        ? Math.max(0, Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 1000))
        : null;

    const { actor: sessionType } = detectBot({
      clientVersion: session.clientVersion,
      hassh: session.hassh,
      durationSec,
      commands,
      authAttemptCount,
      loginSuccess: session.loginSuccess,
    });

    return {
      ...formatSession({
        ...session,
        sessionType,
        eventCount: session.events.length,
        authAttemptCount,
        commandCount,
        threatTags: [],
      }),
      events: session.events.map(formatEvent),
    };
  });

  // Backfill sessionType for all existing sessions that are still 'unknown'
  fastify.post('/sessions/backfill-actor', async (_request, reply) => {
    type UnclassifiedRow = {
      id: string;
      client_version: string | null;
      hassh: string | null;
      started_at: Date;
      ended_at: Date | null;
      login_success: boolean | null;
    };

    const sessions = await fastify.prisma.$queryRaw<UnclassifiedRow[]>`
      SELECT id, client_version, hassh, started_at, ended_at, login_success
      FROM sessions
      WHERE session_type = 'unknown'
      LIMIT 5000
    `;

    let updated = 0;

    for (const s of sessions) {
      const [commandEvents, authEvents] = await Promise.all([
        fastify.prisma.event.findMany({
          where: { sessionId: s.id, eventType: 'command.input' },
          select: { command: true },
        }),
        fastify.prisma.event.findMany({
          where: { sessionId: s.id, eventType: { in: ['auth.success', 'auth.failed'] } },
          select: { id: true },
        }),
      ]);

      const durationSec =
        s.ended_at
          ? Math.max(0, Math.round((s.ended_at.getTime() - s.started_at.getTime()) / 1000))
          : null;

      const { actor } = detectBot({
        clientVersion: s.client_version,
        hassh: s.hassh,
        durationSec,
        commands: commandEvents.map(e => e.command ?? '').filter(Boolean),
        authAttemptCount: authEvents.length,
        loginSuccess: s.login_success,
      });

      await fastify.prisma.session.update({
        where: { id: s.id },
        data: { sessionType: actor },
      });
      updated++;
    }

    return reply.send({ backfilled: updated, remaining: sessions.length === 5000 ? 'more' : 0 });
  });
}

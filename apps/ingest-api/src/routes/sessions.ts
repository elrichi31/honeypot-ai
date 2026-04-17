import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

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
});

type SessionSummaryRow = {
  total: number;
  compromised: number;
  blocked: number;
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
  createdAt: Date;
  updatedAt: Date;
  eventCount: number;
  authAttemptCount: number;
  commandCount: number;
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
    createdAt: toOffsetISOString(row.createdAt),
    updatedAt: toOffsetISOString(row.updatedAt),
    eventCount: row.eventCount,
    authAttemptCount: row.authAttemptCount,
    commandCount: row.commandCount,
    durationSec: toDurationSec(row.startedAt, row.endedAt),
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
    });
    const listClauses = buildSessionClauses({
      q: parsed.data.q,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      outcome: parsed.data.outcome ?? 'all',
    });

    const [summaryRows, sessionRows] = await Promise.all([
      fastify.prisma.$queryRaw<SessionSummaryRow[]>`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE s.login_success IS TRUE)::int AS compromised,
          COUNT(*) FILTER (WHERE s.login_success IS DISTINCT FROM TRUE)::int AS blocked
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
        )
        SELECT
          ps.*,
          COALESCE(ec.event_count, 0)::int AS "eventCount",
          COALESCE(ec.auth_attempt_count, 0)::int AS "authAttemptCount",
          COALESCE(ec.command_count, 0)::int AS "commandCount"
        FROM paged_sessions ps
        LEFT JOIN event_counts ec ON ec.session_id = ps.id
        ORDER BY ps."startedAt" DESC
      `,
    ]);

    const summary = summaryRows[0] ?? { total: 0, compromised: 0, blocked: 0 };
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

    return {
      ...formatSession({
        ...session,
        eventCount: session.events.length,
        authAttemptCount,
        commandCount,
      }),
      events: session.events.map(formatEvent),
    };
  });
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { withCache } from '../lib/cache-helper.js';
import { detectBot } from '../lib/bot-detector.js';
import { toOffsetISOString } from '../lib/date-utils.js';
import { basePaginationSchema, getPagination, buildPaginationResponse } from '../lib/pagination.js';
import {
  buildSessionClauses,
  buildWhereSql,
  sessionListQuery,
  scanGroupListQuery,
  summaryQuery,
  type SessionSummaryRow,
  type SessionListRow,
} from '../lib/session-queries.js';
import { resolveClientSensors } from '../lib/client-helpers.js';

const sessionListQuerySchema = basePaginationSchema.extend({
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().min(1).optional(),
  outcome: z.enum(['all', 'compromised', 'blocked']).optional(),
  actor: z.enum(['all', 'bot', 'human', 'unknown']).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  // Per-client / per-sensor scoping, mirroring the web-attacks filters.
  clientSlug: z.string().trim().min(1).optional(),
  sensorId: z.string().trim().min(1).optional(),
});

type SessionListQuery = z.infer<typeof sessionListQuerySchema>;

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

function resolveTotal(summary: SessionSummaryRow, outcome?: string): number {
  if (outcome === 'compromised') return summary.compromised;
  if (outcome === 'blocked') return summary.blocked;
  return summary.total;
}

function parseQuery(request: FastifyRequest, reply: FastifyReply): SessionListQuery | null {
  const parsed = sessionListQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({ error: 'Invalid query params', details: parsed.error.flatten().fieldErrors });
    return null;
  }
  return parsed.data;
}

// Resolve the optional clientSlug/sensorId params to a concrete sensor scope plus
// a cache-key suffix. A bare sensorId scopes to that one sensor; a clientSlug
// resolves to the client's sensors (empty set if unknown / none). sensorId wins
// when both are present, matching the web-attacks filter semantics. `undefined`
// scope means no filtering (global view).
async function resolveSessionScope(
  fastify: FastifyInstance,
  clientSlug: string | undefined,
  sensorId: string | undefined,
): Promise<{ sensorIds: string[] | undefined; scopeKey: string }> {
  if (sensorId) return { sensorIds: [sensorId], scopeKey: `:s=${sensorId}` };
  if (clientSlug) {
    const cs = await resolveClientSensors(fastify.prismaRead, clientSlug);
    return { sensorIds: cs?.sensorIds ?? [], scopeKey: `:c=${clientSlug}` };
  }
  return { sensorIds: undefined, scopeKey: '' };
}

async function handleListSessions(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const params = parseQuery(request, reply);
  if (!params) return;

  const { page, pageSize, offset } = getPagination(params);
  const { sensorIds, scopeKey } = await resolveSessionScope(fastify, params.clientSlug, params.sensorId);
  const cacheKey = `sessions:list${scopeKey}:${page}:${pageSize}:${params.outcome ?? 'all'}:${params.actor ?? 'all'}:${params.q ?? ''}:${params.sortDir}:${params.startDate ?? ''}:${params.endDate ?? ''}`

  return withCache(fastify.cache, cacheKey, 30, async () => {
    const baseClauses = buildSessionClauses({ q: params.q, startDate: params.startDate, endDate: params.endDate, outcome: 'all', actor: params.actor ?? 'all', sensorIds });
    const listClauses = buildSessionClauses({ q: params.q, startDate: params.startDate, endDate: params.endDate, outcome: params.outcome ?? 'all', actor: params.actor ?? 'all', sensorIds });

    const [summaryRows, sessionRows] = await Promise.all([
      fastify.prismaRead.$queryRaw<SessionSummaryRow[]>(summaryQuery(buildWhereSql(baseClauses))),
      fastify.prismaRead.$queryRaw<SessionListRow[]>(sessionListQuery(buildWhereSql(listClauses), params.sortDir, pageSize, offset)),
    ]);

    const summary = summaryRows[0] ?? { total: 0, compromised: 0, blocked: 0, scanGroups: 0, bots: 0, humans: 0 };
    return { items: sessionRows.map(formatSession), summary, pagination: buildPaginationResponse(resolveTotal(summary, params.outcome), page, pageSize) };
  })
}

async function handleScanGroups(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const params = parseQuery(request, reply);
  if (!params) return;

  const { page, pageSize, offset } = getPagination(params);
  const { sensorIds, scopeKey } = await resolveSessionScope(fastify, params.clientSlug, params.sensorId);
  const cacheKey = `sessions:scans${scopeKey}:${page}:${pageSize}:${params.q ?? ''}:${params.startDate ?? ''}:${params.endDate ?? ''}`

  return withCache(fastify.cache, cacheKey, 30, async () => {
    const baseClauses = buildSessionClauses({ q: params.q, startDate: params.startDate, endDate: params.endDate, outcome: 'all', sensorIds });
    const blockedClauses = buildSessionClauses({ q: params.q, startDate: params.startDate, endDate: params.endDate, outcome: 'blocked', sensorIds });
    const blockedWhere = buildWhereSql(blockedClauses);

    const [summaryRows, totalGroupRows, sessionRows] = await Promise.all([
      fastify.prismaRead.$queryRaw<SessionSummaryRow[]>(summaryQuery(buildWhereSql(baseClauses))),
      fastify.prismaRead.$queryRaw<Array<{ count: number }>>`SELECT COUNT(DISTINCT s.src_ip)::int AS count FROM sessions s ${blockedWhere}`,
      fastify.prismaRead.$queryRaw<SessionListRow[]>(scanGroupListQuery(blockedWhere, pageSize, offset)),
    ]);

    const summary = summaryRows[0] ?? { total: 0, compromised: 0, blocked: 0, scanGroups: 0, bots: 0, humans: 0 };
    return { items: sessionRows.map(formatSession), summary, pagination: buildPaginationResponse(totalGroupRows[0]?.count ?? 0, page, pageSize) };
  })
}

async function handleGetSession(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const session = await fastify.prismaRead.session.findUnique({ where: { id }, include: { events: { orderBy: { eventTs: 'asc' } } } });

  if (!session) return reply.status(404).send({ error: 'Session not found' });

  const authAttemptCount = session.events.filter(e => e.eventType === 'auth.success' || e.eventType === 'auth.failed').length;
  const commandCount = session.events.filter(e => e.eventType === 'command.input').length;
  const commands = session.events.filter(e => e.eventType === 'command.input').map(e => e.command ?? '').filter(Boolean);
  const durationSec = toDurationSec(session.startedAt, session.endedAt);

  const { actor: sessionType } = detectBot({ clientVersion: session.clientVersion, hassh: session.hassh, durationSec, commands, authAttemptCount, loginSuccess: session.loginSuccess, password: session.password });

  return {
    ...formatSession({ ...session, sessionType, eventCount: session.events.length, authAttemptCount, commandCount, threatTags: [] }),
    events: session.events.map(formatEvent),
  };
}

async function handleBackfillActor(fastify: FastifyInstance, _request: FastifyRequest, reply: FastifyReply) {
  type UnclassifiedRow = { id: string; client_version: string | null; hassh: string | null; started_at: Date; ended_at: Date | null; login_success: boolean | null; password: string | null };
  type CommandRow     = { session_id: string; command: string | null };
  type AuthRow        = { session_id: string };

  const sessions = await fastify.prisma.$queryRaw<UnclassifiedRow[]>`
    SELECT id, client_version, hassh, started_at, ended_at, login_success, password
    FROM sessions WHERE session_type = 'unknown' LIMIT 5000
  `;

  if (sessions.length === 0) return reply.send({ backfilled: 0, remaining: 0 });

  const ids = sessions.map(s => s.id);

  // 2 batch queries instead of 2 × N
  const [commandRows, authRows] = await Promise.all([
    fastify.prisma.$queryRaw<CommandRow[]>`
      SELECT session_id, command FROM events
      WHERE session_id IN (${Prisma.join(ids)}) AND event_type = 'command.input'
    `,
    fastify.prisma.$queryRaw<AuthRow[]>`
      SELECT session_id FROM events
      WHERE session_id IN (${Prisma.join(ids)}) AND event_type IN ('auth.success', 'auth.failed')
    `,
  ]);

  // Build in-memory lookup maps
  const commandsBySession = new Map<string, string[]>();
  for (const row of commandRows) {
    if (!commandsBySession.has(row.session_id)) commandsBySession.set(row.session_id, []);
    if (row.command) commandsBySession.get(row.session_id)!.push(row.command);
  }
  const authCountBySession = new Map<string, number>();
  for (const row of authRows) {
    authCountBySession.set(row.session_id, (authCountBySession.get(row.session_id) ?? 0) + 1);
  }

  // Classify all sessions in-memory (no DB calls)
  const updates: { id: string; actor: string }[] = [];
  for (const s of sessions) {
    const durationSec = toDurationSec(s.started_at, s.ended_at);
    const { actor } = detectBot({
      clientVersion: s.client_version,
      hassh: s.hassh,
      durationSec,
      commands: commandsBySession.get(s.id) ?? [],
      authAttemptCount: authCountBySession.get(s.id) ?? 0,
      loginSuccess: s.login_success,
      password: s.password,
    });
    updates.push({ id: s.id, actor });
  }

  // 1 bulk UPDATE instead of N individual updates
  const valuesSql = updates.map(u => Prisma.sql`(${u.id}::uuid, ${u.actor}::text)`);
  await fastify.prisma.$executeRaw`
    UPDATE sessions SET session_type = v.actor
    FROM (VALUES ${Prisma.join(valuesSql)}) AS v(id uuid, actor text)
    WHERE sessions.id = v.id
  `;

  return reply.send({ backfilled: updates.length, remaining: sessions.length === 5000 ? 'more' : 0 });
}

export async function sessionRoutes(fastify: FastifyInstance) {
  fastify.get('/sessions', (req, rep) => handleListSessions(fastify, req, rep));
  fastify.get('/sessions/scan-groups', (req, rep) => handleScanGroups(fastify, req, rep));
  fastify.get('/sessions/:id', (req, rep) => handleGetSession(fastify, req, rep));
  fastify.post('/sessions/backfill-actor', (req, rep) => handleBackfillActor(fastify, req, rep));
}

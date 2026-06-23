import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import type { SessionUpsertData } from '../../types/index.js';
import { detectBot } from '../../lib/bot-detector.js';
import {
  summaryQuery,
  sessionListQuery,
  scanGroupListQuery,
  buildWhereSql,
  type SessionSummaryRow,
  type SessionListRow,
} from '../../lib/session-queries.js';

export class SessionRepository {
  constructor(private prisma: PrismaClient) {}

  async upsert(data: SessionUpsertData): Promise<{ id: string; created: boolean }> {
    // Session close: needs classifySession (extra queries) — handle separately
    if (data.endedAt) {
      const existing = await this.prisma.session.findUnique({
        where: { cowrieSessionId: data.cowrieSessionId },
        select: { id: true },
      });

      if (existing) {
        const classification = await this.classifySession(existing.id, data);
        await this.prisma.session.update({
          where: { id: existing.id },
          data: {
            ...(data.username      && { username: data.username }),
            ...(data.password      && { password: data.password }),
            ...(data.loginSuccess !== undefined && { loginSuccess: data.loginSuccess }),
            ...(data.hassh         && { hassh: data.hassh }),
            ...(data.clientVersion && { clientVersion: data.clientVersion }),
            endedAt: data.endedAt,
            sessionType: classification,
          },
        });
        return { id: existing.id, created: false };
      }
    }

    // Common path (no endedAt): single upsert instead of findUnique + create/update
    const session = await this.prisma.session.upsert({
      where: { cowrieSessionId: data.cowrieSessionId },
      create: {
        id:               randomUUID(),
        cowrieSessionId:  data.cowrieSessionId,
        srcIp:            data.srcIp,
        protocol:         data.protocol,
        sensorId:         data.sensorId ?? null,
        startedAt:        data.startedAt,
        username:         data.username,
        password:         data.password,
        loginSuccess:     data.loginSuccess,
        hassh:            data.hassh,
        clientVersion:    data.clientVersion,
      },
      update: {
        ...(data.username      && { username: data.username }),
        ...(data.password      && { password: data.password }),
        ...(data.loginSuccess !== undefined && { loginSuccess: data.loginSuccess }),
        ...(data.hassh         && { hassh: data.hassh }),
        ...(data.clientVersion && { clientVersion: data.clientVersion }),
      },
      select: { id: true, createdAt: true, updatedAt: true },
    });

    // createdAt === updatedAt (within 5ms) means the row was just inserted
    const created = Math.abs(session.updatedAt.getTime() - session.createdAt.getTime()) < 5;
    return { id: session.id, created };
  }

  async classifySession(
    sessionId: string,
    sessionData: Partial<SessionUpsertData> & { endedAt?: Date; startedAt?: Date },
  ): Promise<string> {
    const [session, commandEvents, authEvents] = await Promise.all([
      this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { startedAt: true, clientVersion: true, hassh: true, loginSuccess: true },
      }),
      this.prisma.event.findMany({
        where: { sessionId, eventType: 'command.input' },
        select: { command: true },
      }),
      this.prisma.event.findMany({
        where: { sessionId, eventType: { in: ['auth.success', 'auth.failed'] } },
        select: { id: true },
      }),
    ]);

    if (!session) return 'unknown';

    const startedAt = session.startedAt;
    const endedAt = sessionData.endedAt;
    const durationSec =
      startedAt && endedAt
        ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))
        : null;

    const { actor } = detectBot({
      clientVersion: sessionData.clientVersion ?? session.clientVersion,
      hassh: session.hassh,
      durationSec,
      commands: commandEvents.map(e => e.command ?? '').filter(Boolean),
      authAttemptCount: authEvents.length,
      loginSuccess: sessionData.loginSuccess ?? session.loginSuccess,
      password: sessionData.password,
    });

    return actor;
  }

  async querySummary(prismaRead: PrismaClient, whereSql: Prisma.Sql): Promise<SessionSummaryRow> {
    const rows = await prismaRead.$queryRaw<SessionSummaryRow[]>(summaryQuery(whereSql));
    return rows[0] ?? { total: 0, compromised: 0, blocked: 0, scanGroups: 0, bots: 0, humans: 0 };
  }

  async queryList(
    prismaRead: PrismaClient,
    whereSql: Prisma.Sql,
    sortDir: 'asc' | 'desc',
    pageSize: number,
    offset: number,
  ): Promise<SessionListRow[]> {
    return prismaRead.$queryRaw<SessionListRow[]>(sessionListQuery(whereSql, sortDir, pageSize, offset));
  }

  async queryScanGroupCount(prismaRead: PrismaClient, whereSql: Prisma.Sql): Promise<number> {
    const rows = await prismaRead.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(DISTINCT s.src_ip)::int AS count FROM sessions s ${whereSql}
    `;
    return rows[0]?.count ?? 0;
  }

  async queryScanGroups(
    prismaRead: PrismaClient,
    whereSql: Prisma.Sql,
    pageSize: number,
    offset: number,
  ): Promise<SessionListRow[]> {
    return prismaRead.$queryRaw<SessionListRow[]>(scanGroupListQuery(whereSql, pageSize, offset));
  }

  async findById(prismaRead: PrismaClient, id: string) {
    return prismaRead.session.findUnique({
      where: { id },
      include: { events: { orderBy: { eventTs: 'asc' } } },
    });
  }

  async queryUnclassified(): Promise<Array<{
    id: string; client_version: string | null; hassh: string | null
    started_at: Date; ended_at: Date | null; login_success: boolean | null; password: string | null
  }>> {
    return this.prisma.$queryRaw`
      SELECT id, client_version, hassh, started_at, ended_at, login_success, password
      FROM sessions WHERE session_type = 'unknown' LIMIT 5000
    `;
  }

  async queryCommandsForSessions(ids: string[]): Promise<Array<{ session_id: string; command: string | null }>> {
    return this.prisma.$queryRaw`
      SELECT session_id, command FROM events
      WHERE session_id IN (${Prisma.join(ids)}) AND event_type = 'command.input'
    `;
  }

  async queryAuthCountForSessions(ids: string[]): Promise<Array<{ session_id: string }>> {
    return this.prisma.$queryRaw`
      SELECT session_id FROM events
      WHERE session_id IN (${Prisma.join(ids)}) AND event_type IN ('auth.success', 'auth.failed')
    `;
  }

  async bulkUpdateSessionType(updates: Array<{ id: string; actor: string }>): Promise<void> {
    const valuesSql = updates.map(u => Prisma.sql`(${u.id}::uuid, ${u.actor}::text)`);
    await this.prisma.$executeRaw`
      UPDATE sessions SET session_type = v.actor
      FROM (VALUES ${Prisma.join(valuesSql)}) AS v(id uuid, actor text)
      WHERE sessions.id = v.id
    `;
  }
}

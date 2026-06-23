import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { SessionRepository } from './session.repository.js'
import { buildSessionClauses, buildWhereSql, type SessionListRow, type SessionSummaryRow } from '../../lib/session-queries.js'
import { detectBot } from '../../lib/bot-detector.js'
import { toOffsetISOString } from '../../lib/date-utils.js'
import { withCache } from '../../lib/cache-helper.js'
import { resolveClientSensors } from '../../lib/client-helpers.js'
import { getPagination, buildPaginationResponse } from '../../lib/pagination.js'

type SessionFilterParams = {
  page: number; pageSize: number; offset: number
  q?: string; startDate?: string; endDate?: string
  outcome?: 'all' | 'compromised' | 'blocked'
  actor?: 'all' | 'bot' | 'human' | 'unknown'
  sortDir: 'asc' | 'desc'
  clientSlug?: string; sensorId?: string
}

function toDurationSec(startedAt: Date, endedAt: Date | null): number | null {
  if (!endedAt) return null
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))
}

export function formatSession(row: SessionListRow) {
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
  }
}

export function formatEvent(e: any) {
  return {
    ...e,
    eventTs: toOffsetISOString(e.eventTs),
    createdAt: toOffsetISOString(e.createdAt),
    cowrieTs: toOffsetISOString(new Date(e.cowrieTs as string)),
  }
}

function resolveTotal(summary: SessionSummaryRow, outcome?: string): number {
  if (outcome === 'compromised') return summary.compromised
  if (outcome === 'blocked') return summary.blocked
  return summary.total
}

async function resolveSessionScope(
  prismaRead: PrismaClient,
  clientSlug: string | undefined,
  sensorId: string | undefined,
): Promise<{ sensorIds: string[] | undefined; scopeKey: string }> {
  if (sensorId) return { sensorIds: [sensorId], scopeKey: `:s=${sensorId}` }
  if (clientSlug) {
    const cs = await resolveClientSensors(prismaRead, clientSlug)
    return { sensorIds: cs?.sensorIds ?? [], scopeKey: `:c=${clientSlug}` }
  }
  return { sensorIds: undefined, scopeKey: '' }
}

export class SessionService {
  private repo: SessionRepository

  constructor(private prisma: PrismaClient, private prismaRead: PrismaClient) {
    this.repo = new SessionRepository(prisma)
  }

  async list(cache: FastifyInstance['cache'], params: SessionFilterParams) {
    const { page, pageSize, offset } = getPagination(params)
    const { sensorIds, scopeKey } = await resolveSessionScope(this.prismaRead, params.clientSlug, params.sensorId)
    const cacheKey = `sessions:list${scopeKey}:${page}:${pageSize}:${params.outcome ?? 'all'}:${params.actor ?? 'all'}:${params.q ?? ''}:${params.sortDir}:${params.startDate ?? ''}:${params.endDate ?? ''}`

    return withCache(cache, cacheKey, 30, async () => {
      const baseClauses = buildSessionClauses({ q: params.q, startDate: params.startDate, endDate: params.endDate, outcome: 'all', actor: params.actor ?? 'all', sensorIds })
      const listClauses = buildSessionClauses({ q: params.q, startDate: params.startDate, endDate: params.endDate, outcome: params.outcome ?? 'all', actor: params.actor ?? 'all', sensorIds })

      const [summary, sessionRows] = await Promise.all([
        this.repo.querySummary(this.prismaRead, buildWhereSql(baseClauses)),
        this.repo.queryList(this.prismaRead, buildWhereSql(listClauses), params.sortDir, pageSize, offset),
      ])

      return {
        items: sessionRows.map(formatSession),
        summary,
        pagination: buildPaginationResponse(resolveTotal(summary, params.outcome), page, pageSize),
      }
    })
  }

  async scanGroups(cache: FastifyInstance['cache'], params: SessionFilterParams) {
    const { page, pageSize, offset } = getPagination(params)
    const { sensorIds, scopeKey } = await resolveSessionScope(this.prismaRead, params.clientSlug, params.sensorId)
    const cacheKey = `sessions:scans${scopeKey}:${page}:${pageSize}:${params.q ?? ''}:${params.startDate ?? ''}:${params.endDate ?? ''}`

    return withCache(cache, cacheKey, 30, async () => {
      const baseClauses = buildSessionClauses({ q: params.q, startDate: params.startDate, endDate: params.endDate, outcome: 'all', sensorIds })
      const blockedClauses = buildSessionClauses({ q: params.q, startDate: params.startDate, endDate: params.endDate, outcome: 'blocked', sensorIds })
      const blockedWhere = buildWhereSql(blockedClauses)

      const [summary, totalGroups, sessionRows] = await Promise.all([
        this.repo.querySummary(this.prismaRead, buildWhereSql(baseClauses)),
        this.repo.queryScanGroupCount(this.prismaRead, blockedWhere),
        this.repo.queryScanGroups(this.prismaRead, blockedWhere, pageSize, offset),
      ])

      return {
        items: sessionRows.map(formatSession),
        summary,
        pagination: buildPaginationResponse(totalGroups, page, pageSize),
      }
    })
  }

  async getById(id: string) {
    const session = await this.repo.findById(this.prismaRead, id)
    if (!session) return null

    const authAttemptCount = session.events.filter(e => e.eventType === 'auth.success' || e.eventType === 'auth.failed').length
    const commandCount = session.events.filter(e => e.eventType === 'command.input').length
    const commands = session.events.filter(e => e.eventType === 'command.input').map(e => e.command ?? '').filter(Boolean)
    const durationSec = toDurationSec(session.startedAt, session.endedAt)

    const { actor: sessionType } = detectBot({ clientVersion: session.clientVersion, hassh: session.hassh, durationSec, commands, authAttemptCount, loginSuccess: session.loginSuccess, password: session.password })

    return {
      ...formatSession({ ...session, sessionType, eventCount: session.events.length, authAttemptCount, commandCount, threatTags: [] }),
      events: session.events.map(formatEvent),
    }
  }

  async backfillActor(): Promise<{ backfilled: number; remaining: number | 'more' }> {
    const sessions = await this.repo.queryUnclassified()
    if (sessions.length === 0) return { backfilled: 0, remaining: 0 }

    const ids = sessions.map(s => s.id)

    const [commandRows, authRows] = await Promise.all([
      this.repo.queryCommandsForSessions(ids),
      this.repo.queryAuthCountForSessions(ids),
    ])

    const commandsBySession = new Map<string, string[]>()
    for (const row of commandRows) {
      if (!commandsBySession.has(row.session_id)) commandsBySession.set(row.session_id, [])
      if (row.command) commandsBySession.get(row.session_id)!.push(row.command)
    }
    const authCountBySession = new Map<string, number>()
    for (const row of authRows) {
      authCountBySession.set(row.session_id, (authCountBySession.get(row.session_id) ?? 0) + 1)
    }

    const updates: { id: string; actor: string }[] = []
    for (const s of sessions) {
      const durationSec = toDurationSec(s.started_at, s.ended_at)
      const { actor } = detectBot({
        clientVersion: s.client_version,
        hassh: s.hassh,
        durationSec,
        commands: commandsBySession.get(s.id) ?? [],
        authAttemptCount: authCountBySession.get(s.id) ?? 0,
        loginSuccess: s.login_success,
        password: s.password,
      })
      updates.push({ id: s.id, actor })
    }

    await this.repo.bulkUpdateSessionType(updates)
    return { backfilled: updates.length, remaining: sessions.length === 5000 ? 'more' : 0 }
  }
}

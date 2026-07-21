import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { SessionRepository } from './session.repository.js'
import { buildSessionClauses, buildWhereSql, type SessionListRow, type SessionSummaryRow } from '../../lib/session-queries.js'
import { detectBot } from '../../lib/bot-detector.js'
import { deriveThreatTags } from '../../lib/risk-score.js'
import { toOffsetISOString } from '../../lib/date-utils.js'
import { withCache } from '../../lib/cache-helper.js'
import { resolveClientSensors } from '../../lib/client-helpers.js'
import { getPagination, buildPaginationResponse } from '../../lib/pagination.js'
import { narrowToTenant, type SensorScope } from '../../lib/sensor-scope.js'

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

export function formatSession(row: SessionListRow, threatTags: string[] = []) {
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
    threatTags,
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

async function threatTagsBySessionId(repo: SessionRepository, rows: SessionListRow[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  if (rows.length === 0) return map

  const commandsBySession = new Map<string, string[]>()
  const commandRows = await repo.queryCommandsForSessions(rows.map(r => r.id))
  for (const row of commandRows) {
    if (!row.command) continue
    if (!commandsBySession.has(row.session_id)) commandsBySession.set(row.session_id, [])
    commandsBySession.get(row.session_id)!.push(row.command)
  }

  for (const row of rows) {
    map.set(row.id, deriveThreatTags(commandsBySession.get(row.id) ?? []))
  }
  return map
}

// The tenant scope (from the cookie) is the HARD ceiling; the optional
// clientSlug/sensorId filter can only narrow WITHIN it, never widen. When the
// caller is global (superadmin, tenant.all) the manual filter stands alone.
async function resolveSessionScope(
  prismaRead: PrismaClient,
  tenant: SensorScope,
  clientSlug: string | undefined,
  sensorId: string | undefined,
): Promise<{ sensorIds: string[] | undefined; scopeKey: string }> {
  let manual: string[] | undefined
  if (sensorId) manual = [sensorId]
  else if (clientSlug) manual = (await resolveClientSensors(prismaRead, clientSlug))?.sensorIds ?? []

  const sensorIds = narrowToTenant(tenant, manual)

  const manualKey = sensorId ? `:s=${sensorId}` : clientSlug ? `:c=${clientSlug}` : ''
  return { sensorIds, scopeKey: `:t=${tenant.cacheSuffix}${manualKey}` }
}

export class SessionService {
  private repo: SessionRepository

  constructor(private prisma: PrismaClient, private prismaRead: PrismaClient) {
    this.repo = new SessionRepository(prisma)
  }

  async list(cache: FastifyInstance['cache'], params: SessionFilterParams, tenant: SensorScope) {
    const { page, pageSize, offset } = getPagination(params)
    const { sensorIds, scopeKey } = await resolveSessionScope(this.prismaRead, tenant, params.clientSlug, params.sensorId)
    const cacheKey = `sessions:list${scopeKey}:${page}:${pageSize}:${params.outcome ?? 'all'}:${params.actor ?? 'all'}:${params.q ?? ''}:${params.sortDir}:${params.startDate ?? ''}:${params.endDate ?? ''}`

    return withCache(cache, cacheKey, 30, async () => {
      const baseClauses = buildSessionClauses({ q: params.q, startDate: params.startDate, endDate: params.endDate, outcome: 'all', actor: params.actor ?? 'all', sensorIds })
      const listClauses = buildSessionClauses({ q: params.q, startDate: params.startDate, endDate: params.endDate, outcome: params.outcome ?? 'all', actor: params.actor ?? 'all', sensorIds })

      const [summary, sessionRows] = await Promise.all([
        this.repo.querySummary(this.prismaRead, buildWhereSql(baseClauses)),
        this.repo.queryList(this.prismaRead, buildWhereSql(listClauses), params.sortDir, pageSize, offset),
      ])
      const tagsById = await threatTagsBySessionId(this.repo, sessionRows)

      return {
        items: sessionRows.map(row => formatSession(row, tagsById.get(row.id))),
        summary,
        pagination: buildPaginationResponse(resolveTotal(summary, params.outcome), page, pageSize),
      }
    })
  }

  async scanGroups(cache: FastifyInstance['cache'], params: SessionFilterParams, tenant: SensorScope) {
    const { page, pageSize, offset } = getPagination(params)
    const { sensorIds, scopeKey } = await resolveSessionScope(this.prismaRead, tenant, params.clientSlug, params.sensorId)
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
      const tagsById = await threatTagsBySessionId(this.repo, sessionRows)

      return {
        items: sessionRows.map(row => formatSession(row, tagsById.get(row.id))),
        summary,
        pagination: buildPaginationResponse(totalGroups, page, pageSize),
      }
    })
  }

  async getById(id: string, tenant: SensorScope) {
    const session = await this.repo.findById(this.prismaRead, id)
    if (!session) return null
    // Fail-closed: a scoped tenant may only read sessions from its own sensors.
    if (!tenant.all && !(session.sensorId && tenant.sensorIds.includes(session.sensorId))) return null

    const authAttemptCount = session.events.filter(e => e.eventType === 'auth.success' || e.eventType === 'auth.failed').length
    const commandCount = session.events.filter(e => e.eventType === 'command.input').length
    const commands = session.events.filter(e => e.eventType === 'command.input').map(e => e.command ?? '').filter(Boolean)
    const durationSec = toDurationSec(session.startedAt, session.endedAt)

    const { actor: sessionType } = detectBot({ clientVersion: session.clientVersion, hassh: session.hassh, durationSec, commands, authAttemptCount, loginSuccess: session.loginSuccess, password: session.password })

    return {
      ...formatSession({ ...session, sessionType, eventCount: session.events.length, authAttemptCount, commandCount }, deriveThreatTags(commands)),
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

import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  WebRepository,
  buildByIpWhereSql,
  buildWebHitsWhereSql,
  buildSortSql,
  buildBurstSortSql,
  rangeToInterval,
  type WebHitsByIpRow,
  type WebSessionRow,
  type BurstSortBy,
} from './web.repository.js'
import type { WebHit } from '../../lib/web-normalize.js'
import { isWebHitBot } from '../../lib/bot-detector.js'
import { resolveClientSensors } from '../../lib/client-helpers.js'
import { withCache } from '../../lib/cache-helper.js'
import { buildPaginationResponse } from '../../lib/pagination.js'

export type { WebHitsByIpRow, WebSessionRow, BurstSortBy }
export { buildByIpWhereSql, buildWebHitsWhereSql, buildSortSql, buildBurstSortSql, rangeToInterval }

export class WebService {
  private repo: WebRepository

  constructor(private prisma: PrismaClient) {
    this.repo = new WebRepository(prisma)
  }

  insertWebHit(d: WebHit & { headers: Record<string, string> }, sensorId: string | null) {
    return this.repo.insertWebHit(d, sensorId)
  }

  async listHits(params: { limit: number; offset: number; attackType?: string; srcIp?: string }) {
    const whereSql = buildWebHitsWhereSql({ attackType: params.attackType, srcIp: params.srcIp })
    const { total, hits } = await this.repo.listHits(whereSql, params.limit, params.offset)
    return { total, hits: hits.map((h) => ({ ...h, isBot: isWebHitBot(h.attackType, h.userAgent) })) }
  }

  getTimeline(cache: FastifyInstance['cache']) {
    return withCache(cache, 'web-hits:timeline', 300, () => this.repo.getTimeline())
  }

  getPaths(cache: FastifyInstance['cache']) {
    return withCache(cache, 'web-hits:paths', 600, () => this.repo.getPaths())
  }

  async getStats(
    cache: FastifyInstance['cache'],
    range: string | undefined,
    sensorIds: string[] | undefined,
    scopeKey: string,
  ) {
    const effectiveRange = range ?? '30d'
    const windowSql = buildByIpWhereSql(undefined, undefined, effectiveRange, sensorIds)
    return withCache(cache, `web-hits:stats:${range ?? ''}:${scopeKey}`, 300, () =>
      this.repo.getStats(windowSql)
    )
  }

  getHourly(cache: FastifyInstance['cache'], range: string | undefined) {
    const interval = rangeToInterval(range)
    const windowSql = interval
      ? Prisma.sql`WHERE timestamp >= NOW() - ${interval}::interval`
      : range === 'all'
        ? Prisma.sql``
        : Prisma.sql`WHERE timestamp >= NOW() - INTERVAL '7 days'`
    return withCache(cache, `web-hits:hourly:${range ?? ''}`, 300, () => this.repo.getHourly(windowSql))
  }

  async getByIp(
    cache: FastifyInstance['cache'],
    params: {
      q?: string
      attackType?: string
      range?: string
      sortBy: 'totalHits' | 'lastSeen' | 'firstSeen'
      sortDir: 'asc' | 'desc'
      page: number
      pageSize: number
      offset: number
      sensorIds: string[] | undefined
      scopeKey: string
    },
  ) {
    const { q, attackType, range, sortBy, sortDir, page, pageSize, offset, sensorIds, scopeKey } = params
    const cacheKey = `web-hits:by-ip:${page}:${pageSize}:${q ?? ''}:${attackType ?? ''}:${range ?? ''}:${scopeKey}:${sortBy}:${sortDir}`
    return withCache(cache, cacheKey, 60, async () => {
      const whereSql = buildByIpWhereSql(q, attackType, range, sensorIds)
      const orderCol = buildSortSql(sortBy)
      const orderDir = sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`
      const [total, rows] = await Promise.all([
        this.repo.countWebHitsByIp(whereSql),
        this.repo.queryWebHitsByIp(whereSql, orderCol, orderDir, pageSize, offset),
      ])
      return {
        items: rows.map(mapByIpRow),
        pagination: buildPaginationResponse(total, page, pageSize),
      }
    })
  }

  async getBursts(
    cache: FastifyInstance['cache'],
    params: {
      q?: string
      attackType?: string
      range?: string
      gapMinutes: number
      sortBy: BurstSortBy
      sortDir: 'asc' | 'desc'
      page: number
      pageSize: number
      offset: number
      sensorIds: string[] | undefined
      scopeKey: string
    },
  ) {
    const { q, attackType, range, gapMinutes, sortBy, sortDir, page, pageSize, offset, sensorIds, scopeKey } = params
    const cacheKey = `web-hits:bursts:${page}:${pageSize}:${q ?? ''}:${attackType ?? ''}:${range ?? ''}:${scopeKey}:${gapMinutes}:${sortBy}:${sortDir}`
    return withCache(cache, cacheKey, 60, async () => {
      const whereSql = buildByIpWhereSql(q, attackType, range, sensorIds)
      const orderCol = buildBurstSortSql(sortBy)
      const orderDir = sortDir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`
      const [total, rows] = await Promise.all([
        this.repo.countWebBursts(whereSql, gapMinutes),
        this.repo.queryWebBursts(whereSql, gapMinutes, orderCol, orderDir, pageSize, offset),
      ])
      const items = rows.map((r) => {
        const durationSec = r.duration_sec ?? 0
        const intensity = durationSec > 0 ? (r.hits / (durationSec / 60)) : r.hits
        return {
          srcIp: r.src_ip,
          startedAt: r.started_at,
          endedAt: r.ended_at,
          hits: r.hits,
          durationSec,
          intensityPerMin: Math.round(intensity * 10) / 10,
          attackTypes: r.attack_types ?? [],
          topPaths: r.top_paths ?? [],
          canaryHits: r.canary_hits ?? 0,
        }
      })
      return { items, pagination: buildPaginationResponse(total, page, pageSize) }
    })
  }

  async getSessions(
    cache: FastifyInstance['cache'],
    params: {
      range?: string
      onlyChains: boolean
      page: number
      pageSize: number
      offset: number
      sensorIds: string[] | undefined
      scopeKey: string
    },
  ) {
    const { range, onlyChains, page, pageSize, offset, sensorIds, scopeKey } = params
    const cacheKey = `web-hits:sessions:${page}:${pageSize}:${range ?? ''}:${scopeKey}:${onlyChains}`
    return withCache(cache, cacheKey, 60, async () => {
      const whereSql = buildByIpWhereSql(undefined, undefined, range, sensorIds)
      const [total, rows] = await Promise.all([
        this.repo.countWebSessions(whereSql, onlyChains),
        this.repo.queryWebSessions(whereSql, onlyChains, pageSize, offset),
      ])
      const items = rows.map((r: WebSessionRow) => ({
        clientFingerprint: r.client_fingerprint,
        srcIps: r.src_ips ?? [],
        totalHits: r.total_hits,
        firstSeen: r.first_seen,
        lastSeen: r.last_seen,
        chainHits: r.chain_hits ?? 0,
        canaryHits: r.canary_hits ?? 0,
        attackTypes: r.attack_types ?? [],
        topPaths: r.top_paths ?? [],
        isMultiIp: r.is_multi_ip ?? false,
      }))
      return { items, pagination: buildPaginationResponse(total, page, pageSize) }
    })
  }

  getSessionHits(fingerprint: string) {
    return this.repo.querySessionHits(fingerprint, 500)
  }
}

export async function resolveSensorScope(
  prismaRead: PrismaClient,
  clientSlug?: string,
  sensorId?: string,
): Promise<string[] | undefined> {
  if (!clientSlug && !sensorId) return undefined
  if (clientSlug) {
    const cs = await resolveClientSensors(prismaRead, clientSlug)
    if (!cs) return []
    return sensorId ? cs.sensorIds.filter((id) => id === sensorId) : cs.sensorIds
  }
  return sensorId ? [sensorId] : undefined
}

function mapByIpRow(row: WebHitsByIpRow) {
  return {
    srcIp: row.src_ip,
    totalHits: row.total_hits,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    attackTypes: row.attack_types ?? [],
    topPaths: row.top_paths ?? [],
    userAgents: (row.user_agents ?? []).slice(0, 3),
    botHits: row.bot_hits ?? 0,
    isBot: (row.bot_hits ?? 0) >= row.total_hits * 0.8,
    canaryHits: row.canary_hits ?? 0,
    sensorIds: row.sensor_ids ?? [],
    sensorNames: row.sensor_names ?? [],
    clientNames: row.client_names ?? [],
  }
}

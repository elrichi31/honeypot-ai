import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { ClientRepository } from './clients.repository.js'
import { resolveClientSensors, buildPagination } from '../../lib/client-helpers.js'
import { withCache, invalidate } from '../../lib/cache-helper.js'

const CLIENTS_CACHE_KEY = 'clients:list'
const THREATS_WINDOW_DAYS = 90
const IP_RE = /^[\d.]{7,15}$|^[0-9a-fA-F:]+:[0-9a-fA-F:]+$/

function slugifyClient(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeClientCode(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '')
    .trim()
    .toUpperCase()
}

function deriveClientCode(value: string): string {
  return normalizeClientCode(value).slice(0, 12)
}

function sensorsToken(sensorIds: string[]): string {
  return createHash('sha1').update([...sensorIds].sort().join(',')).digest('hex').slice(0, 12)
}

function mapClientRow(c: { id: string; name: string; slug: string; code: string; description: string; forward_url: string; crowdstrike_hec_url: string; crowdstrike_api_key: string; created_at: Date }, fallbackCode?: string) {
  return {
    id: c.id, name: c.name, slug: c.slug,
    code: c.code || fallbackCode || deriveClientCode(c.slug || c.name),
    description: c.description, forwardUrl: c.forward_url,
    crowdstrikeHecUrl: c.crowdstrike_hec_url,
    crowdstrikeApiKey: c.crowdstrike_api_key,
    createdAt: c.created_at,
  }
}

function parseJson(s: string | null) {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

function buildEventFilters(ip?: string, q?: string) {
  const ipCond = ip ? Prisma.sql`AND src_ip = ${ip}` : Prisma.sql``
  const qPat   = q ? `%${q}%` : ''
  const qCond  = q
    ? Prisma.sql`AND (COALESCE(username,'') ILIKE ${qPat} OR COALESCE(command,'') ILIKE ${qPat} OR event_type ILIKE ${qPat})`
    : Prisma.sql``
  return { ipCond, qCond }
}

export class ClientService {
  private repo: ClientRepository

  constructor(private prisma: PrismaClient, private prismaRead: PrismaClient) {
    this.repo = new ClientRepository(prisma)
  }

  async list(cache: FastifyInstance['cache']) {
    return withCache(cache, CLIENTS_CACHE_KEY, 120, async () => {
      const rows = await this.repo.list()
      return rows.map(c => mapClientRow(c))
    })
  }

  async create(
    cache: FastifyInstance['cache'],
    body: { name: string; slug: string; code: string; description: string; forwardUrl: string; crowdstrikeHecUrl: string; crowdstrikeApiKey: string },
  ): Promise<{ error: string; status: number } | ReturnType<typeof mapClientRow>> {
    const name = body.name
    const slug = slugifyClient(body.slug || name)
    if (!slug) return { error: 'Invalid client slug', status: 400 }
    const code = normalizeClientCode(body.code || deriveClientCode(slug || name))
    if (!code) return { error: 'Invalid client code', status: 400 }
    if (body.forwardUrl && !/^https?:\/\//i.test(body.forwardUrl))
      return { error: 'Forward URL must start with http:// or https://', status: 400 }
    if (body.crowdstrikeHecUrl && !/^https?:\/\//i.test(body.crowdstrikeHecUrl))
      return { error: 'CrowdStrike HEC URL must start with http:// or https://', status: 400 }

    const c = await this.repo.upsert({ name, slug, code, description: body.description, forwardUrl: body.forwardUrl, crowdstrikeHecUrl: body.crowdstrikeHecUrl, crowdstrikeApiKey: body.crowdstrikeApiKey })
    await invalidate(cache, CLIENTS_CACHE_KEY)
    return mapClientRow(c, code)
  }

  async patch(
    cache: FastifyInstance['cache'],
    clientId: string,
    body: { name?: string; code?: string; description?: string; forwardUrl?: string; crowdstrikeHecUrl?: string; crowdstrikeApiKey?: string },
  ): Promise<{ error: string; status: number } | ReturnType<typeof mapClientRow>> {
    const current = await this.repo.findById(clientId)
    if (!current) return { error: 'Client not found', status: 404 }

    const nextName              = body.name ?? current.name
    const nextCode              = body.code !== undefined
      ? normalizeClientCode(body.code || deriveClientCode(current.slug || nextName))
      : current.code || deriveClientCode(current.slug || nextName)
    const nextDescription       = body.description ?? current.description
    const nextForwardUrl        = body.forwardUrl ?? current.forward_url
    const nextCrowdstrikeHecUrl = body.crowdstrikeHecUrl ?? current.crowdstrike_hec_url
    const nextCrowdstrikeApiKey = body.crowdstrikeApiKey ?? current.crowdstrike_api_key

    if (!nextCode) return { error: 'Invalid client code', status: 400 }
    if (nextForwardUrl && !/^https?:\/\//i.test(nextForwardUrl))
      return { error: 'Forward URL must start with http:// or https://', status: 400 }
    if (nextCrowdstrikeHecUrl && !/^https?:\/\//i.test(nextCrowdstrikeHecUrl))
      return { error: 'CrowdStrike HEC URL must start with http:// or https://', status: 400 }

    const c = await this.repo.update(clientId, { name: nextName, code: nextCode, description: nextDescription, forwardUrl: nextForwardUrl, crowdstrikeHecUrl: nextCrowdstrikeHecUrl, crowdstrikeApiKey: nextCrowdstrikeApiKey })
    if (!c) return { error: 'Client not found', status: 404 }
    await invalidate(cache, CLIENTS_CACHE_KEY)
    return mapClientRow(c, nextCode)
  }

  async delete(cache: FastifyInstance['cache'], clientId: string): Promise<{ error: string; status: number } | true> {
    const exists = await this.repo.findByIdExists(clientId)
    if (!exists) return { error: 'Client not found', status: 404 }
    await this.repo.delete(clientId)
    await invalidate(cache, CLIENTS_CACHE_KEY)
    return true
  }

  async getEventLog(cache: FastifyInstance['cache'], args: {
    clientSlug: string; page: number; pageSize: number
    source: 'ssh' | 'protocol' | 'web' | 'all'
    sensorId?: string; ip?: string; q?: string
  }) {
    const { clientSlug, page, pageSize, source, sensorId, ip, q } = args
    const offset = (page - 1) * pageSize
    const cs = await resolveClientSensors(this.prismaRead, clientSlug)
    if (!cs) return { error: 'Client not found', status: 404 }

    const scopedSensorIds = sensorId ? cs.sensorIds.filter(id => id === sensorId) : cs.sensorIds
    if (scopedSensorIds.length === 0) return { items: [], pagination: buildPagination(page, pageSize, 0) }

    const rawIp = ip ?? (q && IP_RE.test(q) ? q : undefined)
    const textQ = q && !IP_RE.test(q) ? q : undefined
    const { ipCond, qCond } = buildEventFilters(rawIp, textQ)

    const wantSsh      = source === 'all' || source === 'ssh'
    const wantProtocol = source === 'all' || source === 'protocol'
    const wantWeb      = source === 'all' || source === 'web'
    const sids         = Prisma.join(scopedSensorIds)
    const hasFilters   = !!rawIp || !!textQ
    const perBranch    = offset + pageSize

    const countKey = `client:events:count:${cs.clientId}:${sensorsToken(scopedSensorIds)}:${sensorId ?? 'all'}:${source}:${rawIp ?? ''}:${textQ ?? ''}`

    const [rows, total] = await Promise.all([
      this.repo.getEventLog({ sids, wantSsh, wantProtocol, wantWeb, ipCond, qCond, hasFilters, pageSize, offset, perBranch, prismaRead: this.prismaRead }),
      withCache(cache, countKey, 60, () => this.repo.getEventLogCount({ sids, wantSsh, wantProtocol, wantWeb, ipCond, qCond, prismaRead: this.prismaRead })),
    ])

    return {
      items: rows.map(r => ({
        id: r.id, source: r.source, protocol: r.protocol, srcIp: r.src_ip,
        eventType: r.event_type, timestamp: r.ts, message: r.message,
        command: r.command, username: r.username, password: r.password,
        sessionId: r.session_id, extra: parseJson(r.extra),
      })),
      pagination: buildPagination(page, pageSize, total),
    }
  }

  async getTimeline(cache: FastifyInstance['cache'], args: { clientSlug: string; range: 'day' | 'week' | 'month'; sensorId?: string }) {
    const { clientSlug, range, sensorId } = args
    const cs = await resolveClientSensors(this.prismaRead, clientSlug)
    if (!cs) return { error: 'Client not found', status: 404 }

    const scopedSensorIds = sensorId ? cs.sensorIds.filter(id => id === sensorId) : cs.sensorIds
    if (scopedSensorIds.length === 0) return []

    const bucketUnit  = range === 'month' ? 'day' : 'hour'
    const intervalSql = range === 'day' ? '1 day' : range === 'week' ? '7 days' : '30 days'
    const sids        = Prisma.join(scopedSensorIds)
    const cacheKey    = `client:timeline:${cs.clientId}:${sensorsToken(scopedSensorIds)}:${sensorId ?? 'all'}:${range}`

    return withCache(cache, cacheKey, 120, async () => {
      const rows = await this.repo.getTimeline({ sids, bucketUnit, intervalSql, prismaRead: this.prismaRead })

      const protocols = new Set<string>()
      const byBucket = new Map<number, { bucket: Date; counts: Record<string, number>; total: number }>()
      for (const r of rows) {
        protocols.add(r.protocol)
        const key = r.bucket.getTime()
        let b = byBucket.get(key)
        if (!b) { b = { bucket: r.bucket, counts: {}, total: 0 }; byBucket.set(key, b) }
        const n = Number(r.count)
        b.counts[r.protocol] = (b.counts[r.protocol] ?? 0) + n
        b.total += n
      }

      const orderedProtocols = [...protocols].sort()
      const buckets = [...byBucket.values()]
        .sort((a, b) => a.bucket.getTime() - b.bucket.getTime())
        .map(b => ({
          bucket: b.bucket, total: b.total,
          ...Object.fromEntries(orderedProtocols.map(p => [p, b.counts[p] ?? 0])),
        }))

      return { protocols: orderedProtocols, buckets }
    })
  }

  async getThreats(cache: FastifyInstance['cache'], args: { clientSlug: string; page: number; pageSize: number }) {
    const { clientSlug, page, pageSize } = args
    const cs = await resolveClientSensors(this.prismaRead, clientSlug)
    if (!cs) return { error: 'Client not found', status: 404 }
    if (cs.sensorIds.length === 0) return { items: [], pagination: buildPagination(page, pageSize, 0) }

    const offset = (page - 1) * pageSize
    const sids   = Prisma.join(cs.sensorIds)
    const since  = new Date(Date.now() - THREATS_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const cacheKey = `client:threats:${cs.clientId}:${sensorsToken(cs.sensorIds)}:${page}:${pageSize}`

    return withCache(cache, cacheKey, 60, async () => {
      const { rows, total } = await this.repo.getThreats({ sids, since, pageSize, offset, prismaRead: this.prismaRead })
      return {
        items: rows.map(r => ({
          srcIp: r.src_ip, totalEvents: Number(r.total_events),
          sources: r.sources ? r.sources.split(',') : [],
          protocols: r.protocols ? r.protocols.split(',') : [],
          lastSeen: r.last_seen, loginSuccesses: Number(r.login_successes),
        })),
        pagination: buildPagination(page, pageSize, total),
      }
    })
  }

  async getToday(cache: FastifyInstance['cache'], args: { clientSlug: string }) {
    const cs = await resolveClientSensors(this.prismaRead, args.clientSlug)
    if (!cs) return { error: 'Client not found', status: 404 }
    if (cs.sensorIds.length === 0) return { totalEvents: 0, uniqueIps: 0, loginSuccesses: 0, topProtocol: null }

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const sids     = Prisma.join(cs.sensorIds)
    const cacheKey = `client:today:${cs.clientId}:${sensorsToken(cs.sensorIds)}`

    return withCache(cache, cacheKey, 60, async () => {
      const { metrics: m, topProtocol } = await this.repo.getToday({ sids, todayStart, prismaRead: this.prismaRead })
      return { totalEvents: m.total_events, uniqueIps: m.unique_ips, loginSuccesses: m.login_successes, topProtocol }
    })
  }
}

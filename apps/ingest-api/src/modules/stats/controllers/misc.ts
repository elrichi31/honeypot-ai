import type { FastifyInstance } from 'fastify'
import { withCache } from '../../lib/cache-helper.js'
import { parseSensorScope } from '../../lib/sensor-scope.js'
import { MiscRepository } from '../../modules/stats/stats.repository.js'

const OVERVIEW_TTL = 1800
const GEO_TTL     = 1800
const TIMELINE_TTL = 600

export async function miscRoutes(fastify: FastifyInstance) {
  const repo = new MiscRepository(fastify.prismaRead)

  fastify.get('/stats/honeypot-overview', (request) => {
    const scope = parseSensorScope(request.query as Record<string, unknown>)
    return withCache(fastify.cache, `stats:honeypot-overview:${scope.cacheSuffix}`, OVERVIEW_TTL, async () => {
      const [sshRows, webRows, webTopAttackRows, protocolRows] = await repo.getHoneypotOverview(scope)

      const ssh = sshRows[0] ?? { sessions: 0n, uniqueIps: 0n, successfulLogins: 0n, lastSeen: null }
      const web = webRows[0] ?? { hits: 0n, uniqueIps: 0n, lastSeen: null }
      const sshCount = Number(ssh.sessions)
      const webCount = Number(web.hits)
      const protocolCount = protocolRows.reduce((sum, r) => sum + Number(r.count), 0)
      const activeSources =
        (sshCount > 0 ? 1 : 0) +
        (webCount > 0 ? 1 : 0) +
        protocolRows.filter(r => Number(r.count) > 0).length

      return {
        ssh: { sessions: sshCount, uniqueIps: Number(ssh.uniqueIps), successfulLogins: Number(ssh.successfulLogins), lastSeen: ssh.lastSeen?.toISOString() ?? null },
        web: { hits: webCount, uniqueIps: Number(web.uniqueIps), topAttackType: webTopAttackRows[0]?.attackType ?? null, lastSeen: web.lastSeen?.toISOString() ?? null },
        protocols: protocolRows.map(r => ({ protocol: r.protocol, count: Number(r.count), uniqueIps: Number(r.uniqueIps), authAttempts: Number(r.authAttempts), lastSeen: r.lastSeen?.toISOString() ?? null })),
        totals: { events: sshCount + webCount + protocolCount, activeSources },
      }
    })
  })

  fastify.get('/stats/cross-sensor-timeline', async (request) => {
    const query = request.query as Record<string, string | undefined>
    const range = query.range === 'week' || query.range === 'month' ? query.range : 'day'
    const timezone = query.timezone || 'UTC'
    const scope = parseSensorScope(request.query as Record<string, unknown>)
    const cacheKey = `stats:cross-sensor-timeline:${range}:${timezone.replace(/\//g, '_')}:${scope.cacheSuffix}`

    return withCache(fastify.cache, cacheKey, TIMELINE_TTL, async () => {
      const now = new Date()
      const endDate = new Date(now)
      const startDate = new Date(now)
      if (range === 'week') startDate.setDate(startDate.getDate() - 6)
      else if (range === 'month') startDate.setDate(startDate.getDate() - 29)
      else startDate.setHours(startDate.getHours() - 23)

      const truncUnit = range === 'day' ? 'hour' : 'day'
      const interval = range === 'day' ? "interval '1 hour'" : "interval '1 day'"
      const fmt = range === 'day' ? 'YYYY-MM-DD HH24:MI' : 'YYYY-MM-DD'
      const lbl = range === 'day' ? 'HH24:MI' : 'DD/MM'

      const [sshRows, webRows, protoRows] = await repo.getCrossSensorTimeline(scope, truncUnit, interval, fmt, lbl, startDate, endDate)

      type BucketEntry = Record<string, number | string>
      const map = new Map<string, BucketEntry>()
      for (const r of sshRows) map.set(r.bucketStart, { label: r.label, ssh: r.count, web: 0 })
      for (const r of webRows) {
        const e = map.get(r.bucketStart)
        if (e) (e as Record<string, number>).web = r.count
        else map.set(r.bucketStart, { label: r.label, ssh: 0, web: r.count })
      }
      const activeProtocols = new Set<string>()
      for (const r of protoRows) {
        activeProtocols.add(r.protocol)
        const e = map.get(r.bucketStart)
        if (e) (e as Record<string, number>)[r.protocol] = ((e as Record<string, number>)[r.protocol] ?? 0) + r.count
        else map.set(r.bucketStart, { label: r.label, ssh: 0, web: 0, [r.protocol]: r.count })
      }
      const protoList = Array.from(activeProtocols)
      for (const e of map.values()) {
        for (const p of protoList) if ((e as Record<string, number>)[p] === undefined) (e as Record<string, number>)[p] = 0
      }

      return { buckets: Array.from(map.values()), activeProtocols: protoList }
    })
  })

  fastify.get('/stats/geo', (request) => {
    const scope = parseSensorScope(request.query as Record<string, unknown>)
    return withCache(fastify.cache, `stats:geo:${scope.cacheSuffix}`, GEO_TTL, () => repo.getGeo(scope))
  })

  fastify.get('/stats/session-commands', async (request) => {
    const { limit = '500' } = request.query as Record<string, string>
    const take = Math.min(Number(limit), 5000)
    return withCache(fastify.cache, `stats:session-commands:${take}`, 300, async () => {
      const events = await repo.getSessionCommands(take)
      const result: Record<string, string[]> = {}
      for (const e of events) {
        if (!e.command) continue
        if (!result[e.sessionId]) result[e.sessionId] = []
        result[e.sessionId].push(e.command)
      }
      return result
    })
  })

  fastify.get('/stats/heatmap', async (request) => {
    const query = request.query as Record<string, string | undefined>
    const timezone = query.timezone || 'UTC'
    const days = Math.min(Math.max(parseInt(query.days || '90', 10), 1), 365)
    const scope = parseSensorScope(request.query as Record<string, unknown>)
    return withCache(fastify.cache, `stats:heatmap:${days}:${timezone.replace(/\//g, '_')}:${scope.cacheSuffix}`, 1200, async () => {
      const rows = await repo.getHeatmap(timezone, days, scope)
      const cells = rows.map(r => ({ dow: r.dow, hour: r.hour, count: Number(r.count) }))
      const maxCount = cells.reduce((m, c) => Math.max(m, c.count), 0)
      const totalSessions = cells.reduce((s, c) => s + c.count, 0)
      const hourTotals = Array.from({ length: 24 }, (_, h) =>
        cells.filter(c => c.hour === h).reduce((s, c) => s + c.count, 0)
      )
      return { cells, maxCount, totalSessions, hourTotals, days }
    })
  })
}

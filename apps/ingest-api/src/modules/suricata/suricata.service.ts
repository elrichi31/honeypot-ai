import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { SuricataRepository, type EveAlert } from './suricata.repository.js'
import { lookupGeo } from '../../lib/geo.js'
import { eventBus } from '../../lib/event-bus.js'
import { withCache } from '../../lib/cache-helper.js'

const OWN_IPS = new Set(
  (process.env.SURICATA_OWN_IPS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
)

const VALID_RANGES = {
  '24h': { interval: '24 hours', trunc: 'hour' },
  '7d':  { interval: '7 days',   trunc: 'day'  },
  '30d': { interval: '30 days',  trunc: 'day'  },
} as const

export type Range = keyof typeof VALID_RANGES

function severityLabel(s: number) {
  if (s === 1) return 'critical'
  if (s === 2) return 'high'
  if (s === 3) return 'medium'
  return 'low'
}

function isNoise(signature: string): boolean {
  return signature.startsWith('SURICATA ')
}

export class SuricataService {
  private repo: SuricataRepository

  constructor(private prisma: PrismaClient, private prismaRead: PrismaClient) {
    this.repo = new SuricataRepository(prisma)
  }

  async persistAlerts(alerts: EveAlert[]): Promise<number> {
    const rows = alerts
      .map(alert => ({ alert, ts: new Date(alert.timestamp) }))
      .filter(({ alert, ts }) => !isNaN(ts.getTime()) && !isNoise(alert.alert.signature))

    if (rows.length === 0) return 0

    await this.repo.insertBatch(rows)

    for (const { alert, ts } of rows) {
      if (OWN_IPS.has(alert.src_ip)) continue
      const geo = lookupGeo(alert.src_ip)
      if (geo) eventBus.emit('attack', {
        type: 'ids',
        ip: alert.src_ip,
        ...geo,
        timestamp: ts.toISOString(),
        sensorId: alert.sensor_id || null,
      })
    }

    return rows.length
  }

  async listAlerts(args: {
    page: number; pageSize: number; severity?: number
    srcIp?: string; q?: string; hideNoise: boolean; excludeOwnIps: boolean
  }) {
    const { page, pageSize, severity, srcIp, q, hideNoise, excludeOwnIps } = args
    const offset = (page - 1) * pageSize

    const safeIp = srcIp && /^[0-9a-fA-F.:]+$/.test(srcIp) ? srcIp : null
    const safeQ  = q ? q.slice(0, 100).replace(/[%_\\]/g, '\\$&') : null
    const ownIpList = [...OWN_IPS].map(ip => `'${ip}'`).join(',')

    const filters = [
      severity != null ? `AND severity = ${severity}` : '',
      safeIp ? `AND src_ip = '${safeIp}'` : '',
      safeQ ? `AND (signature ILIKE '%${safeQ}%' OR category ILIKE '%${safeQ}%' OR src_ip ILIKE '%${safeQ}%')` : '',
      hideNoise ? `AND signature NOT ILIKE 'SURICATA %'` : '',
      excludeOwnIps && ownIpList ? `AND src_ip NOT IN (${ownIpList})` : '',
    ].join(' ')

    const [alerts, total] = await Promise.all([
      this.repo.listAlerts(this.prismaRead, filters, pageSize, offset),
      this.repo.countAlerts(this.prismaRead, filters),
    ])

    return {
      items: alerts.map(a => ({
        ...a,
        flowId: a.flow_id !== null ? Number(a.flow_id) : null,
        flow_id: undefined,
        severityLabel: severityLabel(a.severity),
        country: lookupGeo(a.src_ip)?.country ?? null,
      })),
      pagination: {
        page, pageSize, total,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      },
    }
  }

  async getStats(cache: FastifyInstance['cache'], range: Range) {
    const { interval, trunc } = VALID_RANGES[range]
    const ownIpList   = [...OWN_IPS].map(ip => `'${ip}'`).join(',')
    const ownIpFilter = ownIpList ? `AND src_ip NOT IN (${ownIpList})` : ''

    return withCache(cache, `suricata:stats:${range}`, 60, async () => {
      const { totals, threatTotals, topSigs, topThreatSigs, topSources, timeline } =
        await this.repo.getStats(this.prismaRead, interval, trunc, ownIpFilter)

      const t  = totals[0]
      const th = threatTotals[0]

      return {
        last24h: { total: Number(t?.total ?? 0), critical: Number(t?.critical ?? 0), high: Number(t?.high ?? 0), medium: Number(t?.medium ?? 0), low: Number(t?.low ?? 0) },
        threats24h: { total: Number(th?.total ?? 0), critical: Number(th?.critical ?? 0), high: Number(th?.high ?? 0), medium: Number(th?.medium ?? 0), low: Number(th?.low ?? 0) },
        topSignatures: topSigs.map(s => ({ signature: s.signature, severity: s.severity, severityLabel: severityLabel(s.severity), count: Number(s.count) })),
        topThreatSignatures: topThreatSigs.map(s => ({ signature: s.signature, severity: s.severity, category: s.category, severityLabel: severityLabel(s.severity), count: Number(s.count) })),
        topSources: topSources.map(s => { const geo = lookupGeo(s.src_ip); return { srcIp: s.src_ip, count: Number(s.count), country: geo?.country ?? null } }),
        timeline: timeline.map(r => ({ bucket: r.bucket, total: Number(r.total), threats: Number(r.threats) })),
      }
    })
  }
}

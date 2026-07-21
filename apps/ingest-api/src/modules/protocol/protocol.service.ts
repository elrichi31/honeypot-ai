import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { ProtocolRepository } from './protocol.repository.js'
import { withCache } from '../../lib/cache-helper.js'
import type { SensorScope } from '../../lib/sensor-scope.js'

export class ProtocolService {
  private repo: ProtocolRepository

  constructor(prismaRead: PrismaClient) {
    this.repo = new ProtocolRepository(prismaRead)
  }

  async list(protocol: string | null, limit: number, page: number, scope: SensorScope) {
    const offset = (page - 1) * limit
    const [rows, total] = await Promise.all([
      this.repo.list(protocol, limit, offset, scope),
      this.repo.count(protocol, scope),
    ])
    return { data: rows, meta: { page, limit, total } }
  }

  async getInsights(cache: FastifyInstance['cache'], protocol: string, scope: SensorScope) {
    return withCache(cache, `protocol-insights:${protocol}:${scope.cacheSuffix}`, 1800, async () => {
      const isSmb = protocol === 'smb'
      const { totals, topIps, topPorts, topUsernames, topPasswords, topCommands, topServices, topDatabases, topDomains, topShares, topNativeOS, topNtlmHashes, eventBreakdown, topCredentials } =
        await this.repo.getInsights(protocol, isSmb, scope)

      const total = totals[0]
      return {
        totals: { total: total?.total ?? 0, uniqueIps: total?.unique_ips ?? 0, authAttempts: total?.auth_attempts ?? 0, commandEvents: total?.command_events ?? 0, lastSeen: total?.last_seen ?? null },
        topIps: topIps.map(r => ({ srcIp: r.src_ip, count: r.count, lastSeen: r.last_seen })),
        topPorts: topPorts.map(r => ({ dstPort: r.dst_port, count: r.count, lastSeen: r.last_seen })),
        topUsernames, topPasswords, topCommands, topServices, topDatabases,
        topDomains:    (topDomains    as Array<{ domain: string; count: number }>).map(r => ({ domain: r.domain, count: r.count })),
        topShares:     (topShares     as Array<{ share: string; count: number }>).map(r => ({ share: r.share, count: r.count })),
        topNativeOS:   (topNativeOS   as Array<{ native_os: string; count: number }>).map(r => ({ nativeOS: r.native_os, count: r.count })),
        topNtlmHashes: (topNtlmHashes as Array<{ ntlm_hash: string; username: string; count: number }>).map(r => ({ ntlmHash: r.ntlm_hash, username: r.username, count: r.count })),
        eventBreakdown: eventBreakdown.map(r => ({ eventType: r.event_type, count: r.count })),
        topCredentials,
      }
    })
  }

  async getStats(cache: FastifyInstance['cache'], scope: SensorScope) {
    return withCache(cache, `protocol-hits:stats:${scope.cacheSuffix}`, 1800, async () => {
      const rows = await this.repo.getStats(scope)
      return rows.map(r => ({ protocol: r.protocol, count: Number(r.count), lastSeen: r.last_seen, authAttempts: Number(r.auth_attempts) }))
    })
  }

  async getPortStats(cache: FastifyInstance['cache'], scope: SensorScope) {
    return withCache(cache, `protocol-hits:ports-stats:${scope.cacheSuffix}`, 1800, async () => {
      const rows = await this.repo.getPortStats(scope)
      return rows.map(r => ({ protocol: r.protocol, dstPort: r.dst_port, count: Number(r.count), lastSeen: r.last_seen, authAttempts: Number(r.auth_attempts) }))
    })
  }
}

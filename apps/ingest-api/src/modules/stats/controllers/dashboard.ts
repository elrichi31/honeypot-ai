import type { FastifyInstance } from 'fastify'
import { withCache } from '../../lib/cache-helper.js'
import { parseSensorScope } from '../../lib/sensor-scope.js'
import { toNumber, toOffsetISOString } from './utils.js'
import { DashboardRepository } from '../../modules/stats/stats.repository.js'

const CACHE_TTL = 1800

export async function dashboardRoute(fastify: FastifyInstance) {
  const repo = new DashboardRepository(fastify.prismaRead)

  fastify.get('/stats/dashboards', (request) => {
    const scope = parseSensorScope(request.query as Record<string, unknown>)
    return withCache(fastify.cache, `stats:dashboards:${scope.cacheSuffix}`, CACHE_TTL, async () => {
      const [windowRows, funnelRows, countrySuccessCandidates, credentialCampaignRows,
        recurringIpRows, commandPatternRows, depthBucketRows, depthStatsRows] =
        await Promise.all([
          repo.getWindow(scope),
          repo.getFunnel(scope),
          repo.getCountrySuccessCandidates(scope),
          repo.getCredentialCampaigns(scope),
          repo.getRecurringIps(scope),
          repo.getCommandPatterns(scope),
          repo.getDepthBuckets(scope),
          repo.getDepthStats(scope),
        ])

      const window = windowRows[0] ?? { firstSeen: null, lastSeen: null, totalSessions: 0, uniqueIps: 0 }
      const funnel = funnelRows[0] ?? { connections: 0, authAttempts: 0, loginSuccess: 0, commands: 0, highSignalCompromise: 0 }
      const depthStats = depthStatsRows[0] ?? { averageCommands: 0, maxCommands: 0, interactiveSessions: 0 }

      return {
        window: { firstSeen: toOffsetISOString(window.firstSeen), lastSeen: toOffsetISOString(window.lastSeen), totalSessions: toNumber(window.totalSessions), uniqueIps: toNumber(window.uniqueIps) },
        funnel: { connections: toNumber(funnel.connections), authAttempts: toNumber(funnel.authAttempts), loginSuccess: toNumber(funnel.loginSuccess), commands: toNumber(funnel.commands), highSignalCompromise: toNumber(funnel.highSignalCompromise) },
        countrySuccessCandidates: countrySuccessCandidates.map(r => ({ srcIp: r.srcIp, sessions: toNumber(r.sessions), successes: toNumber(r.successes) })),
        credentialCampaigns: credentialCampaignRows.map(r => ({ bucketStart: toOffsetISOString(r.bucketStart), username: r.username, password: r.password, attempts: toNumber(r.attempts), successCount: toNumber(r.successCount), uniqueIps: toNumber(r.uniqueIps), ips: r.ips })),
        recurringIps: recurringIpRows.map(r => ({ srcIp: r.srcIp, totalSessions: toNumber(r.totalSessions), failedSessions: toNumber(r.failedSessions), successfulSessions: toNumber(r.successfulSessions), credentialCount: toNumber(r.credentialCount), firstSeen: toOffsetISOString(r.firstSeen), lastSeen: toOffsetISOString(r.lastSeen), returnAfterMinutes: r.returnAfterMinutes === null ? null : toNumber(r.returnAfterMinutes), clientVersion: r.clientVersion })),
        commandPatterns: commandPatternRows.map(r => ({ sequence: r.sequence, sessions: toNumber(r.sessions), uniqueIps: toNumber(r.uniqueIps) })),
        successfulDepth: { buckets: depthBucketRows.map(r => ({ bucket: r.bucket, sessions: toNumber(r.sessions) })), averageCommands: depthStats.averageCommands ?? 0, maxCommands: depthStats.maxCommands ?? 0, interactiveSessions: toNumber(depthStats.interactiveSessions) },
      }
    })
  })
}

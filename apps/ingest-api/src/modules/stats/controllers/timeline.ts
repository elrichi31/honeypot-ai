import type { FastifyInstance } from 'fastify'
import type { TimelineBucket, GroupedUsernameRow, GroupedPasswordRow, CountRow, CommandRow } from '../stats.types.js'
import { parseDate, toNumber } from '../stats.utils.js'
import { TimelineRepository } from '../stats.repository.js'

export async function overviewRoute(fastify: FastifyInstance) {
  const repo = new TimelineRepository(fastify.prismaRead)

  fastify.get('/stats/overview', async (request) => {
    const query = request.query as Record<string, string | undefined>
    const now = new Date()
    const range = query.range === 'week' || query.range === 'month' ? query.range : 'day'
    const timezone = query.timezone || 'UTC'
    const endDate = parseDate(query.endDate, now)
    const defaultStart = new Date(now)

    if (range === 'week') defaultStart.setDate(defaultStart.getDate() - 6)
    else if (range === 'month') defaultStart.setDate(defaultStart.getDate() - 29)
    else defaultStart.setHours(defaultStart.getHours() - 23)

    const startDate = parseDate(query.startDate, defaultStart)

    const [totalSessions, totalCommands, successfulLogins, failedLogins, uniqueIpRows, topCommandsRows, topUsernames, topPasswords] =
      await repo.getOverviewStats(startDate, endDate)

    const timeline = await repo.getSessionTimeline(timezone, startDate, endDate, range === 'day' ? 'hour' : 'day' as TimelineBucket)

    return {
      totalSessions,
      totalCommands,
      uniqueIps: toNumber((uniqueIpRows as CountRow[])[0]?.count),
      successfulLogins,
      failedLogins,
      topCommands: (topCommandsRows as CommandRow[]).map(r => ({ command: r.command, count: toNumber(r.count) })),
      topUsernames: (topUsernames as GroupedUsernameRow[]).filter(r => Boolean(r.username)).map(r => ({ username: r.username!, count: toNumber(r._count.username) })),
      topPasswords: (topPasswords as GroupedPasswordRow[]).filter(r => Boolean(r.password)).map(r => ({ password: r.password!, count: toNumber(r._count.password) })),
      timeline: timeline.map(r => ({ bucketStart: r.bucketStart, label: r.label, sessions: r.sessions, successfulLogins: r.successfulLogins })),
    }
  })
}

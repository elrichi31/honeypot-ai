import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

interface SshOverviewRow { sessions: bigint; uniqueIps: bigint; successfulLogins: bigint; lastSeen: Date | null }
interface WebOverviewRow { hits: bigint; uniqueIps: bigint; lastSeen: Date | null }
interface WebTopAttackRow { attackType: string }
interface ProtocolOverviewRow { protocol: string; count: bigint; uniqueIps: bigint; authAttempts: bigint; lastSeen: Date | null }

export async function miscRoutes(fastify: FastifyInstance) {
  fastify.get('/stats/honeypot-overview', async () => {
    const [sshRows, webRows, webTopAttackRows, protocolRows] = await Promise.all([
      fastify.prisma.$queryRaw<SshOverviewRow[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS sessions,
               COUNT(DISTINCT src_ip)::bigint AS "uniqueIps",
               COUNT(*) FILTER (WHERE login_success IS TRUE)::bigint AS "successfulLogins",
               MAX(started_at) AS "lastSeen"
        FROM sessions
      `),
      fastify.prisma.$queryRaw<WebOverviewRow[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS hits,
               COUNT(DISTINCT src_ip)::bigint AS "uniqueIps",
               MAX(timestamp) AS "lastSeen"
        FROM web_hits
      `),
      fastify.prisma.$queryRaw<WebTopAttackRow[]>(Prisma.sql`
        SELECT attack_type AS "attackType"
        FROM web_hits
        GROUP BY attack_type
        ORDER BY COUNT(*) DESC
        LIMIT 1
      `),
      fastify.prisma.$queryRaw<ProtocolOverviewRow[]>(Prisma.sql`
        SELECT protocol,
               COUNT(*)::bigint AS count,
               COUNT(DISTINCT src_ip)::bigint AS "uniqueIps",
               COUNT(*) FILTER (WHERE event_type = 'auth')::bigint AS "authAttempts",
               MAX(timestamp) AS "lastSeen"
        FROM protocol_hits
        GROUP BY protocol
        ORDER BY COUNT(*) DESC
      `),
    ])

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
      ssh: {
        sessions: sshCount,
        uniqueIps: Number(ssh.uniqueIps),
        successfulLogins: Number(ssh.successfulLogins),
        lastSeen: ssh.lastSeen?.toISOString() ?? null,
      },
      web: {
        hits: webCount,
        uniqueIps: Number(web.uniqueIps),
        topAttackType: webTopAttackRows[0]?.attackType ?? null,
        lastSeen: web.lastSeen?.toISOString() ?? null,
      },
      protocols: protocolRows.map(r => ({
        protocol: r.protocol,
        count: Number(r.count),
        uniqueIps: Number(r.uniqueIps),
        authAttempts: Number(r.authAttempts),
        lastSeen: r.lastSeen?.toISOString() ?? null,
      })),
      totals: {
        events: sshCount + webCount + protocolCount,
        activeSources,
      },
    }
  })


  fastify.get('/stats/geo', async () => {
    return fastify.prisma.$queryRaw<{ srcIp: string; loginSuccess: boolean | null }[]>(Prisma.sql`
      SELECT src_ip AS "srcIp", BOOL_OR(login_success IS TRUE) AS "loginSuccess"
      FROM sessions GROUP BY src_ip
    `)
  })

  fastify.get('/stats/session-commands', async (request) => {
    const { limit = '500' } = request.query as Record<string, string>
    const events = await fastify.prisma.event.findMany({
      where: { eventType: 'command.input', command: { not: null } },
      select: { sessionId: true, command: true },
      take: Math.min(Number(limit), 5000),
      orderBy: { eventTs: 'asc' },
    })
    const result: Record<string, string[]> = {}
    for (const e of events) {
      if (!e.command) continue
      if (!result[e.sessionId]) result[e.sessionId] = []
      result[e.sessionId].push(e.command)
    }
    return result
  })

  fastify.get('/stats/heatmap', async (request) => {
    const query = request.query as Record<string, string | undefined>
    const timezone = query.timezone || 'UTC'
    const days = Math.min(Math.max(parseInt(query.days || '90', 10), 1), 365)

    interface HeatmapRow { dow: number; hour: number; count: bigint }
    const rows = await fastify.prisma.$queryRaw<HeatmapRow[]>(Prisma.sql`
      SELECT EXTRACT(DOW  FROM started_at AT TIME ZONE ${timezone})::int AS dow,
             EXTRACT(HOUR FROM started_at AT TIME ZONE ${timezone})::int AS hour,
             COUNT(*)::bigint AS count
      FROM sessions WHERE started_at >= NOW() - (${days} || ' days')::interval
      GROUP BY dow, hour ORDER BY dow, hour
    `)

    const cells = rows.map(r => ({ dow: r.dow, hour: r.hour, count: Number(r.count) }))
    const maxCount = cells.reduce((m, c) => Math.max(m, c.count), 0)
    const totalSessions = cells.reduce((s, c) => s + c.count, 0)
    const hourTotals = Array.from({ length: 24 }, (_, h) => cells.filter(c => c.hour === h).reduce((s, c) => s + c.count, 0))

    return { cells, maxCount, totalSessions, hourTotals, days }
  })
}

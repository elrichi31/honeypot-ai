import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'

export async function miscRoutes(fastify: FastifyInstance) {
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

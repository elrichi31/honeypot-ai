import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { withCache } from '../../lib/cache-helper.js'

const NOVELTY_TTL = 300
const DEFAULT_HOURS = 24

export async function noveltyRoute(fastify: FastifyInstance) {
  fastify.get('/stats/novelty', (request) => {
    const q = request.query as Record<string, string | undefined>
    const hours = Math.min(Math.max(Number(q.hours) || DEFAULT_HOURS, 1), 168)
    const cacheKey = `stats:novelty:${hours}`

    return withCache(fastify.cache, cacheKey, NOVELTY_TTL, async () => {
      const windowStart = new Date(Date.now() - hours * 60 * 60 * 1000)
      // "before the window" — anything older than hours is the baseline
      const baselineEnd = windowStart

      type CountRow = { count: bigint }

      // New IPs: seen in the window but NOT before it (across all three tables).
      const newIps = await fastify.prismaRead.$queryRaw<CountRow[]>(Prisma.sql`
        WITH window_ips AS (
          SELECT DISTINCT src_ip FROM sessions      WHERE started_at >= ${windowStart}
          UNION
          SELECT DISTINCT src_ip FROM web_hits      WHERE timestamp  >= ${windowStart}
          UNION
          SELECT DISTINCT src_ip FROM protocol_hits WHERE timestamp  >= ${windowStart}
        ),
        seen_before AS (
          SELECT DISTINCT src_ip FROM sessions      WHERE started_at < ${baselineEnd}
          UNION
          SELECT DISTINCT src_ip FROM web_hits      WHERE timestamp  < ${baselineEnd}
          UNION
          SELECT DISTINCT src_ip FROM protocol_hits WHERE timestamp  < ${baselineEnd}
        )
        SELECT COUNT(*)::bigint AS count
        FROM window_ips
        WHERE src_ip NOT IN (SELECT src_ip FROM seen_before)
      `)

      // New credential pairs: (username, password) seen in the window for the
      // first time ever (not in the materialized view before the window start).
      const newCredPairs = await fastify.prismaRead.$queryRaw<CountRow[]>(Prisma.sql`
        WITH window_creds AS (
          SELECT DISTINCT username, password
          FROM credential_attempts
          WHERE event_ts >= ${windowStart}
            AND username IS NOT NULL AND password IS NOT NULL
        ),
        baseline_creds AS (
          SELECT DISTINCT username, password
          FROM credential_attempts
          WHERE event_ts < ${baselineEnd}
            AND username IS NOT NULL AND password IS NOT NULL
        )
        SELECT COUNT(*)::bigint AS count
        FROM window_creds w
        WHERE NOT EXISTS (
          SELECT 1 FROM baseline_creds b
          WHERE b.username = w.username AND b.password = w.password
        )
      `)

      // New web paths: paths hit for the first time in the window.
      const newWebPaths = await fastify.prismaRead.$queryRaw<CountRow[]>(Prisma.sql`
        WITH window_paths AS (
          SELECT DISTINCT path FROM web_hits WHERE timestamp >= ${windowStart}
        ),
        baseline_paths AS (
          SELECT DISTINCT path FROM web_hits WHERE timestamp < ${baselineEnd}
        )
        SELECT COUNT(*)::bigint AS count
        FROM window_paths
        WHERE path NOT IN (SELECT path FROM baseline_paths)
      `)

      // New Cowrie commands seen in the window for the first time ever.
      const newCommands = await fastify.prismaRead.$queryRaw<CountRow[]>(Prisma.sql`
        WITH window_cmds AS (
          SELECT DISTINCT command FROM events
          WHERE event_type = 'command.input' AND event_ts >= ${windowStart} AND command IS NOT NULL
        ),
        baseline_cmds AS (
          SELECT DISTINCT command FROM events
          WHERE event_type = 'command.input' AND event_ts < ${baselineEnd} AND command IS NOT NULL
        )
        SELECT COUNT(*)::bigint AS count
        FROM window_cmds
        WHERE command NOT IN (SELECT command FROM baseline_cmds)
      `)

      // Top-5 new IPs (for the detail list shown in the card).
      type NewIpRow = { srcIp: string; hits: bigint }
      const topNewIps = await fastify.prismaRead.$queryRaw<NewIpRow[]>(Prisma.sql`
        WITH window_ips AS (
          SELECT src_ip, COUNT(*) AS hits FROM (
            SELECT src_ip FROM sessions      WHERE started_at >= ${windowStart}
            UNION ALL
            SELECT src_ip FROM web_hits      WHERE timestamp  >= ${windowStart}
            UNION ALL
            SELECT src_ip FROM protocol_hits WHERE timestamp  >= ${windowStart}
          ) u GROUP BY src_ip
        ),
        seen_before AS (
          SELECT DISTINCT src_ip FROM sessions      WHERE started_at < ${baselineEnd}
          UNION
          SELECT DISTINCT src_ip FROM web_hits      WHERE timestamp  < ${baselineEnd}
          UNION
          SELECT DISTINCT src_ip FROM protocol_hits WHERE timestamp  < ${baselineEnd}
        )
        SELECT src_ip AS "srcIp", hits
        FROM window_ips
        WHERE src_ip NOT IN (SELECT src_ip FROM seen_before)
        ORDER BY hits DESC
        LIMIT 5
      `)

      return {
        windowHours: hours,
        newIps: Number(newIps[0]?.count ?? 0n),
        newCredPairs: Number(newCredPairs[0]?.count ?? 0n),
        newWebPaths: Number(newWebPaths[0]?.count ?? 0n),
        newCommands: Number(newCommands[0]?.count ?? 0n),
        topNewIps: topNewIps.map((r) => ({ srcIp: r.srcIp, hits: Number(r.hits) })),
      }
    })
  })
}

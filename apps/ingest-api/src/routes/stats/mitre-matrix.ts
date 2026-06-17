import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { withCache } from '../../lib/cache-helper.js'
import { parseSensorScope } from '../../lib/sensor-scope.js'
import {
  TECHNIQUE_META,
  TACTIC_ORDER,
  mapWebAttack,
  mapProtocolHit,
  mapSshEvent,
  mapSuricataCategory,
  type Tactic,
} from '../../lib/mitre.js'

const MITRE_TTL = 900
const DEFAULT_DAYS = 90

export async function mitreMatrixRoute(fastify: FastifyInstance) {
  fastify.get('/stats/mitre-matrix', (request) => {
    const q = request.query as Record<string, string | undefined>
    const days = Math.min(Math.max(Number(q.days) || DEFAULT_DAYS, 1), 365)
    const scope = parseSensorScope(request.query as Record<string, unknown>)
    const cacheKey = `stats:mitre-matrix:${days}:${scope.cacheSuffix}`
    // events has no sensor_id; scope it via its parent session.
    const eventsScope = scope.all
      ? Prisma.empty
      : Prisma.sql`AND session_id IN (SELECT id FROM sessions WHERE true ${scope.cond('sensor_id')})`

    return withCache(fastify.cache, cacheKey, MITRE_TTL, async () => {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

      // Cheap GROUP BYs in SQL; map to techniques in JS over the aggregates.
      const [webRows, protoRows, sshRows, suricataRows] = await Promise.all([
        fastify.prismaRead.$queryRaw<{ attackType: string; count: bigint }[]>(Prisma.sql`
          SELECT attack_type AS "attackType", COUNT(*)::bigint AS count
          FROM web_hits WHERE timestamp >= ${cutoff} ${scope.cond('sensor_id')}
          GROUP BY attack_type
        `),
        fastify.prismaRead.$queryRaw<{ protocol: string; eventType: string; count: bigint }[]>(Prisma.sql`
          SELECT protocol, event_type AS "eventType", COUNT(*)::bigint AS count
          FROM protocol_hits WHERE timestamp >= ${cutoff} ${scope.cond('sensor_id')}
          GROUP BY protocol, event_type
        `),
        // SSH: split command rows that look like tool transfers from the rest,
        // so wget/curl land on T1105 without scanning every row.
        fastify.prismaRead.$queryRaw<{ eventType: string; isTransfer: boolean; count: bigint }[]>(Prisma.sql`
          SELECT event_type AS "eventType",
                 (command ~* '\\m(wget|curl|tftp|scp)\\M') AS "isTransfer",
                 COUNT(*)::bigint AS count
          FROM events WHERE event_ts >= ${cutoff} ${eventsScope}
          GROUP BY event_type, "isTransfer"
        `),
        fastify.prismaRead.$queryRaw<{ category: string; count: bigint }[]>(Prisma.sql`
          SELECT category, COUNT(*)::bigint AS count
          FROM suricata_alerts WHERE timestamp >= ${cutoff} ${scope.cond('sensor_id')}
          GROUP BY category
        `),
      ])

      const techniqueCounts = new Map<string, number>()
      const add = (id: string | null, count: bigint) => {
        if (!id) return
        techniqueCounts.set(id, (techniqueCounts.get(id) ?? 0) + Number(count))
      }

      for (const r of webRows) add(mapWebAttack(r.attackType), r.count)
      for (const r of protoRows) add(mapProtocolHit(r.protocol, r.eventType), r.count)
      for (const r of sshRows) {
        const command = r.isTransfer ? 'wget' : null
        add(mapSshEvent(r.eventType, command), r.count)
      }
      for (const r of suricataRows) add(mapSuricataCategory(r.category), r.count)

      // Group techniques under their tactic, preserving kill-chain column order.
      const byTactic = new Map<Tactic, { id: string; name: string; count: number }[]>()
      for (const [id, count] of techniqueCounts) {
        const meta = TECHNIQUE_META[id]
        if (!meta) continue
        if (!byTactic.has(meta.tactic)) byTactic.set(meta.tactic, [])
        byTactic.get(meta.tactic)!.push({ id, name: meta.name, count })
      }

      const tactics = TACTIC_ORDER.filter((t) => byTactic.has(t)).map((tactic) => ({
        tactic,
        techniques: byTactic.get(tactic)!.sort((a, b) => b.count - a.count),
      }))

      const total = Array.from(techniqueCounts.values()).reduce((s, c) => s + c, 0)
      return { tactics, total }
    })
  })
}

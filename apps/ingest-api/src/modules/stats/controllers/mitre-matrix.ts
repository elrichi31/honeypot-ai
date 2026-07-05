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
import { MitreRepository } from '../../modules/stats/stats.repository.js'

const MITRE_TTL = 900
const DEFAULT_DAYS = 90

export async function mitreMatrixRoute(fastify: FastifyInstance) {
  const repo = new MitreRepository(fastify.prismaRead)

  fastify.get('/stats/mitre-matrix', (request) => {
    const q = request.query as Record<string, string | undefined>
    const days = Math.min(Math.max(Number(q.days) || DEFAULT_DAYS, 1), 365)
    const scope = parseSensorScope(request.query as Record<string, unknown>)
    const cacheKey = `stats:mitre-matrix:${days}:${scope.cacheSuffix}`

    return withCache(fastify.cache, cacheKey, MITRE_TTL, async () => {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      const [webRows, protoRows, sshRows, suricataRows] = await repo.getMitreData(scope, cutoff)

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

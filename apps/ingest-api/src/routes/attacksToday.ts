import type { FastifyInstance } from 'fastify'
import { lookupGeo } from '../lib/geo.js'
import { withCache } from '../lib/cache-helper.js'

type SessionRow = { src_ip: string; count: bigint }
type WebRow = { src_ip: string; count: bigint }
type ProtocolRow = { src_ip: string; protocol: string; count: bigint }
type SensorRow = { sensor_id: string; ip: string; protocol: string }

export async function attacksTodayRoutes(fastify: FastifyInstance) {
  fastify.get('/attacks/today', async (_request, reply) => {
    const attackedCountries = await withCache(fastify.cache, 'attacks:today:countries', 600, async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

      const [sshRows, webRows, protocolRows] = await Promise.all([
        fastify.prisma.$queryRaw<SessionRow[]>`
          SELECT src_ip, COUNT(*)::bigint AS count
          FROM sessions
          WHERE started_at >= ${since}
          GROUP BY src_ip
        `,
        fastify.prisma.$queryRaw<WebRow[]>`
          SELECT src_ip, COUNT(*)::bigint AS count
          FROM web_hits
          WHERE timestamp >= ${since}
          GROUP BY src_ip
        `,
        fastify.prisma.$queryRaw<ProtocolRow[]>`
          SELECT src_ip, protocol, COUNT(*)::bigint AS count
          FROM protocol_hits
          WHERE timestamp >= ${since}
          GROUP BY src_ip, protocol
        `,
      ])

      const countryMap = new Map<string, {
        lat: number; lng: number; country: string; count: number; type: string
      }>()

      const allAttacks: Array<{ src_ip: string; type: string; count: number }> = [
        ...sshRows.map(r => ({ src_ip: r.src_ip, type: 'ssh', count: Number(r.count) })),
        ...webRows.map(r => ({ src_ip: r.src_ip, type: 'http', count: Number(r.count) })),
        ...protocolRows.map(r => ({ src_ip: r.src_ip, type: r.protocol, count: Number(r.count) })),
      ]

      for (const row of allAttacks) {
        const geo = lookupGeo(row.src_ip)
        if (!geo || !geo.country) continue
        const key = geo.country
        const existing = countryMap.get(key)
        if (!existing) {
          countryMap.set(key, { lat: geo.lat, lng: geo.lng, country: key, count: row.count, type: row.type })
        } else {
          const newCount = existing.count + row.count
          if (row.count > existing.count) existing.type = row.type
          existing.count = newCount
        }
      }

      return Array.from(countryMap.values())
    })

    const sensors = await fastify.prisma.$queryRaw<SensorRow[]>`
      SELECT sensor_id, ip, protocol
      FROM sensors
      WHERE ip IS NOT NULL AND ip <> '' AND ip <> '-'
    `

    const sensorLocations = sensors
      .map(sensor => {
        const geo = lookupGeo(sensor.ip)
        return geo
          ? {
              sensorId: sensor.sensor_id,
              ip: sensor.ip,
              protocol: sensor.protocol,
              lat: geo.lat,
              lng: geo.lng,
              country: geo.country,
            }
          : null
      })
      .filter((sensor): sensor is NonNullable<typeof sensor> => sensor !== null)

    return reply.send({
      attackedCountries,
      sensors: sensorLocations,
    })
  })
}

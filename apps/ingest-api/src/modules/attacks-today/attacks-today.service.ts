import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { lookupGeo } from '../../lib/geo.js'
import { withCache } from '../../lib/cache-helper.js'
import { AttacksTodayRepository } from './attacks-today.repository.js'

export class AttacksTodayService {
  private repo: AttacksTodayRepository

  constructor(prisma: PrismaClient) {
    this.repo = new AttacksTodayRepository(prisma)
  }

  private async getAttackedCountries() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const { sshRows, webRows, protocolRows, idsRows } = await this.repo.getAttacksSince(since)

    const countryMap = new Map<string, {
      lat: number; lng: number; country: string; count: number; type: string
    }>()

    const allAttacks: Array<{ src_ip: string; type: string; count: number }> = [
      ...sshRows.map(r => ({ src_ip: r.src_ip, type: 'ssh', count: Number(r.count) })),
      ...webRows.map(r => ({ src_ip: r.src_ip, type: 'http', count: Number(r.count) })),
      ...protocolRows.map(r => ({ src_ip: r.src_ip, type: r.protocol, count: Number(r.count) })),
      ...idsRows.map(r => ({ src_ip: r.src_ip, type: 'ids', count: Number(r.count) })),
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
  }

  private async getSensorLocations() {
    const sensors = await this.repo.getSensorLocations()
    return sensors
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
  }

  async getToday(cache: FastifyInstance['cache']) {
    const [attackedCountries, sensors] = await Promise.all([
      withCache(cache, 'attacks:today:countries', 600, () => this.getAttackedCountries()),
      this.getSensorLocations(),
    ])
    return { attackedCountries, sensors }
  }
}

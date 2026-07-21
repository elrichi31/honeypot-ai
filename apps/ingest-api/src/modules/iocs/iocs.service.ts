import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { IocsRepository, IOCS_WINDOW_DAYS } from './iocs.repository.js'
import { extractIocsFromCommands, type C2Indicator, type PlantedSshKey } from '../../lib/ioc-extract.js'
import { withCache } from '../../lib/cache-helper.js'
import type { SensorScope } from '../../lib/sensor-scope.js'

export type C2IndicatorWithSrc = C2Indicator & { srcIp: string; firstSeen: string }
export type PlantedSshKeyWithSrc = PlantedSshKey & { srcIp: string; firstSeen: string }

export type AggregatedIocs = {
  c2: C2IndicatorWithSrc[]
  sshKeys: PlantedSshKeyWithSrc[]
}

export class IocsService {
  private repo: IocsRepository

  constructor(prismaRead: PrismaClient) {
    this.repo = new IocsRepository(prismaRead)
  }

  async listAggregatedIocs(
    cache: FastifyInstance['cache'],
    windowDays = IOCS_WINDOW_DAYS,
    scope?: SensorScope,
  ): Promise<AggregatedIocs> {
    return withCache(cache, `iocs:aggregated:w=${windowDays}:${scope?.cacheSuffix ?? 'all'}`, 180, async () => {
      const rows = await this.repo.queryCommandRowsForIocs(windowDays, scope)

      const c2 = new Map<string, C2IndicatorWithSrc>()
      const sshKeys = new Map<string, PlantedSshKeyWithSrc>()

      for (const row of rows) {
        const firstSeen = row.event_ts.toISOString()
        const extracted = extractIocsFromCommands([row.command])

        for (const ind of extracted.c2) {
          const existing = c2.get(ind.value)
          if (!existing || firstSeen < existing.firstSeen) {
            c2.set(ind.value, { ...ind, srcIp: row.src_ip, firstSeen })
          }
        }
        for (const key of extracted.sshKeys) {
          const existing = sshKeys.get(key.fingerprint)
          if (!existing || firstSeen < existing.firstSeen) {
            sshKeys.set(key.fingerprint, { ...key, srcIp: row.src_ip, firstSeen })
          }
        }
      }

      return { c2: [...c2.values()], sshKeys: [...sshKeys.values()] }
    })
  }
}

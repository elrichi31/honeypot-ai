import type { PrismaClient } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { IocsRepository, IOCS_WINDOW_DAYS } from './iocs.repository.js'
import { extractIocsFromCommands, type C2Indicator, type PlantedSshKey } from '../../lib/ioc-extract.js'
import { withCache } from '../../lib/cache-helper.js'
import type { SensorScope } from '../../lib/sensor-scope.js'

export type C2IndicatorWithSrc = C2Indicator & { srcIp: string; firstSeen: string }
export type PlantedSshKeyWithSrc = PlantedSshKey & { srcIp: string; firstSeen: string }

export type CredentialIoc = {
  username: string
  password: string
  attempts: number
  uniqueIps: number
  firstSeen: string
}

export type HasshIoc = {
  hassh: string
  sessions: number
  uniqueIps: number
  firstSeen: string
  sampleClient: string | null
}

export type AggregatedIocs = {
  c2: C2IndicatorWithSrc[]
  sshKeys: PlantedSshKeyWithSrc[]
  credentials: CredentialIoc[]
  hassh: HasshIoc[]
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
      const [rows, credRows, hasshRows] = await Promise.all([
        this.repo.queryCommandRowsForIocs(windowDays, scope),
        this.repo.queryCredentials(windowDays, scope),
        this.repo.queryHasshFingerprints(windowDays, scope),
      ])

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

      const credentials: CredentialIoc[] = credRows.map(r => ({
        username: r.username,
        password: r.password,
        attempts: Number(r.attempts),
        uniqueIps: Number(r.unique_ips),
        firstSeen: r.first_seen.toISOString(),
      }))

      const hassh: HasshIoc[] = hasshRows.map(r => ({
        hassh: r.hassh,
        sessions: Number(r.sessions),
        uniqueIps: Number(r.unique_ips),
        firstSeen: r.first_seen.toISOString(),
        sampleClient: r.sample_client,
      }))

      return { c2: [...c2.values()], sshKeys: [...sshKeys.values()], credentials, hassh }
    })
  }
}

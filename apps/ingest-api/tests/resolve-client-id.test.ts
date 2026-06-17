import { describe, expect, it } from 'vitest'
import { resolveClientId } from '../src/lib/threat-alerts.js'
import type { PrismaClient } from '@prisma/client'

// Minimal prisma stub: resolveClientId only uses $queryRaw. We return canned
// rows based on what the call looks like, so we exercise the routing logic
// (sensor key vs IP key vs no-match) without a real database.
function stubPrisma(rows: Array<{ client_id: string | null }>): PrismaClient {
  return { $queryRaw: async () => rows } as unknown as PrismaClient
}

describe('resolveClientId', () => {
  it('resolves a client from a sensor-offline key', async () => {
    const prisma = stubPrisma([{ client_id: 'client-a' }])
    expect(await resolveClientId(prisma, 'sensor-offline:cowrie-ssh-01')).toBe('client-a')
  })

  it('resolves a client from an IP-bearing key (threat_score:<ip>)', async () => {
    const prisma = stubPrisma([{ client_id: 'client-b' }])
    expect(await resolveClientId(prisma, 'threat_score:45.249.247.86')).toBe('client-b')
  })

  it('returns null when the key carries no valid IP', async () => {
    const prisma = stubPrisma([])
    expect(await resolveClientId(prisma, 'multi_service:not-an-ip')).toBeNull()
  })

  it('returns null when nothing matches', async () => {
    const prisma = stubPrisma([])
    expect(await resolveClientId(prisma, 'threat_score:1.2.3.4')).toBeNull()
  })

  it('never throws — a query error resolves to null', async () => {
    const prisma = { $queryRaw: async () => { throw new Error('db down') } } as unknown as PrismaClient
    expect(await resolveClientId(prisma, 'threat_score:1.2.3.4')).toBeNull()
  })
})

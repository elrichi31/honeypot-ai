import type { CommandCategory, RiskInput } from './risk-constants.js'
import {
  SSH_AUTH_ATTEMPTS_DIVISOR,
  SSH_AUTH_ATTEMPTS_CAP,
  SSH_AUTH_HIGH_THRESHOLD,
  SUCCESS_LOGIN_BONUS,
  CMD_BACKDOOR_PTS,
  CMD_HONEYPOT_EVASION_PTS,
  CMD_CONTAINER_ESCAPE_PTS,
  CMD_MALWARE_DROP_PTS,
  CMD_PERSISTENCE_PTS,
  CMD_LATERAL_MOVEMENT_PTS,
  CMD_CRYPTO_MINING_PTS,
  CMD_DATA_EXFIL_PTS,
  CMD_SOLANA_TARGETING_PTS,
  CMD_RECON_PTS,
  WEB_TYPE_POINTS,
  WEB_SERIOUS_TYPES,
  PORT_SCAN_PTS_MAX,
  PORT_SCAN_PTS_MIN,
  PORT_SCAN_PORTS_DIVISOR,
  PROTOCOL_AUTH_PTS_CAP,
  PROTOCOL_AUTH_ATTEMPTS_DIVISOR,
  PROTOCOL_AUTH_HIGH_THRESHOLD,
  PROTOCOL_CMD_PTS_CAP,
  PROTOCOL_CMD_PTS_MULTIPLIER,
  PROTOCOL_CONNECT_REPEAT_THRESHOLD,
  PROTOCOL_CONNECT_REPEAT_PTS,
  PROTOCOL_CREDENTIAL_REUSE_PTS,
  PROTOCOL_COMPRESSED_WINDOW_MINUTES,
  PROTOCOL_COMPRESSED_MIN_FAMILIES,
  PROTOCOL_COMPRESSED_PTS,
  CROSS_PROTO_BASE_PTS,
  CROSS_PROTO_MIN_FAMILIES,
  CROSS_PROTO_PER_EXTRA_FAMILY_PTS,
  CROSS_PROTO_EXTRA_CAP,
} from './risk-constants.js'

export interface FactorResult {
  points: number
  factors: string[]
}

export function scoreSshFactor(input: RiskInput): FactorResult {
  const factors: string[] = []
  let points = 0

  if (input.sshSessions === 0) return { points, factors }

  const attemptPts = Math.min(Math.floor(input.sshAuthAttempts / SSH_AUTH_ATTEMPTS_DIVISOR), SSH_AUTH_ATTEMPTS_CAP)
  points += attemptPts
  if (attemptPts >= SSH_AUTH_HIGH_THRESHOLD) {
    factors.push(`${input.sshAuthAttempts} SSH auth attempts`)
  }

  if (input.sshLoginSuccess) {
    points += SUCCESS_LOGIN_BONUS
    factors.push("SSH login successful")
  }

  return { points, factors }
}

export function scoreCommandsFactor(cats: Record<CommandCategory, string[]>): FactorResult {
  const factors: string[] = []
  let points = 0

  const commandScores: [keyof typeof cats, number, string][] = [
    ["ssh_backdoor",      CMD_BACKDOOR_PTS,          "SSH backdoor installation"],
    ["honeypot_evasion",  CMD_HONEYPOT_EVASION_PTS,  "Honeypot or sandbox evasion"],
    ["container_escape",  CMD_CONTAINER_ESCAPE_PTS,  "Container escape attempt"],
    ["malware_drop",      CMD_MALWARE_DROP_PTS,       "Malware dropper commands"],
    ["persistence",       CMD_PERSISTENCE_PTS,        "Persistence mechanisms"],
    ["lateral_movement",  CMD_LATERAL_MOVEMENT_PTS,   "Lateral movement"],
    ["crypto_mining",     CMD_CRYPTO_MINING_PTS,      "Crypto miner deployment"],
    ["data_exfil",        CMD_DATA_EXFIL_PTS,         "Data exfiltration or log wiping"],
    ["solana_targeting",  CMD_SOLANA_TARGETING_PTS,   "Solana validator or infrastructure targeting"],
    ["recon",             CMD_RECON_PTS,              "Recon commands"],
  ]

  for (const [category, pts, label] of commandScores) {
    if (cats[category].length > 0) {
      points += pts
      factors.push(label)
    }
  }

  return { points, factors }
}

export function scoreWebFactor(input: RiskInput): FactorResult {
  const factors: string[] = []
  let points = 0

  const uniqueWebTypes = [...new Set(input.webAttackTypes)]
  for (const attackType of uniqueWebTypes) {
    points += WEB_TYPE_POINTS[attackType] ?? 0
  }

  const seriousTypes = uniqueWebTypes.filter((t) => (WEB_SERIOUS_TYPES as readonly string[]).includes(t))
  if (seriousTypes.length > 0) {
    factors.push(`Web attack: ${seriousTypes.join(", ")}`)
  }

  return { points, factors }
}

export function scoreProtocolsFactor(input: RiskInput, hasPortScan: boolean): FactorResult {
  const factors: string[] = []
  let points = 0

  if (hasPortScan) {
    const portScanPts = Math.min(PORT_SCAN_PTS_MAX, Math.max(PORT_SCAN_PTS_MIN, Math.ceil(input.protocolUniquePorts / PORT_SCAN_PORTS_DIVISOR)))
    points += portScanPts
    if (input.protocolUniquePorts > 0) {
      const plural = input.protocolUniquePorts === 1 ? "" : "s"
      factors.push(`Port scan across ${input.protocolUniquePorts} port${plural}`)
    }
  }

  if (input.protocolAuthAttempts > 0) {
    const authPts = Math.min(PROTOCOL_AUTH_PTS_CAP, Math.ceil(input.protocolAuthAttempts / PROTOCOL_AUTH_ATTEMPTS_DIVISOR))
    points += authPts
    if (input.protocolAuthAttempts >= PROTOCOL_AUTH_HIGH_THRESHOLD) {
      factors.push(`${input.protocolAuthAttempts} service auth attempts`)
    }
  }

  if (input.protocolCommandCount > 0) {
    const commandPts = Math.min(PROTOCOL_CMD_PTS_CAP, input.protocolCommandCount * PROTOCOL_CMD_PTS_MULTIPLIER)
    points += commandPts
    factors.push("Post-auth activity in service honeypots")
  }

  if (input.protocolConnectCount >= PROTOCOL_CONNECT_REPEAT_THRESHOLD && !hasPortScan) {
    points += PROTOCOL_CONNECT_REPEAT_PTS
    factors.push("Repeated service probing")
  }

  if (input.credentialReuse) {
    points += PROTOCOL_CREDENTIAL_REUSE_PTS
    factors.push("Credential reuse across service honeypots")
  }

  const serviceFamilyCount = [...new Set(input.protocolsSeen)].length
  const withinBurstWindow = input.timeWindowMinutes !== null && input.timeWindowMinutes <= PROTOCOL_COMPRESSED_WINDOW_MINUTES
  if (withinBurstWindow && serviceFamilyCount >= PROTOCOL_COMPRESSED_MIN_FAMILIES) {
    points += PROTOCOL_COMPRESSED_PTS
    factors.push("Compressed multi-service activity")
  }

  return { points, factors }
}

export function scoreCrossProtocolFactor(serviceFamilyCount: number): FactorResult {
  if (serviceFamilyCount < CROSS_PROTO_MIN_FAMILIES) return { points: 0, factors: [] }

  const extraFamilies = serviceFamilyCount - CROSS_PROTO_MIN_FAMILIES
  const points = CROSS_PROTO_BASE_PTS + Math.min(CROSS_PROTO_EXTRA_CAP, extraFamilies * CROSS_PROTO_PER_EXTRA_FAMILY_PTS)
  const factors = [`Touched ${serviceFamilyCount} service families`]

  return { points, factors }
}

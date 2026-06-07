import { classifyCommands } from './risk-score.js'
import type { CommandCategory, RiskResult } from './risk-score.js'

const WEB_EXPLOIT_TYPES = ['cmdi', 'sqli', 'lfi', 'rfi']

const SUSPICIOUS_COMMAND_CATEGORIES: CommandCategory[] = [
  'ssh_backdoor',
  'honeypot_evasion',
  'container_escape',
  'malware_drop',
  'persistence',
  'lateral_movement',
  'crypto_mining',
  'data_exfil',
  'solana_targeting',
]

export type AlertPayload = {
  key: string
  cooldownMs: number
  level: 'critical' | 'high' | 'info'
  title: string
  description: string
  fields: Array<{ name: string; value: string; inline?: boolean }>
}

export function deriveMultiServiceLevel(familyCount: number): 'HIGH' | 'CRITICAL' | null {
  if (familyCount >= 3) return 'CRITICAL'
  if (familyCount >= 2) return 'HIGH'
  return null
}

export function deriveAuthBurstLevel(totalAuthAttempts: number): 'HIGH' | 'CRITICAL' | null {
  if (totalAuthAttempts >= 12) return 'CRITICAL'
  if (totalAuthAttempts >= 8) return 'HIGH'
  return null
}

export function checkScoreThreshold(
  ip: string,
  risk: RiskResult,
  protocolsSeen: string[],
  cooldownMs: number,
): AlertPayload | null {
  if (risk.level !== 'CRITICAL' && risk.level !== 'HIGH') return null
  return {
    key: `threat_score:${ip}`,
    cooldownMs,
    level: risk.level === 'CRITICAL' ? 'critical' : 'high',
    title: `${risk.level} threat detected`,
    description: `Attacker \`${ip}\` reached **${risk.score}/100** across ${protocolsSeen.length} service family${protocolsSeen.length === 1 ? '' : 'ies'}.`,
    fields: [
      { name: 'IP', value: ip, inline: true },
      { name: 'Risk', value: `${risk.score}/100 (${risk.level})`, inline: true },
      { name: 'Protocols', value: protocolsSeen.map((p) => p.toUpperCase()).join(', ') || 'n/a', inline: false },
      { name: 'Top factors', value: risk.topFactors.join('\n') || 'n/a', inline: false },
    ],
  }
}

export function checkCrossProtocol(
  ip: string,
  recentFamilies: string[],
  cooldownMs: number,
): AlertPayload | null {
  const familyCount = new Set(recentFamilies).size
  const level = deriveMultiServiceLevel(familyCount)
  if (!level) return null
  return {
    key: `multi_service:${ip}`,
    cooldownMs,
    level: level === 'CRITICAL' ? 'critical' : 'high',
    title: 'Multi-service attack correlation',
    description: `Attacker \`${ip}\` touched ${familyCount} service families in the last 10 minutes.`,
    fields: [
      { name: 'IP', value: ip, inline: true },
      { name: 'Families', value: [...new Set(recentFamilies)].map((n) => n.toUpperCase()).join(', '), inline: false },
      { name: 'Window', value: 'Last 10 minutes', inline: true },
    ],
  }
}

export function checkAuthBurst(
  ip: string,
  totalAuthAttempts: number,
  uniqueUsernames: number,
  uniquePasswords: number,
  recentFamilies: string[],
  cooldownMs: number,
): AlertPayload | null {
  const level = deriveAuthBurstLevel(totalAuthAttempts)
  if (!level) return null
  return {
    key: `auth_burst:${ip}`,
    cooldownMs,
    level: level === 'CRITICAL' ? 'critical' : 'high',
    title: 'Authentication burst detected',
    description: `Attacker \`${ip}\` generated ${totalAuthAttempts} auth attempts in the last 5 minutes.`,
    fields: [
      { name: 'IP', value: ip, inline: true },
      { name: 'Attempts', value: String(totalAuthAttempts), inline: true },
      { name: 'Usernames', value: String(uniqueUsernames), inline: true },
      { name: 'Passwords', value: String(uniquePasswords), inline: true },
      { name: 'Protocols', value: [...new Set(recentFamilies)].map((n) => n.toUpperCase()).join(', ') || 'SSH', inline: false },
    ],
  }
}

export function checkPostAuthSuccess(
  ip: string,
  recentLoginSuccesses: number,
  recentCommands: string[],
  cooldownMs: number,
): AlertPayload | null {
  if (recentLoginSuccesses === 0) return null
  const categories = classifyCommands(recentCommands)
  const hasSuspicious = SUSPICIOUS_COMMAND_CATEGORIES.some((cat) => categories[cat].length > 0)
  if (!hasSuspicious) return null
  const indicators = SUSPICIOUS_COMMAND_CATEGORIES
    .filter((cat) => categories[cat].length > 0)
    .map((cat) => `${cat}: ${categories[cat][0]}`)
    .slice(0, 4)
  return {
    key: `post_auth:${ip}`,
    cooldownMs,
    level: 'critical',
    title: 'Successful login followed by malicious activity',
    description: `Attacker \`${ip}\` authenticated and then executed suspicious post-auth commands.`,
    fields: [
      { name: 'IP', value: ip, inline: true },
      { name: 'Window', value: 'Last 20 minutes', inline: true },
      { name: 'Indicators', value: indicators.join('\n') || 'suspicious commands observed', inline: false },
    ],
  }
}

export function hasExploitAuthSequence(input: {
  hasPortScan: boolean
  webAttackTypes: string[]
  totalAuthAttempts: number
}): boolean {
  const hasSeriousWebExploit = input.webAttackTypes.some((t) => WEB_EXPLOIT_TYPES.includes(t))
  return input.hasPortScan && hasSeriousWebExploit && input.totalAuthAttempts > 0
}

export function hasSuspiciousPostAuthActivity(commandCategories: Record<CommandCategory, string[]>): boolean {
  return SUSPICIOUS_COMMAND_CATEGORIES.some((cat) => commandCategories[cat].length > 0)
}

/**
 * Any interaction with a deception (OpenCanary) node is critical: an attacker
 * touching an internal trap node has already gotten past cowrie and is moving
 * laterally. `ip` is the best-effort public IP (correlated from the active cowrie
 * session) or the internal cowrie IP if no session could be matched. The cooldown
 * is keyed by (node, ip) so a sweep of one node doesn't flood Discord.
 */
export function checkDeceptionInteraction(
  ip: string,
  nodeId: string,
  protocol: string,
  eventType: string,
  cooldownMs: number,
  credential?: { username?: string | null; password?: string | null },
): AlertPayload {
  const cred = credential?.username
    ? `${credential.username}${credential.password ? ` / ${credential.password}` : ''}`
    : null
  return {
    key: `deception:${nodeId}:${ip}`,
    cooldownMs,
    level: 'critical',
    title: 'Lateral movement: deception node touched',
    description: `Attacker \`${ip}\` interacted with the internal trap node \`${nodeId}\` over ${protocol.toUpperCase()} — confirmed movement past the SSH honeypot.`,
    fields: [
      { name: 'Attacker IP', value: ip, inline: true },
      { name: 'Trap node', value: nodeId, inline: true },
      { name: 'Service', value: `${protocol.toUpperCase()} (${eventType})`, inline: true },
      ...(cred ? [{ name: 'Credential used', value: cred, inline: false }] : []),
    ],
  }
}

export function checkAttackChain(
  ip: string,
  hasPortScan: boolean,
  webAttackTypes: string[],
  totalAuthAttempts: number,
  cooldownMs: number,
): AlertPayload | null {
  const hasSeriousWebExploit = webAttackTypes.some((t) => WEB_EXPLOIT_TYPES.includes(t))
  if (!hasPortScan || !hasSeriousWebExploit || totalAuthAttempts === 0) return null
  const webTypes = webAttackTypes.filter((t) => WEB_EXPLOIT_TYPES.includes(t))
  return {
    key: `attack_chain:${ip}`,
    cooldownMs,
    level: 'critical',
    title: 'Attack chain detected',
    description: `Attacker \`${ip}\` matched the sequence scan -> exploit -> auth in a short window.`,
    fields: [
      { name: 'IP', value: ip, inline: true },
      { name: 'Web exploit', value: webTypes.join(', ') || 'n/a', inline: true },
      { name: 'Auth attempts', value: String(totalAuthAttempts), inline: true },
      { name: 'Window', value: 'Last 10 minutes', inline: false },
    ],
  }
}

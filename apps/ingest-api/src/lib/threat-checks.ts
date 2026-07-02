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

export interface AlertContext {
  geo?: { country: string; city?: string; org?: string } | null
  sensorId?: string | null
  firstSeen?: Date | null
  lastSeen?: Date | null
  sshSessions?: number
  sshAuthAttempts?: number
  hadSuccess?: boolean
  credentialReuse?: boolean
  webAttackTypes?: string[]
  windowMinutes?: number | null
}

function geoField(ctx: AlertContext): string {
  if (!ctx.geo?.country) return 'Unknown'
  const parts = [ctx.geo.country]
  if (ctx.geo.city) parts.unshift(ctx.geo.city)
  if (ctx.geo.org) parts.push(`(${ctx.geo.org})`)
  return parts.join(', ')
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return 'n/a'
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

function contextFields(ctx: AlertContext): Array<{ name: string; value: string; inline?: boolean }> {
  const fields: Array<{ name: string; value: string; inline?: boolean }> = []
  if (ctx.geo) fields.push({ name: 'Location', value: geoField(ctx), inline: true })
  if (ctx.sensorId) fields.push({ name: 'Sensor', value: ctx.sensorId, inline: true })
  if (ctx.firstSeen || ctx.lastSeen) {
    fields.push({ name: 'First seen', value: fmtDate(ctx.firstSeen), inline: true })
    fields.push({ name: 'Last seen', value: fmtDate(ctx.lastSeen), inline: true })
  }
  return fields
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
  ctx: AlertContext = {},
): AlertPayload | null {
  if (risk.level !== 'CRITICAL' && risk.level !== 'HIGH') return null

  const breakdownStr = [
    risk.breakdown.ssh > 0 ? `SSH: ${risk.breakdown.ssh}` : '',
    risk.breakdown.web > 0 ? `Web: ${risk.breakdown.web}` : '',
    risk.breakdown.protocols > 0 ? `Protocols: ${risk.breakdown.protocols}` : '',
    risk.breakdown.commands > 0 ? `Commands: ${risk.breakdown.commands}` : '',
    risk.breakdown.crossProto > 0 ? `Cross-proto: ${risk.breakdown.crossProto}` : '',
  ].filter(Boolean).join(' | ') || 'n/a'

  // All commands that matched a suspicious category
  const suspiciousCommands = SUSPICIOUS_COMMAND_CATEGORIES
    .flatMap((cat) => (risk.commandCategories[cat] ?? []).slice(0, 2).map((cmd) => `[${cat}] ${cmd}`))
    .slice(0, 6)

  const windowStr = ctx.windowMinutes != null
    ? ctx.windowMinutes >= 60
      ? `${Math.round(ctx.windowMinutes / 60)}h ${ctx.windowMinutes % 60}m`
      : `${ctx.windowMinutes}m`
    : null

  const fields: AlertPayload['fields'] = [
    { name: 'IP', value: ip, inline: true },
    { name: 'Risk', value: `${risk.score}/100 (${risk.level})`, inline: true },
    ...contextFields(ctx),
    { name: 'Score breakdown', value: breakdownStr, inline: false },
    { name: 'Protocols', value: protocolsSeen.map((p) => p.toUpperCase()).join(', ') || 'n/a', inline: true },
  ]

  if (ctx.sshSessions != null) fields.push({ name: 'SSH sessions', value: String(ctx.sshSessions), inline: true })
  if (ctx.hadSuccess) fields.push({ name: '⚠️ Login success', value: 'Yes — attacker gained access', inline: true })
  if (ctx.credentialReuse) fields.push({ name: 'Credential reuse', value: 'Same creds across protocols', inline: true })
  if (ctx.webAttackTypes && ctx.webAttackTypes.length > 0) {
    fields.push({ name: 'Web attack types', value: ctx.webAttackTypes.join(', '), inline: true })
  }
  if (windowStr) fields.push({ name: 'Activity window', value: windowStr, inline: true })
  fields.push({ name: 'Top factors', value: risk.topFactors.join('\n') || 'n/a', inline: false })
  if (suspiciousCommands.length > 0) {
    fields.push({ name: 'Malicious commands', value: suspiciousCommands.join('\n'), inline: false })
  }

  return {
    key: `threat_score:${ip}`,
    cooldownMs,
    level: risk.level === 'CRITICAL' ? 'critical' : 'high',
    title: `${risk.level} threat detected`,
    description: `Attacker \`${ip}\` reached **${risk.score}/100** across ${protocolsSeen.length} service family${protocolsSeen.length === 1 ? '' : 'ies'}.`,
    fields,
  }
}

export function checkCrossProtocol(
  ip: string,
  recentFamilies: string[],
  cooldownMs: number,
  ctx: AlertContext & {
    windowAuthAttempts?: number
    portsScanned?: number
    credentialReuse?: boolean
    webAttackTypes?: string[]
  } = {},
): AlertPayload | null {
  const familyCount = new Set(recentFamilies).size
  const level = deriveMultiServiceLevel(familyCount)
  if (!level) return null

  const fields: AlertPayload['fields'] = [
    { name: 'IP', value: ip, inline: true },
    { name: 'Services hit', value: String(familyCount), inline: true },
    { name: 'Window', value: 'Last 10 minutes', inline: true },
    ...contextFields(ctx),
    { name: 'Families', value: [...new Set(recentFamilies)].map((n) => n.toUpperCase()).join(', '), inline: false },
  ]

  if (ctx.windowAuthAttempts != null && ctx.windowAuthAttempts > 0) {
    fields.push({ name: 'Auth attempts (window)', value: String(ctx.windowAuthAttempts), inline: true })
  }
  if (ctx.portsScanned != null && ctx.portsScanned > 0) {
    fields.push({ name: 'Ports scanned', value: String(ctx.portsScanned), inline: true })
  }
  if (ctx.credentialReuse) {
    fields.push({ name: 'Credential reuse', value: 'Same creds across multiple protocols', inline: false })
  }
  if (ctx.webAttackTypes && ctx.webAttackTypes.length > 0) {
    fields.push({ name: 'Web attacks in window', value: ctx.webAttackTypes.join(', '), inline: true })
  }

  return {
    key: `multi_service:${ip}`,
    cooldownMs,
    level: level === 'CRITICAL' ? 'critical' : 'high',
    title: 'Multi-service attack correlation',
    description: `Attacker \`${ip}\` touched ${familyCount} service families in the last 10 minutes.`,
    fields,
  }
}

export function checkAuthBurst(
  ip: string,
  totalAuthAttempts: number,
  uniqueUsernames: number,
  uniquePasswords: number,
  recentFamilies: string[],
  cooldownMs: number,
  ctx: AlertContext & {
    sshAuthAttempts?: number
    protocolAuthAttempts?: number
    sampleUsernames?: string[]
    loginSuccesses?: number
    portsTargeted?: number[]
  } = {},
): AlertPayload | null {
  const level = deriveAuthBurstLevel(totalAuthAttempts)
  if (!level) return null

  const sshPart = ctx.sshAuthAttempts ?? 0
  const protoPart = ctx.protocolAuthAttempts ?? 0
  const splitStr = sshPart > 0 || protoPart > 0
    ? `SSH: ${sshPart} / Protocols: ${protoPart}`
    : null

  const fields: AlertPayload['fields'] = [
    { name: 'IP', value: ip, inline: true },
    { name: 'Attempts (5 min)', value: String(totalAuthAttempts), inline: true },
    { name: 'Unique usernames', value: String(uniqueUsernames), inline: true },
    { name: 'Unique passwords', value: String(uniquePasswords), inline: true },
    ...contextFields(ctx),
    { name: 'Protocols', value: [...new Set(recentFamilies)].map((n) => n.toUpperCase()).join(', ') || 'SSH', inline: true },
  ]

  if (splitStr) fields.push({ name: 'SSH vs protocols', value: splitStr, inline: true })

  if (ctx.loginSuccesses != null && ctx.loginSuccesses > 0) {
    fields.push({ name: '⚠️ Login success', value: `${ctx.loginSuccesses} successful login(s) in burst`, inline: false })
  }

  if (ctx.sampleUsernames && ctx.sampleUsernames.length > 0) {
    fields.push({ name: 'Sample usernames tried', value: ctx.sampleUsernames.slice(0, 5).join(', '), inline: false })
  }

  if (ctx.portsTargeted && ctx.portsTargeted.length > 0) {
    fields.push({ name: 'Ports targeted', value: ctx.portsTargeted.slice(0, 10).join(', '), inline: false })
  }

  return {
    key: `auth_burst:${ip}`,
    cooldownMs,
    level: level === 'CRITICAL' ? 'critical' : 'high',
    title: 'Authentication burst detected',
    description: `Attacker \`${ip}\` generated ${totalAuthAttempts} auth attempts in the last 5 minutes.`,
    fields,
  }
}

export function checkPostAuthSuccess(
  ip: string,
  recentLoginSuccesses: number,
  recentCommands: string[],
  cooldownMs: number,
  ctx: AlertContext & {
    sshAuthAttempts?: number
    allSuspiciousCommands?: string[]
  } = {},
): AlertPayload | null {
  if (recentLoginSuccesses === 0) return null
  const categories = classifyCommands(recentCommands)
  const hasSuspicious = SUSPICIOUS_COMMAND_CATEGORIES.some((cat) => categories[cat].length > 0)
  if (!hasSuspicious) return null

  // One indicator line per category (first command), up to 6 categories
  const indicators = SUSPICIOUS_COMMAND_CATEGORIES
    .filter((cat) => categories[cat].length > 0)
    .map((cat) => `**${cat}**: \`${categories[cat][0]}\``)
    .slice(0, 6)

  // Additional commands beyond the first per category
  const extraCmds = SUSPICIOUS_COMMAND_CATEGORIES
    .flatMap((cat) => categories[cat].slice(1).map((cmd) => `\`${cmd}\``))
    .slice(0, 8)

  const attemptsBefore = (ctx.sshAuthAttempts ?? 0) - recentLoginSuccesses

  const fields: AlertPayload['fields'] = [
    { name: 'IP', value: ip, inline: true },
    { name: 'Login successes', value: String(recentLoginSuccesses), inline: true },
    { name: 'Window', value: 'Last 20 minutes', inline: true },
    ...contextFields(ctx),
  ]

  if (attemptsBefore > 0) {
    fields.push({ name: 'Attempts before success', value: String(attemptsBefore), inline: true })
  }

  fields.push({ name: 'Categories hit', value: String(indicators.length), inline: true })
  fields.push({ name: 'Indicators', value: indicators.join('\n') || 'suspicious commands observed', inline: false })

  if (extraCmds.length > 0) {
    fields.push({ name: 'Additional commands', value: extraCmds.join('\n'), inline: false })
  }

  return {
    key: `post_auth:${ip}`,
    cooldownMs,
    level: 'critical',
    title: 'Successful login followed by malicious activity',
    description: `Attacker \`${ip}\` authenticated ${recentLoginSuccesses} time(s) and executed suspicious post-auth commands.`,
    fields,
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

export function checkDeceptionInteraction(
  ip: string,
  nodeId: string,
  protocol: string,
  eventType: string,
  cooldownMs: number,
  credential?: { username?: string | null; password?: string | null },
  ctx: AlertContext & {
    interactionTime?: Date | null
    dwellTimeSeconds?: number | null
    sessionId?: string | null
    attributionSource?: 'session' | 'fallback'
  } = {},
): AlertPayload {
  const cred = credential?.username
    ? `${credential.username}${credential.password ? ` / ${credential.password}` : ''}`
    : null

  const fields: AlertPayload['fields'] = [
    { name: 'Attacker IP', value: ip, inline: true },
    { name: 'Trap node', value: nodeId, inline: true },
    { name: 'Service', value: `${protocol.toUpperCase()} (${eventType})`, inline: true },
    ...contextFields(ctx),
  ]

  if (ctx.attributionSource) {
    fields.push({
      name: 'IP attribution',
      value: ctx.attributionSource === 'session' ? 'Correlated from active cowrie session' : '⚠️ Fallback — internal IP (no session match)',
      inline: false,
    })
  }

  if (ctx.interactionTime) {
    fields.push({ name: 'Interaction time', value: fmtDate(ctx.interactionTime), inline: true })
  }

  if (ctx.dwellTimeSeconds != null && ctx.dwellTimeSeconds > 0) {
    const mins = Math.floor(ctx.dwellTimeSeconds / 60)
    const secs = ctx.dwellTimeSeconds % 60
    fields.push({
      name: 'Dwell time',
      value: mins > 0 ? `${mins}m ${secs}s` : `${secs}s`,
      inline: true,
    })
  }

  if (ctx.sessionId) {
    fields.push({ name: 'Cowrie session ID', value: ctx.sessionId, inline: false })
  }

  if (cred) fields.push({ name: 'Credential used', value: cred, inline: false })

  return {
    key: `deception:${nodeId}:${ip}`,
    cooldownMs,
    level: 'critical',
    title: 'Lateral movement: deception node touched',
    description: `Attacker \`${ip}\` interacted with the internal trap node \`${nodeId}\` over ${protocol.toUpperCase()} — confirmed movement past the SSH honeypot.`,
    fields,
  }
}

export function checkCanaryReplay(
  ip: string,
  path: string,
  cooldownMs: number,
  ctx: AlertContext & {
    httpMethod?: string | null
    userAgent?: string | null
    timestamp?: Date | null
    priorAlertKeys?: string[]
  } = {},
): AlertPayload {
  const fields: AlertPayload['fields'] = [
    { name: 'Attacker IP', value: ip, inline: true },
    { name: 'Login path', value: path, inline: true },
    ...contextFields(ctx),
  ]

  if (ctx.httpMethod) fields.push({ name: 'HTTP method', value: ctx.httpMethod, inline: true })
  if (ctx.userAgent) fields.push({ name: 'User-Agent', value: ctx.userAgent.slice(0, 120), inline: false })
  if (ctx.timestamp) fields.push({ name: 'Hit time', value: fmtDate(ctx.timestamp), inline: true })
  if (ctx.priorAlertKeys && ctx.priorAlertKeys.length > 0) {
    fields.push({ name: 'Prior alerts (kill chain)', value: ctx.priorAlertKeys.join('\n'), inline: false })
  }
  fields.push({ name: 'Signal', value: 'Decoy DB credential reuse', inline: false })

  return {
    key: `canary:${ip}`,
    cooldownMs,
    level: 'critical',
    title: 'Canary tripped: leaked DB credentials replayed',
    description: `Attacker \`${ip}\` submitted the leaked database credentials at \`${path}\` — confirms they read the planted \`.env\` and are reusing its secrets.`,
    fields,
  }
}

export function checkAttackChain(
  ip: string,
  hasPortScan: boolean,
  webAttackTypes: string[],
  totalAuthAttempts: number,
  cooldownMs: number,
  ctx: AlertContext & {
    portsScanned?: number
    authSuccess?: boolean
    riskScore?: number
    riskLevel?: string
    allWebAttackTypes?: string[]
  } = {},
): AlertPayload | null {
  const hasSeriousWebExploit = webAttackTypes.some((t) => WEB_EXPLOIT_TYPES.includes(t))
  if (!hasPortScan || !hasSeriousWebExploit || totalAuthAttempts === 0) return null
  const webTypes = webAttackTypes.filter((t) => WEB_EXPLOIT_TYPES.includes(t))

  const fields: AlertPayload['fields'] = [
    { name: 'IP', value: ip, inline: true },
    { name: 'Auth attempts', value: String(totalAuthAttempts), inline: true },
    { name: 'Window', value: 'Last 10 minutes', inline: true },
    ...contextFields(ctx),
    { name: 'Web exploits', value: webTypes.join(', ') || 'n/a', inline: true },
  ]

  if (ctx.portsScanned != null && ctx.portsScanned > 0) {
    fields.push({ name: 'Ports scanned', value: String(ctx.portsScanned), inline: true })
  }

  if (ctx.authSuccess) {
    fields.push({ name: '⚠️ Auth succeeded', value: 'Kill chain reached compromise', inline: false })
  }

  if (ctx.riskScore != null) {
    fields.push({ name: 'Risk score', value: `${ctx.riskScore}/100 (${ctx.riskLevel ?? ''})`, inline: true })
  }

  if (ctx.allWebAttackTypes && ctx.allWebAttackTypes.length > webTypes.length) {
    const extra = ctx.allWebAttackTypes.filter((t) => !WEB_EXPLOIT_TYPES.includes(t))
    if (extra.length > 0) fields.push({ name: 'Additional web activity', value: extra.join(', '), inline: true })
  }

  return {
    key: `attack_chain:${ip}`,
    cooldownMs,
    level: 'critical',
    title: 'Attack chain detected',
    description: `Attacker \`${ip}\` matched the sequence scan → exploit → auth in a short window.`,
    fields,
  }
}

export function checkFirstLoginSuccess(
  ip: string,
  cooldownMs: number,
  ctx: AlertContext & {
    sshAuthAttempts?: number
    sessionId?: string | null
  } = {},
): AlertPayload {
  const fields: AlertPayload['fields'] = [
    { name: 'IP', value: ip, inline: true },
    ...contextFields(ctx),
  ]
  if (ctx.sshAuthAttempts != null) {
    fields.push({ name: 'Attempts before access', value: String(ctx.sshAuthAttempts), inline: true })
  }
  if (ctx.sessionId) {
    fields.push({ name: 'Session ID', value: ctx.sessionId, inline: false })
  }
  return {
    key: `first_login:${ip}`,
    cooldownMs,
    level: 'critical',
    title: 'First successful login from attacker IP',
    description: `Attacker \`${ip}\` gained SSH access for the first time — credential found, honeypot compromised.`,
    fields,
  }
}

// See docs/plans/CORRELATION_ALERTS.md §3.1 — 2 distinct sensors is already a
// real correlation signal multiService can't see (it only counts protocol
// families, not sensor instances); the family axis only raises severity.
export function deriveSweepLevel(sensorsSeen: number, familiesSeen: number): 'HIGH' | 'CRITICAL' | null {
  if (sensorsSeen >= 5 || familiesSeen >= 4) return 'CRITICAL'
  if (sensorsSeen >= 2 || familiesSeen >= 3) return 'HIGH'
  return null
}

// See docs/plans/CORRELATION_ALERTS.md §3.2.
export function derivePortFanoutLevel(distinctPorts: number): 'HIGH' | 'CRITICAL' | null {
  if (distinctPorts >= 15) return 'CRITICAL'
  if (distinctPorts >= 8) return 'HIGH'
  return null
}

// See docs/plans/CORRELATION_ALERTS.md §3.3 — a credential reused across N
// sensors is targeted credential stuffing, not a single service brute-force.
export function deriveCredReuseCrossSensorLevel(maxSensorsForOneCred: number): 'HIGH' | 'CRITICAL' | null {
  if (maxSensorsForOneCred >= 4) return 'CRITICAL'
  if (maxSensorsForOneCred >= 2) return 'HIGH'
  return null
}

export function checkSensorSweep(
  ip: string,
  sensorsSeen: number,
  familiesSeen: number,
  families: string[],
  cooldownMs: number,
  ctx: AlertContext = {},
): AlertPayload | null {
  const level = deriveSweepLevel(sensorsSeen, familiesSeen)
  if (!level) return null

  const fields: AlertPayload['fields'] = [
    { name: 'IP', value: ip, inline: true },
    { name: 'Sensors touched', value: String(sensorsSeen), inline: true },
    { name: 'Window', value: 'Last 10 minutes', inline: true },
    ...contextFields(ctx),
    { name: 'Protocol families', value: [...new Set(families)].map((f) => f.toUpperCase()).join(', ') || 'n/a', inline: false },
  ]

  return {
    key: `sensor_sweep:${ip}`,
    cooldownMs,
    level: level === 'CRITICAL' ? 'critical' : 'high',
    title: 'Sensor sweep detected',
    description: `Attacker \`${ip}\` touched ${sensorsSeen} distinct honeypot sensor${sensorsSeen === 1 ? '' : 's'} in the last 10 minutes — surface reconnaissance across the deployment.`,
    fields,
  }
}

export function checkPortScanFanout(
  ip: string,
  distinctPorts: number,
  ports: number[],
  cooldownMs: number,
  ctx: AlertContext & { sensorsSeen?: number } = {},
): AlertPayload | null {
  const level = derivePortFanoutLevel(distinctPorts)
  if (!level) return null

  const fields: AlertPayload['fields'] = [
    { name: 'IP', value: ip, inline: true },
    { name: 'Distinct ports', value: String(distinctPorts), inline: true },
    { name: 'Window', value: 'Last 10 minutes', inline: true },
    ...contextFields(ctx),
    { name: 'Ports', value: ports.slice(0, 15).join(', ') || 'n/a', inline: false },
  ]

  if (ctx.sensorsSeen != null && ctx.sensorsSeen > 1) {
    fields.push({ name: 'Across sensors', value: String(ctx.sensorsSeen), inline: true })
  }

  return {
    key: `port_fanout:${ip}`,
    cooldownMs,
    level: level === 'CRITICAL' ? 'critical' : 'high',
    title: 'Port-scan fan-out detected',
    description: `Attacker \`${ip}\` touched ${distinctPorts} distinct ports in the last 10 minutes.`,
    fields,
  }
}

function maskPassword(password: string): string {
  return `(${password.length} chars)`
}

export function checkCredReuseCrossSensor(
  ip: string,
  reusedCredentials: Array<{ username: string; password: string; sensors: string[] }>,
  cooldownMs: number,
  ctx: AlertContext = {},
): AlertPayload | null {
  if (reusedCredentials.length === 0) return null
  const top = reusedCredentials[0]
  const level = deriveCredReuseCrossSensorLevel(top.sensors.length)
  if (!level) return null

  const fields: AlertPayload['fields'] = [
    { name: 'IP', value: ip, inline: true },
    { name: 'Credential', value: `user=${top.username} pass=${maskPassword(top.password)}`, inline: true },
    { name: 'Sensors', value: String(top.sensors.length), inline: true },
    { name: 'Window', value: 'Last 20 minutes', inline: true },
    ...contextFields(ctx),
    { name: 'Sensor list', value: top.sensors.join(', '), inline: false },
  ]

  if (reusedCredentials.length > 1) {
    fields.push({ name: 'Other reused credentials', value: String(reusedCredentials.length - 1), inline: true })
  }

  return {
    key: `cred_reuse_cross_sensor:${ip}`,
    cooldownMs,
    level: level === 'CRITICAL' ? 'critical' : 'high',
    title: 'Credential reuse across sensors',
    description: `Attacker \`${ip}\` tried the same credential on ${top.sensors.length} distinct sensors — targeted credential stuffing, not a single-service brute-force.`,
    fields,
  }
}

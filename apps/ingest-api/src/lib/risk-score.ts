/**
 * Risk Score Engine
 *
 * Scores an IP 0–100 based on observed behavior across SSH and HTTP.
 * Each factor contributes points; the total is clamped to 100.
 *
 * Categories:
 *   CRITICAL  80–100
 *   HIGH      60–79
 *   MEDIUM    40–59
 *   LOW       20–39
 *   INFO       0–19
 */

// ─── Command classifiers ───────────────────────────────────────────────────────

const CMD_PATTERNS: Record<string, RegExp[]> = {
  ssh_backdoor: [
    /chattr\s+.*authorized_keys/i,             // immutable backdoor key
    /echo.+ssh-rsa\s+AAAA/i,                   // writing public key
    /echo.+ssh-ed25519\s+AAAA/i,
    />\s*~?\/\.ssh\/authorized_keys/i,          // redirecting to authorized_keys
    /clean\.sh|setup\.sh/i,                    // dropper scripts seen in the wild
    /auth_ok/i,                                // C2 callback signal
  ],
  honeypot_evasion: [
    /D877F783D5D3EF8C/i,                       // known honeypot detection file
    /locate\s+D877F783/i,
    /ls\s+.*TelegramDesktop\/tdata/i,          // Telegram session file check
    /\/dev\/ttyGSM|ttyUSB-mod/i,              // GSM/modem device check
    /\/var\/spool\/sms/i,                      // SMS spool check
    /smsd\.conf|qmuxd|simman/i,               // SIM management tools
    /\/var\/config\/sms|qmux_connect/i,
  ],
  container_escape: [
    /\/proc\/1\/mounts/i,                      // container detection via mounts
    /ls\s+\/proc\/1\//i,                       // listing PID 1 namespace
    /cat\s+\/proc\/1\/cgroup/i,
    /curl2\b/i,                                // tool used for container escape recon
  ],
  malware_drop: [
    /wget\s+https?:\/\//i,
    /curl\s+(-[a-z]+\s+)*https?:\/\//i,
    /chmod\s+(\+x|777)\s+\/tmp/i,
    /\/tmp\/\.[a-z0-9]+/i,                    // hidden file in /tmp
    /python[23]?\s+-c\s+['"]import\s+socket/i, // python reverse shell
    /bash\s+-i\s+>&\s+\/dev\/tcp/i,           // bash reverse shell
    /nc\s+(-[a-z]+\s+)*\d+\.\d+/i,           // netcat to IP
  ],
  persistence: [
    /crontab\s+-/i,
    /authorized_keys/i,
    /sshd_config/i,
    /useradd\b/i,
    /chpasswd/i,
    /systemctl\s+enable/i,
    /update-rc\.d/i,
    /\/etc\/rc\.local/i,
    /echo.+>>\s*\/etc\/crontab/i,
  ],
  lateral_movement: [
    /nmap\b/i,
    /for\s+i\s+in\s+\$\(seq\b/i,             // ping sweep loop
    /ping\s+-c\s*\d+\s+-W\s*\d+/i,
    /ssh\s+-o\s+StrictHostKeyChecking=no/i,
    /sshpass\b/i,
    /masscan\b/i,
    /proxychains\b/i,
  ],
  crypto_mining: [
    /xmrig\b/i,
    /minerd\b/i,
    /\bminer\b/i,
    /stratum\+tcp:\/\//i,
    /pool\.(minexmr|supportxmr|xmrpool|nanopool)/i,
    /-o\s+\w+\.\w+:\d{4,5}/i,                // mining pool connection pattern
    /nproc/i,                                  // cpu count check before mining
  ],
  data_exfil: [
    /cat\s+\/etc\/(passwd|shadow|hosts|group)/i,
    /find\s+\/\s+(-name|-type)\s+/i,
    /tar\s+(-[a-z]+\s+)*\/home/i,
    /zip\s+.*\/etc/i,
    /\/root\/\.ssh\//i,
    /history\s+-c/i,                           // covering tracks
    /cat\s+\/dev\/null\s*>/i,                  // log wiping
    /rm\s+-rf?\s+\/var\/log/i,
  ],
  solana_targeting: [
    /\bjito\b/i,                                  // Jito Labs MEV / validator infra
    /\braydium\b/i,                               // Raydium DEX
    /\bfiredancer\b/i,                            // Jump Crypto Firedancer validator
    /\bshredstream\b/i,                           // Jito ShredStream (block propagation)
    /\banza\b/i,                                  // Anza (Solana core dev team)
    /\bgeyser\b/i,                                // Solana Geyser plugin API
    /solana.*validator|validator.*solana/i,
    /\.sol\s+keypair|id\.json.*solana/i,          // wallet key file patterns
    /agave|solana-validator|solana-keygen/i,
  ],
  recon: [
    /^(id|whoami|w|who|last|uptime|hostname|env)(\s|$)/i,
    /uname\s+-a/i,
    /cat\s+\/etc\/issue/i,
    /cat\s+\/proc\/(cpuinfo|version|meminfo)/i,
    /ps\s+(aux|-ef)/i,
    /netstat\b/i,
    /ss\s+-/i,
    /ip\s+(addr|route|link)/i,
    /ifconfig\b/i,
    /df\s+-h/i,
    /free\s+-m/i,
  ],
}

export type CommandCategory = keyof typeof CMD_PATTERNS

export function classifyCommands(commands: string[]): Record<CommandCategory, string[]> {
  const result: Record<CommandCategory, string[]> = {
    ssh_backdoor:      [],
    honeypot_evasion:  [],
    container_escape:  [],
    malware_drop:      [],
    persistence:       [],
    lateral_movement:  [],
    crypto_mining:     [],
    data_exfil:        [],
    solana_targeting:  [],
    recon:             [],
  }

  for (const cmd of commands) {
    for (const [category, patterns] of Object.entries(CMD_PATTERNS)) {
      if (patterns.some(p => p.test(cmd))) {
        result[category as CommandCategory].push(cmd)
        break // assign to first matching category only
      }
    }
  }

  return result
}

// ─── Web attack type weights ───────────────────────────────────────────────────

const WEB_TYPE_POINTS: Record<string, number> = {
  cmdi:            25,
  sqli:            20,
  lfi:             15,
  rfi:             15,
  xss:             10,
  info_disclosure:  8,
  scanner:          5,
  recon:            2,
}

// ─── Score computation ─────────────────────────────────────────────────────────

export interface RiskInput {
  // SSH
  sshSessions:      number
  sshAuthAttempts:  number
  sshLoginSuccess:  boolean
  commands:         string[]      // all command strings from events

  // Web
  webHits:          number
  webAttackTypes:   string[]      // e.g. ['sqli', 'scanner', 'lfi']

  // Cross-protocol
  crossProtocol:    boolean       // appears in both SSH and web
}

export interface RiskResult {
  score:      number              // 0–100
  level:      'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
  breakdown: {
    ssh:         number
    web:         number
    commands:    number
    crossProto:  number
  }
  commandCategories: Record<CommandCategory, string[]>
  topFactors:  string[]          // human-readable explanation
}

export function computeRiskScore(input: RiskInput): RiskResult {
  let ssh = 0, web = 0, cmdPts = 0, crossProto = 0
  const factors: string[] = []
  const cats = classifyCommands(input.commands)

  // ── SSH base ────────────────────────────────────────────────────────────────
  if (input.sshSessions > 0) {
    const attemptPts = Math.min(Math.floor(input.sshAuthAttempts / 3), 15)
    ssh += attemptPts
    if (attemptPts >= 10) factors.push(`${input.sshAuthAttempts} SSH auth attempts`)

    if (input.sshLoginSuccess) {
      ssh += 25
      factors.push('SSH login successful')
    }
  }

  // ── Commands ────────────────────────────────────────────────────────────────
  if (cats.ssh_backdoor.length)     { cmdPts += 30; factors.push('SSH backdoor installation') }
  if (cats.honeypot_evasion.length) { cmdPts += 20; factors.push('Honeypot/sandbox evasion') }
  if (cats.container_escape.length) { cmdPts += 20; factors.push('Container escape attempt') }
  if (cats.malware_drop.length)     { cmdPts += 20; factors.push('Malware dropper commands') }
  if (cats.persistence.length)      { cmdPts += 20; factors.push('Persistence mechanisms') }
  if (cats.lateral_movement.length) { cmdPts += 15; factors.push('Lateral movement') }
  if (cats.crypto_mining.length)    { cmdPts += 15; factors.push('Crypto miner deployment') }
  if (cats.data_exfil.length)       { cmdPts += 12; factors.push('Data exfiltration / log wiping') }
  if (cats.solana_targeting.length) { cmdPts += 18; factors.push('Solana validator/infrastructure targeting') }
  if (cats.recon.length)            { cmdPts +=  5; factors.push('Recon commands') }

  // ── Web ─────────────────────────────────────────────────────────────────────
  const uniqueWebTypes = [...new Set(input.webAttackTypes)]
  for (const t of uniqueWebTypes) {
    const pts = WEB_TYPE_POINTS[t] ?? 0
    web += pts
  }
  if (uniqueWebTypes.includes('cmdi') || uniqueWebTypes.includes('sqli')) {
    factors.push(`Web attack: ${uniqueWebTypes.filter(t => ['cmdi','sqli','lfi','rfi'].includes(t)).join(', ')}`)
  }

  // ── Cross-protocol bonus ─────────────────────────────────────────────────────
  if (input.crossProtocol) {
    crossProto = 15
    factors.push('Attacked both SSH and HTTP')
  }

  const raw   = ssh + cmdPts + web + crossProto
  const score = Math.min(100, raw)

  const level = score >= 80 ? 'CRITICAL'
    : score >= 60 ? 'HIGH'
    : score >= 40 ? 'MEDIUM'
    : score >= 20 ? 'LOW'
    : 'INFO'

  return {
    score,
    level,
    breakdown: { ssh, web, commands: cmdPts, crossProto },
    commandCategories: cats,
    topFactors: factors.slice(0, 4),
  }
}

export const RISK_COLORS = {
  CRITICAL: { bg: 'bg-red-500/15',    text: 'text-red-400',    border: 'border-red-500/40',    dot: 'bg-red-500'    },
  HIGH:     { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/40', dot: 'bg-orange-500' },
  MEDIUM:   { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/40', dot: 'bg-yellow-500' },
  LOW:      { bg: 'bg-blue-500/15',   text: 'text-blue-400',   border: 'border-blue-500/40',   dot: 'bg-blue-500'   },
  INFO:     { bg: 'bg-muted/40',      text: 'text-muted-foreground', border: 'border-border',   dot: 'bg-muted-foreground' },
} as const

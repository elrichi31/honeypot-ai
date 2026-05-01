/**
 * Risk Score Engine
 *
 * Scores an IP 0-100 based on observed behavior across SSH, HTTP,
 * and service honeypots such as FTP, MySQL, and port-scan probes.
 * Each factor contributes points; the total is clamped to 100.
 *
 * Categories:
 *   CRITICAL  80-100
 *   HIGH      60-79
 *   MEDIUM    40-59
 *   LOW       20-39
 *   INFO       0-19
 */

const CMD_PATTERNS: Record<string, RegExp[]> = {
  ssh_backdoor: [
    /chattr\s+.*authorized_keys/i,
    /echo.+ssh-rsa\s+AAAA/i,
    /echo.+ssh-ed25519\s+AAAA/i,
    />\s*~?\/\.ssh\/authorized_keys/i,
    /clean\.sh|setup\.sh/i,
    /auth_ok/i,
  ],
  honeypot_evasion: [
    /D877F783D5D3EF8C/i,
    /locate\s+D877F783/i,
    /ls\s+.*TelegramDesktop\/tdata/i,
    /\/dev\/ttyGSM|ttyUSB-mod/i,
    /\/var\/spool\/sms/i,
    /smsd\.conf|qmuxd|simman/i,
    /\/var\/config\/sms|qmux_connect/i,
  ],
  container_escape: [
    /\/proc\/1\/mounts/i,
    /ls\s+\/proc\/1\//i,
    /cat\s+\/proc\/1\/cgroup/i,
    /curl2\b/i,
  ],
  malware_drop: [
    /wget\s+https?:\/\//i,
    /curl\s+(-[a-z]+\s+)*https?:\/\//i,
    /chmod\s+(\+x|777)\s+\/tmp/i,
    /\/tmp\/\.[a-z0-9]+/i,
    /python[23]?\s+-c\s+['"]import\s+socket/i,
    /bash\s+-i\s+>&\s+\/dev\/tcp/i,
    /nc\s+(-[a-z]+\s+)*\d+\.\d+/i,
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
    /for\s+i\s+in\s+\$\(seq\b/i,
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
    /-o\s+\w+\.\w+:\d{4,5}/i,
    /nproc/i,
  ],
  data_exfil: [
    /cat\s+\/etc\/(passwd|shadow|hosts|group)/i,
    /find\s+\/\s+(-name|-type)\s+/i,
    /tar\s+(-[a-z]+\s+)*\/home/i,
    /zip\s+.*\/etc/i,
    /\/root\/\.ssh\//i,
    /history\s+-c/i,
    /cat\s+\/dev\/null\s*>/i,
    /rm\s+-rf?\s+\/var\/log/i,
  ],
  solana_targeting: [
    /\bjito\b/i,
    /\braydium\b/i,
    /\bfiredancer\b/i,
    /\bshredstream\b/i,
    /\banza\b/i,
    /\bgeyser\b/i,
    /solana.*validator|validator.*solana/i,
    /\.sol\s+keypair|id\.json.*solana/i,
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
    ssh_backdoor: [],
    honeypot_evasion: [],
    container_escape: [],
    malware_drop: [],
    persistence: [],
    lateral_movement: [],
    crypto_mining: [],
    data_exfil: [],
    solana_targeting: [],
    recon: [],
  }

  for (const cmd of commands) {
    for (const [category, patterns] of Object.entries(CMD_PATTERNS)) {
      if (patterns.some((pattern) => pattern.test(cmd))) {
        result[category as CommandCategory].push(cmd)
        break
      }
    }
  }

  return result
}

const WEB_TYPE_POINTS: Record<string, number> = {
  cmdi: 25,
  sqli: 20,
  lfi: 15,
  rfi: 15,
  xss: 10,
  info_disclosure: 8,
  scanner: 5,
  recon: 2,
}

export interface RiskInput {
  sshSessions: number
  sshAuthAttempts: number
  sshLoginSuccess: boolean
  commands: string[]

  webHits: number
  webAttackTypes: string[]

  protocolsSeen: string[]
  protocolAuthAttempts: number
  protocolCommandCount: number
  protocolConnectCount: number
  protocolUniquePorts: number
  credentialReuse: boolean
  timeWindowMinutes: number | null
}

export interface RiskResult {
  score: number
  level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO"
  breakdown: {
    ssh: number
    web: number
    protocols: number
    commands: number
    crossProto: number
  }
  commandCategories: Record<CommandCategory, string[]>
  topFactors: string[]
}

export function computeRiskScore(input: RiskInput): RiskResult {
  let ssh = 0
  let web = 0
  let protocols = 0
  let cmdPts = 0
  let crossProto = 0

  const factors: string[] = []
  const cats = classifyCommands(input.commands)
  const uniqueProtocols = [...new Set(input.protocolsSeen)]
  const serviceFamilyCount = uniqueProtocols.length
  const hasPortScan = uniqueProtocols.includes("port-scan")

  if (input.sshSessions > 0) {
    const attemptPts = Math.min(Math.floor(input.sshAuthAttempts / 3), 15)
    ssh += attemptPts
    if (attemptPts >= 10) factors.push(`${input.sshAuthAttempts} SSH auth attempts`)

    if (input.sshLoginSuccess) {
      ssh += 25
      factors.push("SSH login successful")
    }
  }

  if (cats.ssh_backdoor.length) {
    cmdPts += 30
    factors.push("SSH backdoor installation")
  }
  if (cats.honeypot_evasion.length) {
    cmdPts += 20
    factors.push("Honeypot or sandbox evasion")
  }
  if (cats.container_escape.length) {
    cmdPts += 20
    factors.push("Container escape attempt")
  }
  if (cats.malware_drop.length) {
    cmdPts += 20
    factors.push("Malware dropper commands")
  }
  if (cats.persistence.length) {
    cmdPts += 20
    factors.push("Persistence mechanisms")
  }
  if (cats.lateral_movement.length) {
    cmdPts += 15
    factors.push("Lateral movement")
  }
  if (cats.crypto_mining.length) {
    cmdPts += 15
    factors.push("Crypto miner deployment")
  }
  if (cats.data_exfil.length) {
    cmdPts += 12
    factors.push("Data exfiltration or log wiping")
  }
  if (cats.solana_targeting.length) {
    cmdPts += 18
    factors.push("Solana validator or infrastructure targeting")
  }
  if (cats.recon.length) {
    cmdPts += 5
    factors.push("Recon commands")
  }

  const uniqueWebTypes = [...new Set(input.webAttackTypes)]
  for (const attackType of uniqueWebTypes) {
    web += WEB_TYPE_POINTS[attackType] ?? 0
  }
  if (uniqueWebTypes.includes("cmdi") || uniqueWebTypes.includes("sqli")) {
    const seriousWebTypes = uniqueWebTypes.filter((type) =>
      ["cmdi", "sqli", "lfi", "rfi"].includes(type),
    )
    if (seriousWebTypes.length > 0) {
      factors.push(`Web attack: ${seriousWebTypes.join(", ")}`)
    }
  }

  if (hasPortScan) {
    const portScanPts = Math.min(10, Math.max(3, Math.ceil(input.protocolUniquePorts / 2)))
    protocols += portScanPts
    if (input.protocolUniquePorts > 0) {
      factors.push(`Port scan across ${input.protocolUniquePorts} port${input.protocolUniquePorts === 1 ? "" : "s"}`)
    }
  }

  if (input.protocolAuthAttempts > 0) {
    const authPts = Math.min(18, Math.ceil(input.protocolAuthAttempts / 2))
    protocols += authPts
    if (input.protocolAuthAttempts >= 4) {
      factors.push(`${input.protocolAuthAttempts} service auth attempts`)
    }
  }

  if (input.protocolCommandCount > 0) {
    const commandPts = Math.min(12, input.protocolCommandCount * 3)
    protocols += commandPts
    factors.push("Post-auth activity in service honeypots")
  }

  if (input.protocolConnectCount >= 6 && !hasPortScan) {
    protocols += 4
    factors.push("Repeated service probing")
  }

  if (input.credentialReuse) {
    protocols += 8
    factors.push("Credential reuse across service honeypots")
  }

  if (input.timeWindowMinutes !== null && input.timeWindowMinutes <= 10 && serviceFamilyCount >= 2) {
    protocols += 6
    factors.push("Compressed multi-service activity")
  }

  if (serviceFamilyCount >= 2) {
    crossProto = 10 + Math.min(15, (serviceFamilyCount - 2) * 5)
    factors.push(`Touched ${serviceFamilyCount} service families`)
  }

  const raw = ssh + web + protocols + cmdPts + crossProto
  const score = Math.min(100, raw)

  const level =
    score >= 80 ? "CRITICAL" :
    score >= 60 ? "HIGH" :
    score >= 40 ? "MEDIUM" :
    score >= 20 ? "LOW" :
    "INFO"

  return {
    score,
    level,
    breakdown: {
      ssh,
      web,
      protocols,
      commands: cmdPts,
      crossProto,
    },
    commandCategories: cats,
    topFactors: factors.slice(0, 4),
  }
}

export const RISK_COLORS = {
  CRITICAL: {
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/40",
    dot: "bg-red-500",
  },
  HIGH: {
    bg: "bg-orange-500/15",
    text: "text-orange-400",
    border: "border-orange-500/40",
    dot: "bg-orange-500",
  },
  MEDIUM: {
    bg: "bg-yellow-500/15",
    text: "text-yellow-400",
    border: "border-yellow-500/40",
    dot: "bg-yellow-500",
  },
  LOW: {
    bg: "bg-blue-500/15",
    text: "text-blue-400",
    border: "border-blue-500/40",
    dot: "bg-blue-500",
  },
  INFO: {
    bg: "bg-muted/40",
    text: "text-muted-foreground",
    border: "border-border",
    dot: "bg-muted-foreground",
  },
} as const

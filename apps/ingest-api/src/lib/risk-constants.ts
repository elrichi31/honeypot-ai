export const SSH_AUTH_ATTEMPTS_DIVISOR = 3
export const SSH_AUTH_ATTEMPTS_CAP = 15
export const SSH_AUTH_HIGH_THRESHOLD = 10
export const SUCCESS_LOGIN_BONUS = 25

export const CMD_BACKDOOR_PTS = 30
export const CMD_HONEYPOT_EVASION_PTS = 20
export const CMD_CONTAINER_ESCAPE_PTS = 20
export const CMD_MALWARE_DROP_PTS = 20
export const CMD_PERSISTENCE_PTS = 20
export const CMD_LATERAL_MOVEMENT_PTS = 15
export const CMD_CRYPTO_MINING_PTS = 15
export const CMD_DATA_EXFIL_PTS = 12
export const CMD_SOLANA_TARGETING_PTS = 18
export const CMD_RECON_PTS = 5

export const WEB_TYPE_POINTS: Record<string, number> = {
  cmdi: 25,
  sqli: 20,
  lfi: 15,
  rfi: 15,
  xss: 10,
  info_disclosure: 8,
  scanner: 5,
  recon: 2,
}
export const WEB_SERIOUS_TYPES = ["cmdi", "sqli", "lfi", "rfi"] as const

export const PORT_SCAN_PTS_MAX = 10
export const PORT_SCAN_PTS_MIN = 3
export const PORT_SCAN_PORTS_DIVISOR = 2

export const PROTOCOL_AUTH_PTS_CAP = 18
export const PROTOCOL_AUTH_ATTEMPTS_DIVISOR = 2
export const PROTOCOL_AUTH_HIGH_THRESHOLD = 4

export const PROTOCOL_CMD_PTS_CAP = 12
export const PROTOCOL_CMD_PTS_MULTIPLIER = 3

export const PROTOCOL_CONNECT_REPEAT_THRESHOLD = 6
export const PROTOCOL_CONNECT_REPEAT_PTS = 4

export const PROTOCOL_CREDENTIAL_REUSE_PTS = 8

export const PROTOCOL_COMPRESSED_WINDOW_MINUTES = 10
export const PROTOCOL_COMPRESSED_MIN_FAMILIES = 2
export const PROTOCOL_COMPRESSED_PTS = 6

export const CROSS_PROTO_BASE_PTS = 10
export const CROSS_PROTO_MIN_FAMILIES = 2
export const CROSS_PROTO_PER_EXTRA_FAMILY_PTS = 5
export const CROSS_PROTO_EXTRA_CAP = 15

export const SCORE_MAX = 100
export const TOP_FACTORS_LIMIT = 4

export type CommandCategory =
  | "ssh_backdoor"
  | "honeypot_evasion"
  | "container_escape"
  | "malware_drop"
  | "persistence"
  | "lateral_movement"
  | "crypto_mining"
  | "data_exfil"
  | "solana_targeting"
  | "recon"

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
  // Deception port scan events (from deception_portscans table, real attacker IPs)
  portScanEvents?: number
  portScanUniquePorts?: number
}

export const CMD_PATTERNS: Record<CommandCategory, RegExp[]> = {
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

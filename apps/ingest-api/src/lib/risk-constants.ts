export const SSH_AUTH_ATTEMPTS_DIVISOR = 3
export const SSH_AUTH_ATTEMPTS_CAP = 15
export const SSH_AUTH_HIGH_THRESHOLD = 10
export const SUCCESS_LOGIN_BONUS = 25

export const CMD_BACKDOOR_PTS = 30
export const CMD_REVERSE_SHELL_PTS = 25
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

// Web volume scales by order of magnitude, not linearly: 10 hits and 10k hits
// are different threats, but 10k and 20k are the same one. Without this the
// type-only score made a single probe indistinguishable from a 26k-hit campaign.
export const WEB_VOLUME_PTS_PER_DECADE = 4
export const WEB_VOLUME_PTS_CAP = 12

// Hard evidence: the attacker did something that only a real intruder does.
// Weighted above any volume/enumeration signal — a triggered canary means they
// read the planted credential and came back to use it.
// Zero false-positive surface: catalog/shared.py#_check_canary only fires when
// the attacker submits the exact planted credential, and the ip_specific variant
// is an HMAC of their own IP they could only get by reading the leaked file.
// Weighted so a bare canary trigger alone clears the MEDIUM floor.
export const CANARY_PTS = 40
export const MALWARE_SAMPLE_PTS = 25
// Suricata severity is inverted: 1 is the most severe.
export const SURICATA_SEVERITY_PTS: Record<number, number> = { 1: 15, 2: 8 }
export const SURICATA_FALLBACK_PTS = 3

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
  | "reverse_shell"
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
  // Hard evidence signals. Optional so callers that only have telemetry
  // (threat-alerts.ts) keep scoring exactly as before.
  canaryHits?: number
  malwareSamples?: number
  suricataAlerts?: number
  /** Numerically lowest severity seen — Suricata counts 1 as most severe. */
  suricataWorstSeverity?: number | null
}

// Order matters: classifyCommands() assigns each command to the FIRST matching
// category, so the most specific/severe categories come first and `recon` last.
export const CMD_PATTERNS: Record<CommandCategory, RegExp[]> = {
  ssh_backdoor: [
    /chattr\s+.*authorized_keys/i,
    /echo.+ssh-(rsa|ed25519|dss)\s+AAAA/i,
    />>?\s*\S*authorized_keys/i,
    /tee\s+(-a\s+)?\S*authorized_keys/i,
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
    // Mirai-style fingerprint: an all-caps garbage token after busybox is the
    // bot testing whether the shell is real (real busybox errors distinctively).
    // Deliberately case-sensitive — lowercase busybox subcommands are legit.
    /\/bin\/busybox\s+[A-Z0-9]{4,}(\s|$)/,
    /systemd-detect-virt/i,
    /(dmesg|lscpu|lspci).*(vmware|virtualbox|qemu|kvm|hypervisor)/i,
  ],
  container_escape: [
    /\/proc\/1\/mounts/i,
    /ls\s+\/proc\/1\//i,
    /cat\s+\/proc\/1\/cgroup/i,
    /curl2\b/i,
    /\/\.dockerenv/i,
    /docker\.sock/i,
    /\bnsenter\b/i,
    /release_agent/i,
    /docker\s+run\s+.*--privileged/i,
  ],
  reverse_shell: [
    /bash\s+-i\s+>&\s*\/dev\/tcp/i,
    /\/dev\/tcp\/\d+\.\d+/i,
    /nc(\.traditional)?\s+.*-e\s*\/bin\/(ba|da|a)?sh/i,
    /nc\s+(-[a-z]+\s+)*\d+\.\d+/i,
    /mkfifo\s+\S+.*\|\s*(\/bin\/)?(ba|da|a)?sh/i,
    /socat\s+\S*tcp/i,
    /python[23]?\s+-c\s+['"]import\s+(socket|pty)/i,
    /php\s+-r\s+.*fsockopen/i,
    /perl\s+-e\s+.*(socket|inet)/i,
  ],
  malware_drop: [
    /wget\s+https?:\/\//i,
    /curl\s+(-[a-z]+\s+)*https?:\/\//i,
    /(wget|curl).+\|\s*(\/bin\/)?(ba|da|a)?sh\b/i,
    /\b(tftp|ftpget|ftpput)\b/i,
    /busybox\s+(wget|tftp)/i,
    /chmod\s+(\+x|777)\s+\/tmp/i,
    /chmod\s+(\+x|777)\s+\S+\s*(;|&&)\s*(\.\/|sh\s)/i,
    /\/tmp\/\.[a-z0-9]+/i,
    /base64\s+(-d|--decode)/i,
    // Mirai/Gafgyt loaders name payloads by target architecture
    /\.(mips|mpsl|arm[4-7]?|sh4|m68k|ppc|sparc|x86(_64)?|i[3-6]86)\b/i,
  ],
  persistence: [
    // `crontab -l` (just listing) is recon, not persistence
    /crontab\s+-(?!l\b)/i,
    /authorized_keys/i,
    /sshd_config/i,
    /useradd\b|adduser\b/i,
    /chpasswd/i,
    /^passwd\b|[;&|]\s*passwd\b/i,
    /systemctl\s+(enable|daemon-reload)/i,
    /\/etc\/systemd\/system/i,
    /update-rc\.d/i,
    /\/etc\/rc\.local/i,
    /echo.+>>\s*\/etc\/crontab/i,
    /echo.+>>\s*\S*\.?(bashrc|profile|bash_profile)/i,
    /chattr\s+\+i/i,
  ],
  lateral_movement: [
    /nmap\b/i,
    /for\s+i\s+in\s+\$\(seq\b/i,
    /ping\s+-c\s*\d+\s+-W\s*\d+/i,
    /ssh\s+-o\s+StrictHostKeyChecking=no/i,
    /sshpass\b/i,
    /masscan\b/i,
    /proxychains\b/i,
    /\bhydra\b|\bmedusa\b/i,
    /ssh-keyscan\b/i,
  ],
  crypto_mining: [
    /xmrig\b|xmr[-_]?stak/i,
    /minerd\b/i,
    /\bminer\b/i,
    /stratum\+(tcp|ssl):\/\//i,
    /pool\.(minexmr|supportxmr|xmrpool|nanopool)/i,
    /c3pool|moneroocean|hashvault|nicehash|herominers|2miners/i,
    /--donate-level|--cpu-priority|--max-cpu-usage/i,
    /kdevtmpfsi|kinsing/i,
    /-o\s+\w+\.\w+:\d{4,5}/i,
  ],
  data_exfil: [
    /cat\s+\/etc\/(passwd|shadow|hosts|group)/i,
    /find\s+\/\s+(-name|-type)\s+/i,
    /tar\s+(-[a-z]+\s+)*\/home/i,
    /zip\s+.*\/etc/i,
    /\/root\/\.ssh\//i,
    /history\s+-c/i,
    /unset\s+HISTFILE/i,
    /HISTFILE=\/dev\/null|HISTSIZE=0/i,
    /ln\s+-sf?\s+\/dev\/null\s+\S*history/i,
    /rm\s+(-[a-z]+\s+)*\S*(bash_history|\/var\/log)/i,
    /\bshred\b/i,
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
    /\bnproc\b/i,
    /\blscpu\b/i,
    /crontab\s+-l\b/i,
    /cat\s+\/etc\/(issue|os-release)/i,
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

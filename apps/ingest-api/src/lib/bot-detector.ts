/**
 * Bot vs Human session classifier.
 *
 * Scores a session 0–100 for bot-likelihood using behavioral signals:
 * inter-command timing (strongest), speed, SSH client fingerprint,
 * command volume/type, terminal behavior, and auth patterns.
 *
 * Honeypot base rate is overwhelmingly automated traffic, so 'human' is only
 * assigned when the score is low AND at least one affirmative human signal
 * fired (thinking pauses between commands, terminal resize, human-only SSH
 * client). Absence of bot evidence alone yields 'unknown', never 'human'.
 *
 * Thresholds:
 *   >= 60                      → bot
 *   <= 25 with a human signal  → human
 *   otherwise                  → unknown
 */

export type SessionActor = 'bot' | 'human' | 'unknown';

export interface BotDetectionInput {
  clientVersion: string | null;
  hassh: string | null;
  durationSec: number | null;
  commands: string[];
  /** command.input event timestamps, ascending. Enables inter-command timing — the strongest signal. */
  commandTimestamps?: Date[];
  /** Count of cowrie client.size events. 1 = pty-req (weak); >=2 = window resized mid-session (human). */
  terminalSizeEventCount?: number;
  authAttemptCount: number;
  loginSuccess: boolean | null;
  password?: string | null;
}

export interface BotDetectionResult {
  actor: SessionActor;
  botScore: number;
  reasons: string[];
}

// SSH clients overwhelmingly used by automated scanners/bots
const BOT_CLIENT_PATTERNS: RegExp[] = [
  /SSH-2\.0-Go\b/i,                  // Go x/crypto/ssh — most common bot library
  /SSH-2\.0-libssh2?/i,              // libssh / libssh2 (C, scripted tools)
  /SSH-2\.0-paramiko/i,              // Python paramiko (scanners)
  /SSH-2\.0-JSCH/i,                  // Java JSch (bots)
  /SSH-2\.0-AsyncSSH/i,              // asyncssh Python
  /SSH-2\.0-Ruby/i,                  // Ruby net-ssh bots
  /masscan|zgrab|nmap|zmap/i,        // explicit scanner tools
]

// SSH clients strongly associated with human use. OpenSSH is deliberately NOT
// here: it's the default banner most botnets spoof (or genuinely link), so it
// carries almost no information. These GUI clients are rarely spoofed.
const HUMAN_CLIENT_PATTERNS: RegExp[] = [
  /SSH-2\.0-PuTTY/i,
  /SSH-2\.0-Bitvise/i,
  /SSH-2\.0-SecureCRT/i,
  /SSH-2\.0-WinSCP/i,
  /SSH-2\.0-FileZilla/i,
  /SSH-2\.0-MobaXterm/i,
]

// HASSH fingerprints (SSH client key-exchange hash) known to belong to scanner/bot
// tooling — identical crypto stack means the same tool regardless of the
// self-reported client-version banner, which is easier to spoof. Empty by default:
// there's no hardcoded list of "known bad" HASSH values to ship blind, since a wrong
// guess here silently mislabels real traffic. Populate via `BOT_HASSH_FINGERPRINTS`
// env var (comma-separated) once real values are derived from production data, e.g.:
//   SELECT hassh, COUNT(*) FROM sessions WHERE session_type = 'bot' AND hassh IS NOT NULL
//   GROUP BY hassh ORDER BY COUNT(*) DESC LIMIT 20;
function isBotHassh(hassh: string): boolean {
  const configured = process.env.BOT_HASSH_FINGERPRINTS ?? ''
  return configured.split(',').map(h => h.trim()).filter(Boolean).includes(hassh)
}

// Commands that are essentially the first thing every automated recon bot runs
const BASIC_RECON_PATTERN = /^(id|whoami|uname(\s+-a)?|hostname|w\b|who\b|uptime|cat\s+\/etc\/issue|cat\s+\/proc\/(version|cpuinfo))(\s|$)/i

// Passwords that look like dates — strongly associated with breach-list credential stuffing
// Matches DDMMYYYY, MMDDYYYY, YYYYMMDD, DDMMYY, and common separators like 01/01/1990
const DATE_PASSWORD_PATTERN = /^(\d{2}[.\-/]?\d{2}[.\-/]?\d{2,4}|\d{4}[.\-/]?\d{2}[.\-/]?\d{2})$/

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function stddev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length)
}

export function detectBot(input: BotDetectionInput): BotDetectionResult {
  let score = 0
  let humanSignals = 0
  const reasons: string[] = []

  // ── Inter-command timing (strongest signal) ─────────────────────────────────
  // Humans think between commands: gaps of seconds with high variance. Scripts
  // fire the next command within milliseconds, at metronomic intervals.
  const gapsMs: number[] = []
  const ts = input.commandTimestamps ?? []
  for (let i = 1; i < ts.length; i++) gapsMs.push(ts[i].getTime() - ts[i - 1].getTime())
  const medianGap = gapsMs.length >= 2 ? median(gapsMs) : null

  if (medianGap !== null) {
    if (medianGap < 1000) {
      score += 45
      reasons.push(`Commands fired ${Math.round(medianGap)}ms apart (script-speed)`)
      if (gapsMs.length >= 3 && stddev(gapsMs) < 250) {
        score += 15
        reasons.push('Metronomic command intervals (scripted loop)')
      }
    } else if (medianGap >= 2000) {
      score -= 25
      humanSignals++
      reasons.push(`Median ${(medianGap / 1000).toFixed(1)}s between commands (human typing/thinking pace)`)
      if (Math.max(...gapsMs) >= 10000) {
        score -= 10
        reasons.push('Long thinking pause (>=10s) mid-session')
      }
    }
  }

  // ── Terminal behavior ────────────────────────────────────────────────────────
  // A window resize mid-session means a real terminal emulator being dragged
  // around by a person. Scripts never resize.
  if ((input.terminalSizeEventCount ?? 0) >= 2) {
    score -= 30
    humanSignals++
    reasons.push('Terminal window resized mid-session (real terminal emulator)')
  }

  // ── Session duration ─────────────────────────────────────────────────────────
  if (input.durationSec !== null) {
    if (input.durationSec <= 5) {
      score += 45
      reasons.push(`Session lasted ${input.durationSec}s (bot-speed)`)
    } else if (input.durationSec <= 15) {
      score += 25
      reasons.push(`Session lasted ${input.durationSec}s (very fast)`)
    } else if (input.durationSec >= 60 && input.commands.length > 0 && (medianGap === null || medianGap >= 1500)) {
      // Long duration only counts toward "interactive" when commands actually ran
      // at non-script pace; an idle connection or a script inside a held-open
      // session is not a human.
      score -= 20
      reasons.push(`Long session (${input.durationSec}s) with activity suggests interactive use`)
    }
  }

  // ── SSH client fingerprint ───────────────────────────────────────────────────
  if (input.clientVersion) {
    const isBotClient = BOT_CLIENT_PATTERNS.some(p => p.test(input.clientVersion!))
    const isHumanClient = HUMAN_CLIENT_PATTERNS.some(p => p.test(input.clientVersion!))

    if (isBotClient) {
      score += 35
      reasons.push(`Bot SSH client: ${input.clientVersion}`)
    } else if (isHumanClient) {
      score -= 15
      humanSignals++
      reasons.push(`Human SSH client: ${input.clientVersion}`)
    }
  }

  // ── HASSH fingerprint ────────────────────────────────────────────────────────
  if (input.hassh && isBotHassh(input.hassh)) {
    score += 30
    reasons.push(`Known bot HASSH fingerprint: ${input.hassh}`)
  }

  // ── Commands ─────────────────────────────────────────────────────────────────
  if (input.commands.length === 0) {
    score += 10
    reasons.push('No commands executed')
  } else if (input.commands.length <= 5) {
    const allBasicRecon = input.commands.every(cmd => BASIC_RECON_PATTERN.test(cmd.trim()))
    if (allBasicRecon) {
      score += 20
      reasons.push(`Only basic recon commands (${input.commands.length})`)
    }
  } else if (input.commands.length >= 15 && (medianGap === null || medianGap >= 1500)) {
    // Many commands only imply an operator when they weren't machine-gunned;
    // malware droppers routinely run 30+ commands in two seconds.
    score -= 25
    reasons.push(`Many commands (${input.commands.length}) at non-script pace`)
    if (medianGap !== null) humanSignals++
  }

  // ── Auth pattern ─────────────────────────────────────────────────────────────
  // Bots usually fire one credential and move on; humans often retry
  if (input.authAttemptCount <= 2 && !input.loginSuccess) {
    score += 10
    reasons.push('Single-shot auth attempt (spray-and-move pattern)')
  }

  // ── Login success + minimal commands = scripted recon ────────────────────────
  if (input.loginSuccess && input.commands.length > 0 && input.commands.length <= 5) {
    const allBasicRecon = input.commands.every(cmd => BASIC_RECON_PATTERN.test(cmd.trim()))
    if (allBasicRecon) {
      score += 15
      reasons.push('Logged in then ran only recon script (automated)')
    }
  }

  // ── Date-format password = breach-list credential stuffing ───────────────────
  if (input.password && DATE_PASSWORD_PATTERN.test(input.password)) {
    score += 20
    reasons.push(`Date-pattern password "${input.password}" — breach list indicator`)
  }

  const botScore = Math.max(0, Math.min(100, score))

  const actor: SessionActor =
    botScore >= 60 ? 'bot'
    : botScore <= 25 && humanSignals > 0 ? 'human'
    : 'unknown'

  return { actor, botScore, reasons }
}

// ── Web hit bot detection (no schema change needed) ──────────────────────────

const SCANNER_UA_PATTERN = /sqlmap|nikto|nmap|masscan|zgrab|nuclei|dirbuster|gobuster|wfuzz|hydra|medusa|burpsuite|metasploit|acunetix|nessus|openvas|shodan|censys|zgrab|curl\/|python-requests|go-http-client|libwww-perl|scrapy/i

export function isWebHitBot(attackType: string, userAgent: string): boolean {
  if (attackType === 'scanner') return true
  if (SCANNER_UA_PATTERN.test(userAgent)) return true
  // 'recon' alone is weak signal (could be the fallback for legitimate crawlers)
  // so we only flag recon as bot when combined with automated UA
  if (attackType === 'recon' && !userAgent.includes('Mozilla')) return true
  return false
}

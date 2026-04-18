/**
 * Bot vs Human session classifier.
 *
 * Scores a session 0–100 for bot-likelihood using behavioral signals:
 * speed, SSH client fingerprint, command volume/type, and auth patterns.
 *
 * Thresholds:
 *   >= 60  → bot
 *   <= 25  → human
 *   26–59  → unknown
 */

export type SessionActor = 'bot' | 'human' | 'unknown';

export interface BotDetectionInput {
  clientVersion: string | null;
  hassh: string | null;
  durationSec: number | null;
  commands: string[];
  authAttemptCount: number;
  loginSuccess: boolean | null;
}

export interface BotDetectionResult {
  actor: SessionActor;
  botScore: number;
  reasons: string[];
}

// SSH clients overwhelmingly used by automated scanners/bots
const BOT_CLIENT_PATTERNS: RegExp[] = [
  /SSH-2\.0-Go\b/i,                  // Go x/crypto/ssh — most common bot library
  /SSH-2\.0-libssh2/i,               // libssh2 (C, scripted tools)
  /SSH-2\.0-paramiko/i,              // Python paramiko (scanners)
  /SSH-2\.0-JSCH/i,                  // Java JSch (bots)
  /SSH-2\.0-AsyncSSH/i,              // asyncssh Python
  /SSH-2\.0-Ruby/i,                  // Ruby net-ssh bots
  /masscan|zgrab|nmap|zmap/i,        // explicit scanner tools
]

// SSH clients strongly associated with human/legitimate use
const HUMAN_CLIENT_PATTERNS: RegExp[] = [
  /SSH-2\.0-OpenSSH/i,               // OpenSSH (human terminal use)
  /SSH-2\.0-PuTTY/i,                 // PuTTY (Windows users)
  /SSH-2\.0-Bitvise/i,               // Bitvise SSH client
  /SSH-2\.0-SecureCRT/i,             // SecureCRT (enterprise)
  /SSH-2\.0-WinSCP/i,                // WinSCP
  /SSH-2\.0-FileZilla/i,             // FileZilla
  /SSH-2\.0-MobaXterm/i,             // MobaXterm
]

// Commands that are essentially the first thing every automated recon bot runs
const BASIC_RECON_PATTERN = /^(id|whoami|uname(\s+-a)?|hostname|w\b|who\b|uptime|cat\s+\/etc\/issue|cat\s+\/proc\/(version|cpuinfo))(\s|$)/i

export function detectBot(input: BotDetectionInput): BotDetectionResult {
  let score = 0
  const reasons: string[] = []

  // ── Duration (strongest signal) ─────────────────────────────────────────────
  if (input.durationSec !== null) {
    if (input.durationSec <= 5) {
      score += 45
      reasons.push(`Session lasted ${input.durationSec}s (bot-speed)`)
    } else if (input.durationSec <= 15) {
      score += 25
      reasons.push(`Session lasted ${input.durationSec}s (very fast)`)
    } else if (input.durationSec >= 60) {
      score -= 20
      reasons.push(`Long session (${input.durationSec}s) suggests interactive use`)
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
      reasons.push(`Human SSH client: ${input.clientVersion}`)
    }
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
  } else if (input.commands.length >= 15) {
    score -= 25
    reasons.push(`Many commands (${input.commands.length}) suggest interactive operator`)
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

  const botScore = Math.max(0, Math.min(100, score))

  const actor: SessionActor =
    botScore >= 60 ? 'bot'
    : botScore <= 25 ? 'human'
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

import type { HoneypotEvent } from "./api/types"

/**
 * Botnet-family attribution + IoC extraction for SSH sessions.
 *
 * This runs ONLY in the dashboard when a human opens a single session detail
 * page — never in the ingest hot path. So it operates on the handful of
 * commands of one session and its cost is negligible even though thousands of
 * sessions/day are ingested.
 *
 * Two layers:
 *  - `detectBotnetFamily`: attribution — "which known kit/actor is this?"
 *  - `extractIocs`: indicators — C2 endpoints, planted SSH keys, malware hashes.
 *
 * To teach the app a new botnet, add an entry to BOTNET_SIGNATURES. Nothing
 * else needs to change.
 */

export type BotnetCategory =
  | "cryptominer"
  | "ddos"
  | "worm"
  | "backdoor"
  | "unknown"

export interface BotnetSignature {
  id: string
  name: string
  aliases: string[]
  description: string
  category: BotnetCategory
  /** A family matches when at least `minMatches` distinct patterns hit. */
  patterns: RegExp[]
  minMatches: number
  references?: string[]
}

export interface BotnetMatch {
  id: string
  name: string
  aliases: string[]
  description: string
  category: BotnetCategory
  /** Human-readable snippets of the patterns that fired — explains the verdict. */
  matchedPatterns: string[]
  /** matched count / total patterns, 0–1. */
  confidence: number
  references: string[]
}

// ── Family catalog (extensible) ──────────────────────────────────────────────
// Order matters only for tie-breaking; the engine picks the highest match count.

export const BOTNET_SIGNATURES: BotnetSignature[] = [
  {
    id: "outlaw",
    name: "Outlaw / mdrfckr",
    aliases: ["mdrfckr", "Shellbot", "Dota"],
    description:
      "Perl/Shellbot-based Monero cryptomining botnet. Wipes ~/.ssh, plants " +
      "its own public key (tag «mdrfckr») for persistence, fingerprints CPU/RAM " +
      "and downloads an XMRig miner.",
    category: "cryptominer",
    patterns: [
      /mdrfckr/i,
      /chattr\s+-ia\s+\.ssh/i,
      /lockr\s+-ia\s+\.ssh/i,
      /rm\s+-rf\s+\.ssh\s+&&\s+mkdir\s+\.ssh/i,
      /chmod\s+-R\s+go=\s+~?\/?\.ssh/i,
    ],
    minMatches: 2,
    references: [
      "https://attack.mitre.org/software/S1083/",
    ],
  },
  {
    id: "ssh_key_persistence",
    name: "SSH key persistence kit",
    aliases: ["authorized_keys backdoor"],
    description:
      "Generic kit that installs an attacker SSH key in authorized_keys to keep " +
      "access even if the password changes. Not attributed to a specific family.",
    category: "backdoor",
    patterns: [
      /echo\s+.*ssh-(rsa|ed25519)\s+AAAA.*>>?\s*[^\s]*authorized_keys/i,
      />>?\s*~?\/?\.ssh\/authorized_keys/i,
    ],
    minMatches: 1,
  },
  {
    id: "xmrig_miner",
    name: "XMRig cryptominer",
    aliases: ["xmrig", "stratum miner"],
    description:
      "Direct deployment of an XMRig miner pointing at a (stratum) mining pool. " +
      "Indicates monetization via cryptomining.",
    category: "cryptominer",
    patterns: [
      /xmrig/i,
      /stratum\+tcp:\/\//i,
      /pool\.(minexmr|supportxmr|xmrpool|nanopool)/i,
    ],
    minMatches: 1,
  },
]

/**
 * Returns the best-matching botnet family for a set of commands, or null when
 * none reaches its `minMatches` threshold (we never invent a family).
 */
export function detectBotnetFamily(commands: string[]): BotnetMatch | null {
  const haystack = commands.filter(Boolean)
  if (haystack.length === 0) return null

  let best: BotnetMatch | null = null

  for (const sig of BOTNET_SIGNATURES) {
    const matched = sig.patterns.filter((p) => haystack.some((cmd) => p.test(cmd)))
    if (matched.length < sig.minMatches) continue

    const candidate: BotnetMatch = {
      id: sig.id,
      name: sig.name,
      aliases: sig.aliases,
      description: sig.description,
      category: sig.category,
      matchedPatterns: matched.map((p) => p.source),
      confidence: matched.length / sig.patterns.length,
      references: sig.references ?? [],
    }

    // Prefer more matched patterns; break ties by higher confidence ratio.
    if (
      !best ||
      candidate.matchedPatterns.length > best.matchedPatterns.length ||
      (candidate.matchedPatterns.length === best.matchedPatterns.length &&
        candidate.confidence > best.confidence)
    ) {
      best = candidate
    }
  }

  return best
}

// ── IoC extraction ───────────────────────────────────────────────────────────

export interface C2Indicator {
  value: string            // canonical display value, e.g. "197.255.229.88:1987"
  type: "url" | "ip"
  host: string
  port?: number
}

export interface PlantedSshKey {
  algorithm: string        // "ssh-rsa" | "ssh-ed25519" | ...
  comment: string | null   // trailing tag, e.g. "mdrfckr"
  fingerprint: string      // short slice of the key material for display
  raw: string              // full key line
}

export interface SessionIocs {
  c2: C2Indicator[]
  sshKeys: PlantedSshKey[]
  malwareHashes: string[]  // SHA-256
}

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/
const URL_RE = /\bhttps?:\/\/[^\s'"`)|>]+/gi
// reverse-shell / raw-socket form: /dev/tcp/<ip>/<port>
const DEV_TCP_RE = /\/dev\/tcp\/((?:\d{1,3}\.){3}\d{1,3})\/(\d{1,5})/gi
// printf payloads carrying a Host: header
const HOST_HDR_RE = /Host:\s*((?:\d{1,3}\.){3}\d{1,3})(?::(\d{1,5}))?/gi
const SHA256_RE = /\b[a-f0-9]{64}\b/gi
const SSH_KEY_RE =
  /(ssh-(?:rsa|ed25519|dss)|ecdsa-sha2-[a-z0-9-]+)\s+(AAAA[0-9A-Za-z+/=]+)(?:\s+([^\s"'>]+))?/g

function hostPortFromUrl(url: string): { host: string; port?: number } | null {
  try {
    const u = new URL(url)
    const port = u.port ? Number(u.port) : undefined
    return { host: u.hostname, port }
  } catch {
    return null
  }
}

/**
 * Pulls actionable indicators out of a list of command strings (C2 endpoints
 * and planted SSH keys). Used where only command text is available — e.g. the
 * threat page's `classifiedCommands` — without full HoneypotEvent objects.
 */
export function extractIocsFromCommands(commands: string[]): SessionIocs {
  const c2 = new Map<string, C2Indicator>()
  const sshKeys = new Map<string, PlantedSshKey>()
  const hashes = new Set<string>()

  const addC2 = (ind: C2Indicator) => {
    if (!c2.has(ind.value)) c2.set(ind.value, ind)
  }

  for (const cmd of commands) {
    if (!cmd) continue

    // C2 — URLs (only those pointing at an IP or with an explicit scheme:port)
    for (const m of cmd.matchAll(URL_RE)) {
      const url = m[0].replace(/[.,;]+$/, "")
      const hp = hostPortFromUrl(url)
      if (!hp) continue
      addC2({ value: url, type: "url", host: hp.host, port: hp.port })
    }

    // C2 — /dev/tcp/<ip>/<port>
    for (const m of cmd.matchAll(DEV_TCP_RE)) {
      const host = m[1]
      const port = Number(m[2])
      addC2({ value: `${host}:${port}`, type: "ip", host, port })
    }

    // C2 — Host: <ip> headers in printf-built requests
    for (const m of cmd.matchAll(HOST_HDR_RE)) {
      const host = m[1]
      const port = m[2] ? Number(m[2]) : undefined
      addC2({ value: port ? `${host}:${port}` : host, type: "ip", host, port })
    }

    // Planted SSH keys (only when written to authorized_keys)
    if (/authorized_keys/i.test(cmd)) {
      for (const m of cmd.matchAll(SSH_KEY_RE)) {
        const [, algorithm, material, comment] = m
        if (!sshKeys.has(material)) {
          sshKeys.set(material, {
            algorithm,
            comment: comment ?? null,
            fingerprint: `${material.slice(0, 12)}…${material.slice(-8)}`,
            raw: `${algorithm} ${material}${comment ? ` ${comment}` : ""}`,
          })
        }
      }
    }

    // Hashes that appear inline in a command
    if (/SHA-?256/i.test(cmd)) {
      for (const h of cmd.matchAll(SHA256_RE)) hashes.add(h[0].toLowerCase())
    }
  }

  return {
    c2: [...c2.values()],
    sshKeys: [...sshKeys.values()],
    malwareHashes: [...hashes],
  }
}

/**
 * Pulls actionable indicators out of a session's events. Reuses the
 * command-text extraction and adds malware SHA-256 hashes from cowrie's
 * `file.download` message (where the hash is recorded).
 */
export function extractIocs(events: HoneypotEvent[]): SessionIocs {
  const base = extractIocsFromCommands(events.map((e) => e.command ?? ""))
  const hashes = new Set(base.malwareHashes)

  for (const ev of events) {
    const msg = ev.message ?? ""
    if (ev.eventType === "file.download" || /SHA-?256/i.test(msg)) {
      for (const h of msg.matchAll(SHA256_RE)) hashes.add(h[0].toLowerCase())
    }
  }

  return { ...base, malwareHashes: [...hashes] }
}

/** True when there is anything worth showing in the threat-intel card. */
export function hasThreatIntel(
  family: BotnetMatch | null,
  iocs: SessionIocs,
): boolean {
  return (
    family !== null ||
    iocs.c2.length > 0 ||
    iocs.sshKeys.length > 0 ||
    iocs.malwareHashes.length > 0
  )
}

// re-export for callers that only want the IPv4 check
export { IPV4 }

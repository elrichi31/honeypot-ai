/**
 * Pure IoC extraction from command strings — no DB, no side effects.
 *
 * Ported from the dashboard's `botnet-signatures.ts` so the backend can
 * aggregate C2 endpoints and planted SSH keys across ALL sessions server-side
 * (the dashboard version only ever runs per-session, client-side). Keeping this
 * in `lib/` respects the layering rule: repositories own SQL, `lib/` holds pure
 * utilities. The regexes are duplicated across the monorepo boundary on purpose
 * — sharing would cross app package boundaries for a handful of constants.
 */

export interface C2Indicator {
  value: string            // canonical display value, e.g. "197.255.229.88:1987"
  type: 'url' | 'ip'
  host: string
  port?: number
}

export interface PlantedSshKey {
  algorithm: string        // "ssh-rsa" | "ssh-ed25519" | ...
  comment: string | null   // trailing tag, e.g. "mdrfckr"
  fingerprint: string      // short slice of the key material for display
  raw: string              // full key line
}

const URL_RE = /\bhttps?:\/\/[^\s'"`)|>]+/gi
// reverse-shell / raw-socket form: /dev/tcp/<ip>/<port>
const DEV_TCP_RE = /\/dev\/tcp\/((?:\d{1,3}\.){3}\d{1,3})\/(\d{1,5})/gi
// printf payloads carrying a Host: header
const HOST_HDR_RE = /Host:\s*((?:\d{1,3}\.){3}\d{1,3})(?::(\d{1,5}))?/gi
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

export interface ExtractedIocs {
  c2: C2Indicator[]
  sshKeys: PlantedSshKey[]
}

/**
 * Pulls C2 endpoints and planted SSH keys out of a list of command strings.
 * Deduped by their canonical value / key material.
 */
export function extractIocsFromCommands(commands: string[]): ExtractedIocs {
  const c2 = new Map<string, C2Indicator>()
  const sshKeys = new Map<string, PlantedSshKey>()

  const addC2 = (ind: C2Indicator) => {
    if (!c2.has(ind.value)) c2.set(ind.value, ind)
  }

  for (const cmd of commands) {
    if (!cmd) continue

    // C2 — URLs (only those we can parse a host from)
    for (const m of cmd.matchAll(URL_RE)) {
      const url = m[0].replace(/[.,;]+$/, '')
      const hp = hostPortFromUrl(url)
      if (!hp) continue
      addC2({ value: url, type: 'url', host: hp.host, port: hp.port })
    }

    // C2 — /dev/tcp/<ip>/<port>
    for (const m of cmd.matchAll(DEV_TCP_RE)) {
      const host = m[1]
      const port = Number(m[2])
      addC2({ value: `${host}:${port}`, type: 'ip', host, port })
    }

    // C2 — Host: <ip> headers in printf-built requests
    for (const m of cmd.matchAll(HOST_HDR_RE)) {
      const host = m[1]
      const port = m[2] ? Number(m[2]) : undefined
      addC2({ value: port ? `${host}:${port}` : host, type: 'ip', host, port })
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
            raw: `${algorithm} ${material}${comment ? ` ${comment}` : ''}`,
          })
        }
      }
    }
  }

  return {
    c2: [...c2.values()],
    sshKeys: [...sshKeys.values()],
  }
}

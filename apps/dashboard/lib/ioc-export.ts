/**
 * IoC formatting / export helpers — pure, no React, fully testable.
 * Used by the global IoCs page to produce copy-paste lists and downloadable
 * CSV / STIX 2.1 bundles.
 */

export type IocType = "ip" | "hash" | "c2" | "sshkey"

export interface IocEntry {
  type: IocType
  value: string
  meta?: Record<string, string | number | undefined>
}

/** One indicator per line — for "copy all" into a firewall / SIEM. */
export function toPlainList(entries: IocEntry[]): string {
  return entries.map((e) => e.value).join("\n")
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

/** CSV with a header row. Columns: type, value, source, first_seen, extra. */
export function toCsv(entries: IocEntry[]): string {
  const header = ["type", "value", "source", "first_seen", "extra"]
  const rows = entries.map((e) => {
    const source = String(e.meta?.source ?? "")
    const firstSeen = String(e.meta?.capturedAt ?? e.meta?.firstSeen ?? "")
    const extra = Object.entries(e.meta ?? {})
      .filter(([k]) => k !== "source" && k !== "capturedAt" && k !== "firstSeen")
      .map(([k, v]) => `${k}=${v}`)
      .join("; ")
    return [e.type, e.value, source, firstSeen, extra].map((c) => csvEscape(String(c))).join(",")
  })
  return [header.join(","), ...rows].join("\n")
}

// Deterministic-enough UUID v4 for STIX ids (crypto.randomUUID in the browser).
function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const IOC_LABEL: Record<IocType, string> = {
  ip: "Malicious IP",
  hash: "Malware hash",
  c2: "C2 endpoint",
  sshkey: "Planted SSH key",
}

/** STIX 2.1 pattern for a single IoC. */
export function stixPattern(entry: IocEntry): string {
  if (entry.type === "ip") return `[ipv4-addr:value = '${entry.value}']`
  if (entry.type === "c2") {
    // URL C2 → url:value; host:port or bare IP → ipv4-addr.
    if (entry.value.startsWith("http")) return `[url:value = '${entry.value}']`
    const host = String(entry.meta?.host ?? entry.value.split(":")[0])
    return `[ipv4-addr:value = '${host}']`
  }
  if (entry.type === "sshkey") {
    // No native STIX object for an authorized_keys entry; carry the raw key so
    // an analyst can grep for it. Escape single quotes to keep the pattern valid.
    return `[artifact:payload_bin = '${entry.value.replace(/'/g, "\\'")}']`
  }
  // Hashes: cowrie stores SHA-256 (64 hex), dionaea MD5 (32 hex).
  const algo = entry.value.length === 32 ? "MD5" : "SHA-256"
  return `[file:hashes.'${algo}' = '${entry.value.toLowerCase()}']`
}

/** A minimal but valid STIX 2.1 bundle, one indicator object per IoC. */
export function toStixBundle(entries: IocEntry[], now = new Date()): string {
  const ts = now.toISOString()
  const objects = entries.map((e) => ({
    type: "indicator",
    spec_version: "2.1",
    id: `indicator--${uuid()}`,
    created: ts,
    modified: ts,
    valid_from: ts,
    name: `${IOC_LABEL[e.type]}: ${e.value}`,
    pattern: stixPattern(e),
    pattern_type: "stix",
    labels: ["malicious-activity"],
  }))
  return JSON.stringify(
    { type: "bundle", id: `bundle--${uuid()}`, objects },
    null,
    2,
  )
}

// MISP attribute type per IoC kind. C2 splits URL vs IP; hashes split by length.
function mispAttribute(e: IocEntry): { type: string; category: string; value: string } {
  if (e.type === "ip") return { type: "ip-dst", category: "Network activity", value: e.value }
  if (e.type === "c2") {
    if (e.value.startsWith("http")) return { type: "url", category: "Network activity", value: e.value }
    return { type: "ip-dst|port", category: "Network activity", value: e.value.replace(":", "|") }
  }
  if (e.type === "sshkey") return { type: "ssh-authorized-keys", category: "Artifacts dropped", value: e.value }
  const type = e.value.length === 32 ? "md5" : "sha256"
  return { type, category: "Payload delivery", value: e.value.toLowerCase() }
}

/** A MISP Event (v2) JSON with one Attribute per IoC, all `to_ids: true`. */
export function toMispEvent(entries: IocEntry[], now = new Date()): string {
  const date = now.toISOString().slice(0, 10)
  const Attribute = entries.map((e) => {
    const a = mispAttribute(e)
    return {
      type: a.type,
      category: a.category,
      value: a.value,
      to_ids: true,
      comment: String(e.meta?.source ?? "honeypot"),
    }
  })
  return JSON.stringify(
    {
      Event: {
        uuid: uuid(),
        info: "HoneyTrap honeypot indicators of compromise",
        date,
        threat_level_id: "2",
        analysis: "2",
        Attribute,
      },
    },
    null,
    2,
  )
}

export type IocBundleFormat = "csv" | "stix" | "misp"

/**
 * Unified export of every section (IPs + hashes + C2 + SSH keys) in one file.
 * CSV carries a `type` column; STIX/MISP emit a single bundle/event.
 */
export function toBundle(entries: IocEntry[], format: IocBundleFormat): string {
  if (format === "csv") return toCsv(entries)
  if (format === "misp") return toMispEvent(entries)
  return toStixBundle(entries)
}

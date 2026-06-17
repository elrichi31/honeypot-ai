/**
 * IoC formatting / export helpers — pure, no React, fully testable.
 * Used by the global IoCs page to produce copy-paste lists and downloadable
 * CSV / STIX 2.1 bundles.
 */

export type IocType = "ip" | "hash"

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

/** STIX 2.1 pattern for a single IoC. */
export function stixPattern(entry: IocEntry): string {
  if (entry.type === "ip") return `[ipv4-addr:value = '${entry.value}']`
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
    name: `${e.type === "ip" ? "Malicious IP" : "Malware hash"}: ${e.value}`,
    pattern: stixPattern(e),
    pattern_type: "stix",
    labels: [e.type === "ip" ? "malicious-activity" : "malicious-activity"],
  }))
  return JSON.stringify(
    { type: "bundle", id: `bundle--${uuid()}`, objects },
    null,
    2,
  )
}

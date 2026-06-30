import type { ReportRange } from "../types"

export function rangeToDays(range: ReportRange): number {
  return range === "week" ? 7 : 30
}

export function buildPeriodLabel(range: ReportRange, generatedAt: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  })
  const end = new Date(generatedAt)
  const start = new Date(end)
  start.setDate(start.getDate() - rangeToDays(range))
  return `${fmt.format(start)} - ${fmt.format(end)}`
}

export function buildPeriodStart(range: ReportRange, generatedAt: Date): Date {
  const start = new Date(generatedAt)
  start.setDate(start.getDate() - rangeToDays(range))
  return start
}

export function fmt(n: number | null | undefined): string {
  if (n == null) return "-"
  return n.toLocaleString("en-US")
}

export function truncPassword(value: string | null | undefined): string {
  if (!value) return "-"
  return value.length > 22 ? `${value.slice(0, 21)}...` : value
}

export function pct(n: number | null | undefined): string {
  if (n == null) return "-"
  return `${n.toFixed(1)}%`
}

export function deltaStr(d: number | null | undefined): string | null {
  if (d == null) return null
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`
}

export function rate(value: number, total: number): string {
  if (total <= 0) return "0.0%"
  return `${((value / total) * 100).toFixed(1)}%`
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function protocolLabel(protocol: string): string {
  const labels: Record<string, string> = {
    ssh: "SSH Honeypot",
    smb: "SMB Honeypot",
    mysql: "MySQL Honeypot",
    ftp: "FTP Honeypot",
    http: "Web Honeypot",
    "port-scan": "Port Honeypot",
    dionaea: "Dionaea Multi-Protocol Honeypot",
    mqtt: "MQTT Honeypot",
    mssql: "MSSQL Honeypot",
    tftp: "TFTP Honeypot",
    rpc: "RPC Honeypot",
  }
  return labels[protocol] ?? protocol.toUpperCase()
}

export function sensorNarrative(protocol: string): string {
  const copy: Record<string, string> = {
    ssh: "Interactive shell telemetry with authentication attempts, command execution depth, and post-login behavior.",
    smb: "Windows file-sharing exposure focused on share access, credential use, file transfer, and lateral movement signals.",
    mysql: "Database probe telemetry covering login attempts, targeted usernames, password reuse, and command-style interaction.",
    ftp: "File-transfer attack surface showing login attempts, command usage, and staged upload or download behavior.",
    http: "Web attack traffic across paths, methods, attack types, and recon or exploitation sequences.",
    "port-scan": "Decoy service exposure that highlights scanned ports, inferred services, and broad reconnaissance behavior.",
    dionaea: "Multi-protocol exploitation visibility across common worm, malware-delivery, and service-probing paths.",
    mqtt: "IoT broker abuse telemetry with topic interaction, broker access attempts, and bot-style automation patterns.",
    mssql: "SQL Server access attempts with credential abuse, service targeting, and command execution probes.",
    tftp: "File delivery and retrieval attempts often associated with automated staging or firmware distribution.",
    rpc: "RPC and endpoint-mapper probing that can indicate Windows discovery or exploit preparation.",
  }
  return copy[protocol] ?? "Sensor-specific telemetry for this exposed service."
}

export function sumBucket(bucket: Record<string, number | string>): number {
  return Object.entries(bucket).reduce((sum, [key, value]) => {
    if (key === "label") return sum
    return typeof value === "number" ? sum + value : sum
  }, 0)
}

export function aggregateLabelCounts(groups: Array<Array<{ label: string; count: number }>>, limit: number) {
  const totals = new Map<string, number>()
  for (const group of groups) {
    for (const item of group) {
      totals.set(item.label, (totals.get(item.label) ?? 0) + item.count)
    }
  }
  return Array.from(totals.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
}

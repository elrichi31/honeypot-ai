import type { ReportDetailCount, ReportLabelCount } from "../types"

export const PORT_SERVICE: Record<number, string> = {
  21: "FTP", 22: "SSH", 23: "Telnet", 445: "SMB", 1433: "MSSQL", 1883: "MQTT",
  2375: "Docker", 3306: "MySQL", 3389: "RDP", 4444: "Metasploit", 5432: "PostgreSQL",
  5900: "VNC", 6379: "Redis", 8080: "HTTP-alt", 8888: "HTTP-alt", 9090: "Prometheus",
  9200: "Elasticsearch", 11211: "Memcached", 27017: "MongoDB",
}

export function groupLabelCounts(rows: { sensor_id: string; label: string; count: string }[]) {
  const map = new Map<string, ReportLabelCount[]>()
  for (const row of rows) {
    const list = map.get(row.sensor_id) ?? []
    list.push({ label: row.label, count: Number(row.count) })
    map.set(row.sensor_id, list)
  }
  return map
}

export function groupDetailCounts(
  rows: { sensor_id: string; label: string; detail?: string | null; count: string }[],
) {
  const map = new Map<string, ReportDetailCount[]>()
  for (const row of rows) {
    const list = map.get(row.sensor_id) ?? []
    list.push({ label: row.label, detail: row.detail, count: Number(row.count) })
    map.set(row.sensor_id, list)
  }
  return map
}

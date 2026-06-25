export interface Alert {
  id: string; sensor_id: string; timestamp: string
  src_ip: string; src_port: number | null; dest_ip: string; dest_port: number | null
  proto: string; action: string; signature_id: number; signature: string
  category: string; severity: number; in_iface: string | null; country: string | null
}

export type Range = "24h" | "7d" | "30d"

export interface Stats {
  last24h: { total: number; critical: number; high: number; medium: number; low: number }
  threats24h: { total: number; critical: number; high: number; medium: number; low: number }
  topSignatures: Array<{ signature: string; severity: number; severityLabel: string; count: number }>
  topThreatSignatures: Array<{ signature: string; severity: number; severityLabel: string; category: string; count: number }>
  topSources: Array<{ srcIp: string; count: number; country: string | null }>
  timeline: Array<{ bucket: string; total: number; threats: number }>
}

export interface Pagination {
  page: number; pageSize: number; total: number; totalPages: number
  hasNextPage: boolean; hasPreviousPage: boolean
}

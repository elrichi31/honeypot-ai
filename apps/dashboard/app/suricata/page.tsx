"use client"

import { useEffect, useState, useCallback } from "react"
import { Shield, AlertTriangle, RefreshCw, Search } from "lucide-react"
import { PageShell } from "@/components/page-shell"

const SEVERITY_CONFIG = {
  1: { label: "Critical", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  2: { label: "High",     className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  3: { label: "Medium",   className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  4: { label: "Low",      className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
} as const

type SeverityKey = keyof typeof SEVERITY_CONFIG

interface Alert {
  id: string
  sensor_id: string
  timestamp: string
  src_ip: string
  src_port: number | null
  dest_ip: string
  dest_port: number | null
  proto: string
  action: string
  signature_id: number
  signature: string
  category: string
  severity: number
  in_iface: string | null
}

interface Stats {
  last24h: { total: number; critical: number; high: number; medium: number; low: number }
  topSignatures: Array<{ signature: string; severity: number; severityLabel: string; count: number }>
  topSources: Array<{ srcIp: string; count: number }>
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

function SeverityBadge({ severity }: { severity: number }) {
  const cfg = SEVERITY_CONFIG[severity as SeverityKey] ?? SEVERITY_CONFIG[4]
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function StatCard({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${className ?? "text-foreground"}`}>
        {value.toLocaleString("en-US")}
      </p>
    </div>
  )
}

export default function SuricataPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [severity, setSeverity] = useState<string>("")
  const [q, setQ] = useState("")
  const [qInput, setQInput] = useState("")

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/suricata/stats")
      if (res.ok) setStats(await res.json())
    } catch {}
  }, [])

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" })
      if (severity) params.set("severity", severity)
      if (q) params.set("q", q)
      const res = await fetch(`/api/suricata/alerts?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAlerts(data.items ?? [])
        setPagination(data.pagination ?? null)
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [page, severity, q])

  useEffect(() => {
    fetchStats()
    fetchAlerts()
  }, [fetchStats, fetchAlerts])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    setQ(qInput.trim())
  }

  return (
    <PageShell>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Shield className="h-5 w-5 text-blue-400" />
          <h1 className="text-2xl font-semibold text-foreground">Network IDS</h1>
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
            Suricata
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Real-time network intrusion detection · ET Open rules · last 24 hours
        </p>
      </div>

      {/* Stats */}
      {stats ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Total Alerts" value={stats.last24h.total} />
          <StatCard label="Critical" value={stats.last24h.critical} className="text-red-400" />
          <StatCard label="High" value={stats.last24h.high} className="text-orange-400" />
          <StatCard label="Medium" value={stats.last24h.medium} className="text-yellow-400" />
          <StatCard label="Low" value={stats.last24h.low} className="text-blue-400" />
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {/* Top signatures + top sources */}
      {stats && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium text-foreground">Top Signatures (24h)</p>
            <div className="space-y-2">
              {stats.topSignatures.slice(0, 7).map((sig, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <SeverityBadge severity={sig.severity} />
                  <span className="flex-1 truncate text-muted-foreground" title={sig.signature}>
                    {sig.signature}
                  </span>
                  <span className="tabular-nums text-foreground font-medium">{sig.count}</span>
                </div>
              ))}
              {stats.topSignatures.length === 0 && (
                <p className="text-xs text-muted-foreground">No alerts in last 24 hours</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-sm font-medium text-foreground">Top Sources (24h)</p>
            <div className="space-y-2">
              {stats.topSources.slice(0, 7).map((src, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 font-mono text-foreground">{src.srcIp}</span>
                  <span className="tabular-nums text-muted-foreground">{src.count} alerts</span>
                </div>
              ))}
              {stats.topSources.length === 0 && (
                <p className="text-xs text-muted-foreground">No alerts in last 24 hours</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Signature, category, IP..."
              className="h-8 rounded-lg border border-border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            className="h-8 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            Search
          </button>
        </form>

        <select
          value={severity}
          onChange={(e) => { setSeverity(e.target.value); setPage(1) }}
          className="h-8 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground"
        >
          <option value="">All severities</option>
          <option value="1">Critical</option>
          <option value="2">High</option>
          <option value="3">Medium</option>
          <option value="4">Low</option>
        </select>

        <button
          onClick={() => { fetchStats(); fetchAlerts() }}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Alerts table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="space-y-px">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-muted/20" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertTriangle className="mb-2 h-8 w-8 opacity-40" />
            <p className="text-sm">No alerts found</p>
            <p className="text-xs opacity-60 mt-1">
              Suricata alerts will appear here once the sensor is running
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">Severity</th>
                  <th className="px-4 py-2.5 text-left font-medium">Time</th>
                  <th className="px-4 py-2.5 text-left font-medium">Source</th>
                  <th className="px-4 py-2.5 text-left font-medium">Destination</th>
                  <th className="px-4 py-2.5 text-left font-medium">Proto</th>
                  <th className="px-4 py-2.5 text-left font-medium">Signature</th>
                  <th className="px-4 py-2.5 text-left font-medium">Category</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <SeverityBadge severity={alert.severity} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(alert.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {alert.src_ip}{alert.src_port ? `:${alert.src_port}` : ""}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {alert.dest_ip}{alert.dest_port ? `:${alert.dest_port}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground uppercase">
                      {alert.proto}
                    </td>
                    <td className="px-4 py-2.5 max-w-xs">
                      <span className="block truncate text-xs" title={alert.signature}>
                        {alert.signature}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      <span className="block truncate max-w-[180px]" title={alert.category}>
                        {alert.category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
            <span>
              {((pagination.page - 1) * pagination.pageSize + 1).toLocaleString("en-US")}–
              {Math.min(pagination.page * pagination.pageSize, pagination.total).toLocaleString("en-US")} of{" "}
              {pagination.total.toLocaleString("en-US")}
            </span>
            <div className="flex gap-2">
              <button
                disabled={!pagination.hasPreviousPage}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-border px-3 py-1 text-xs disabled:opacity-40 hover:bg-muted/20"
              >
                Previous
              </button>
              <button
                disabled={!pagination.hasNextPage}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-border px-3 py-1 text-xs disabled:opacity-40 hover:bg-muted/20"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}

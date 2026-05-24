"use client"

import { useEffect, useState, useCallback } from "react"
import { Bug, RefreshCw, Search } from "lucide-react"
import { PageShell } from "@/components/page-shell"

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  emergency:     { label: "Emergency",    className: "bg-red-500/20 text-red-400 border-red-500/30" },
  alert:         { label: "Alert",        className: "bg-red-500/20 text-red-400 border-red-500/30" },
  critical:      { label: "Critical",     className: "bg-red-500/20 text-red-400 border-red-500/30" },
  error:         { label: "Error",        className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  warning:       { label: "Warning",      className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  notice:        { label: "Notice",       className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  informational: { label: "Info",         className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  debug:         { label: "Debug",        className: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
}

interface FalcoAlert {
  id: string
  sensor_id: string
  rule: string
  priority: string
  output: string
  container_id: string | null
  container_name: string | null
  proc_name: string | null
  proc_cmdline: string | null
  user_name: string | null
  evt_type: string | null
  tags: string[]
  timestamp: string
  severityLabel: string
}

interface Stats {
  last24h: { total: number; critical: number; high: number; medium: number; low: number }
  topRules: Array<{ rule: string; priority: string; severityLabel: string; count: number }>
  topContainers: Array<{ containerName: string; count: number }>
}

interface Pagination {
  page: number; pageSize: number; total: number; totalPages: number
  hasNextPage: boolean; hasPreviousPage: boolean
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority.toLowerCase()] ?? PRIORITY_CONFIG.warning
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function StatCard({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="text-sm text-white/60">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${className ?? "text-white"}`}>{value.toLocaleString()}</div>
    </div>
  )
}

export default function FalcoPage() {
  const [stats, setStats]       = useState<Stats | null>(null)
  const [alerts, setAlerts]     = useState<FalcoAlert[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState("")
  const [priority, setPriority] = useState("")

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/falco/stats")
      if (res.ok) setStats(await res.json())
    } catch {}
  }, [])

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" })
      if (priority) params.set("priority", priority)
      if (search)   params.set("q", search)
      const res = await fetch(`/api/falco/alerts?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAlerts(data.items ?? [])
        setPagination(data.pagination ?? null)
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [page, priority, search])

  useEffect(() => { fetchStats(); fetchAlerts() }, [fetchStats, fetchAlerts])

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); fetchAlerts() }
  const refresh = () => { fetchStats(); fetchAlerts() }

  return (
    <PageShell
      title="Container IDS"
      subtitle="Falco · Runtime behavioral detection · last 24 hours"
      icon={<Bug className="h-5 w-5" />}
    >
      <div className="space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Total Alerts"   value={stats?.last24h.total    ?? 0} />
          <StatCard label="Critical"       value={stats?.last24h.critical ?? 0} className="text-red-400" />
          <StatCard label="High"           value={stats?.last24h.high     ?? 0} className="text-orange-400" />
          <StatCard label="Medium"         value={stats?.last24h.medium   ?? 0} className="text-yellow-400" />
          <StatCard label="Low"            value={stats?.last24h.low      ?? 0} className="text-blue-400" />
        </div>

        {/* Top panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Rules */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-medium text-white/80 mb-3">Top Rules (24h)</h3>
            {stats?.topRules.length === 0 && (
              <p className="text-xs text-white/40">No alerts yet</p>
            )}
            <div className="space-y-2">
              {stats?.topRules.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <PriorityBadge priority={r.priority} />
                    <span className="text-xs text-white/70 truncate">{r.rule}</span>
                  </div>
                  <span className="text-xs text-white/50 shrink-0">{r.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Containers */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h3 className="text-sm font-medium text-white/80 mb-3">Top Containers (24h)</h3>
            {stats?.topContainers.length === 0 && (
              <p className="text-xs text-white/40">No alerts yet</p>
            )}
            <div className="space-y-2">
              {stats?.topContainers.map((c, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-white/70 font-mono">{c.containerName}</span>
                  <span className="text-xs text-white/50">{c.count} alerts</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rule, container, output..."
              className="w-full rounded border border-white/10 bg-white/5 py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>
          <select
            value={priority}
            onChange={(e) => { setPriority(e.target.value); setPage(1) }}
            className="rounded border border-white/10 bg-white/5 py-1.5 px-3 text-sm text-white focus:outline-none"
          >
            <option value="">All priorities</option>
            <option value="emergency">Emergency</option>
            <option value="critical">Critical</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="notice">Notice</option>
            <option value="informational">Informational</option>
          </select>
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 hover:bg-white/10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </form>

        {/* Alerts table */}
        <div className="rounded-lg border border-white/10 bg-white/5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-white/50">
                <th className="px-4 py-2">Priority</th>
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Container</th>
                <th className="px-4 py-2">Process</th>
                <th className="px-4 py-2">Rule</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-white/40">Loading...</td>
                </tr>
              )}
              {!loading && alerts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-white/40">No alerts found</td>
                </tr>
              )}
              {!loading && alerts.map((a) => (
                <tr key={a.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-2.5">
                    <PriorityBadge priority={a.priority} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-white/50 whitespace-nowrap">
                    {new Date(a.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-white/70">
                    {a.container_name ?? <span className="text-white/30">(host)</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-white/60">
                    {a.proc_cmdline ?? a.proc_name ?? <span className="text-white/30">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-white/80 max-w-xs truncate" title={a.rule}>
                    {a.rule}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-white/50">
            <span>{pagination.total.toLocaleString()} total alerts</span>
            <div className="flex gap-2">
              <button
                disabled={!pagination.hasPreviousPage}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-white/10 px-3 py-1 disabled:opacity-30 hover:bg-white/10"
              >
                Previous
              </button>
              <span className="px-3 py-1">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                disabled={!pagination.hasNextPage}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-white/10 px-3 py-1 disabled:opacity-30 hover:bg-white/10"
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

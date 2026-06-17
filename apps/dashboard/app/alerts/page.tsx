"use client"

import { useEffect, useState, useCallback } from "react"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"
import { Bell, Check, CheckCheck, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"

type AlertField = { name: string; value: string; inline?: boolean }

type Alert = {
  id: string
  alertKey: string
  level: "critical" | "high" | "info" | string
  title: string
  description: string
  fields: AlertField[]
  srcIp: string | null
  sensorId: string | null
  clientId: string | null
  clientName: string | null
  readAt: string | null
  createdAt: string
}

type AlertsResponse = { alerts: Alert[]; unreadCount: number }

type ClientLite = { id: string; name: string }

const LEVEL_STYLES: Record<string, { dot: string; badge: string; label: string }> = {
  critical: { dot: "bg-red-500",   badge: "bg-red-500/10 text-red-400",     label: "Critical" },
  high:     { dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-400", label: "High" },
  info:     { dot: "bg-blue-500",  badge: "bg-blue-500/10 text-blue-400",   label: "Info" },
}

function levelStyle(level: string) {
  return LEVEL_STYLES[level] ?? { dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground", label: level }
}

export default function AlertsPage() {
  const tz = useTimezone()
  const [data, setData] = useState<AlertsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [clients, setClients] = useState<ClientLite[]>([])
  const [clientId, setClientId] = useState<string>("")   // "" = all clients
  const [isSuperadmin, setIsSuperadmin] = useState(false)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/alerts?limit=100${clientId ? `&clientId=${encodeURIComponent(clientId)}` : ""}`)
      if (res.ok) setData(await res.json())
      else toast.error("Could not load alerts")
    } catch {
      toast.error("Network error while loading alerts")
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  // Only superadmins get the tenant selector; scoped users are pinned to their
  // own client server-side and see no dropdown. Load /api/me first, then the
  // client list only if superadmin.
  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me: { isSuperadmin?: boolean } | null) => {
        if (!me?.isSuperadmin) return
        setIsSuperadmin(true)
        return fetch("/api/clients")
          .then((r) => (r.ok ? r.json() : []))
          .then((rows: Array<{ id: string; name: string }>) =>
            setClients(rows.map((c) => ({ id: c.id, name: c.name }))))
      })
      .catch(() => {})
  }, [])

  async function markRead(id: string) {
    // Optimistic: flip the row to read immediately.
    setData((prev) => prev && {
      ...prev,
      alerts: prev.alerts.map((a) => (a.id === id ? { ...a, readAt: new Date().toISOString() } : a)),
      unreadCount: Math.max(0, prev.unreadCount - 1),
    })
    try {
      const res = await fetch(`/api/alerts/${encodeURIComponent(id)}/read`, { method: "POST" })
      if (!res.ok) throw new Error()
    } catch {
      toast.error("Could not mark as read")
      fetchAlerts()
    }
  }

  async function markAllRead() {
    setMarkingAll(true)
    try {
      const res = await fetch(`/api/alerts/read-all${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`, { method: "POST" })
      if (!res.ok) throw new Error()
      const body = await res.json().catch(() => ({}))
      toast.success(`${body.updated ?? 0} alert(s) marked as read`)
      fetchAlerts()
    } catch {
      toast.error("Could not mark all as read")
    } finally {
      setMarkingAll(false)
    }
  }

  async function deleteOne(id: string) {
    // Optimistic removal.
    setData((prev) => prev && { ...prev, alerts: prev.alerts.filter((a) => a.id !== id) })
    try {
      const res = await fetch(`/api/alerts/${encodeURIComponent(id)}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
    } catch {
      toast.error("Could not delete alert")
      fetchAlerts()
    }
  }

  async function deleteAll() {
    const scope = clientId ? "for this client" : "across all clients"
    if (!confirm(`Delete all alerts ${scope}? This cannot be undone.`)) return
    setDeletingAll(true)
    try {
      const res = await fetch(`/api/alerts${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      const body = await res.json().catch(() => ({}))
      toast.success(`${body.deleted ?? 0} alert(s) deleted`)
      fetchAlerts()
    } catch {
      toast.error("Could not delete alerts")
    } finally {
      setDeletingAll(false)
    }
  }

  const unread = data?.unreadCount ?? 0
  const total = data?.alerts.length ?? 0

  return (
    <PageShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Alerts</h1>
          <p className="text-sm text-muted-foreground">
            {!isSuperadmin
              ? "Threat alerts for your honeypots."
              : clientId
                ? `Threat alerts for ${clients.find((c) => c.id === clientId)?.name ?? "the selected client"}.`
                : "Threat alerts across all clients and sensors."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSuperadmin && (
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground"
              title="Enter a tenant (superadmin)"
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <Surface className="flex items-center gap-2 px-4 py-3">
            <Bell className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium text-foreground">{unread}</span>
            <span className="text-sm text-muted-foreground">unread</span>
          </Surface>
          <button
            onClick={markAllRead}
            disabled={markingAll || unread === 0}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {markingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Mark all as read
          </button>
          <button
            onClick={deleteAll}
            disabled={deletingAll || total === 0}
            className="flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-card px-3 py-3 text-sm text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deletingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete all
          </button>
        </div>
      </div>

      <Surface className="overflow-hidden">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">Loading alerts...</div>
        ) : !data || data.alerts.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Bell className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No alerts</p>
            <p className="text-sm text-muted-foreground">Alerts that fire will appear here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.alerts.map((alert) => {
              const style = levelStyle(alert.level)
              const isUnread = !alert.readAt
              return (
                <li
                  key={alert.id}
                  className={`flex items-start gap-3 px-4 py-3.5 transition-colors ${isUnread ? "bg-amber-500/[0.03]" : ""}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isUnread ? style.dot : "bg-transparent border border-border"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${style.badge}`}>
                        {style.label}
                      </span>
                      <span className="text-sm font-medium text-foreground">{alert.title}</span>
                      {isUnread && <span className="text-[10px] uppercase tracking-wide text-amber-400">new</span>}
                    </div>
                    {alert.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{alert.description}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{formatInTimezone(alert.createdAt, tz, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span>
                      <span className="inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 font-medium text-foreground">
                        {alert.clientName ?? "Unknown client"}
                      </span>
                      {alert.srcIp && <span className="font-mono">IP: {alert.srcIp}</span>}
                      {alert.sensorId && <span className="font-mono">Sensor: {alert.sensorId}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {isUnread && (
                      <button
                        onClick={() => markRead(alert.id)}
                        title="Mark as read"
                        className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteOne(alert.id)}
                      title="Delete alert"
                      className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Surface>
    </PageShell>
  )
}

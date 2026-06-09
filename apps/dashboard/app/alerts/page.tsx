"use client"

import { useEffect, useState, useCallback } from "react"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { PageShell } from "@/components/page-shell"

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
  readAt: string | null
  createdAt: string
}

type AlertsResponse = { alerts: Alert[]; unreadCount: number }

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

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/alerts?limit=100")
      if (res.ok) setData(await res.json())
      else toast.error("No se pudieron cargar las alertas")
    } catch {
      toast.error("Error de red al cargar alertas")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

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
      toast.error("No se pudo marcar como leída")
      fetchAlerts()
    }
  }

  async function markAllRead() {
    setMarkingAll(true)
    try {
      const res = await fetch("/api/alerts/read-all", { method: "POST" })
      if (!res.ok) throw new Error()
      const body = await res.json().catch(() => ({}))
      toast.success(`${body.updated ?? 0} alerta(s) marcadas como leídas`)
      fetchAlerts()
    } catch {
      toast.error("No se pudieron marcar todas como leídas")
    } finally {
      setMarkingAll(false)
    }
  }

  const unread = data?.unreadCount ?? 0

  return (
    <PageShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Alertas</h1>
          <p className="text-sm text-muted-foreground">
            Alertas de amenazas de todos los clientes y sensores.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
            <Bell className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-medium text-foreground">{unread}</span>
            <span className="text-sm text-muted-foreground">sin leer</span>
          </div>
          <button
            onClick={markAllRead}
            disabled={markingAll || unread === 0}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {markingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Marcar todas leídas
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">Cargando alertas...</div>
        ) : !data || data.alerts.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Bell className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No hay alertas</p>
            <p className="text-sm text-muted-foreground">Las alertas que se disparen aparecerán aquí.</p>
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
                      {isUnread && <span className="text-[10px] uppercase tracking-wide text-amber-400">nuevo</span>}
                    </div>
                    {alert.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{alert.description}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{formatInTimezone(alert.createdAt, tz, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span>
                      {alert.srcIp && <span className="font-mono">IP: {alert.srcIp}</span>}
                      {alert.sensorId && <span className="font-mono">Sensor: {alert.sensorId}</span>}
                    </div>
                  </div>
                  {isUnread && (
                    <button
                      onClick={() => markRead(alert.id)}
                      title="Marcar como leída"
                      className="shrink-0 rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </PageShell>
  )
}

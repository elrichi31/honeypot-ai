"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"
import { Bell, Check, CheckCheck, ChevronDown, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { assertOk } from "@/lib/client-fetch"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { useTenant } from "@/components/tenant-context"
import { useT } from "@/components/locale-provider"
import { cn } from "@/lib/utils"
import type { TranslationKey } from "@/lib/i18n/dictionaries"

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

const LEVEL_STYLES: Record<string, { dot: string; badge: string }> = {
  critical: { dot: "bg-red-500",   badge: "bg-red-500/10 text-red-400" },
  high:     { dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-400" },
  info:     { dot: "bg-blue-500",  badge: "bg-blue-500/10 text-blue-400" },
}

const LEVEL_LABEL_KEYS: Record<string, TranslationKey> = {
  critical: "alerts.severity.critical",
  high: "alerts.severity.high",
  info: "alerts.severity.info",
}

const SEVERITIES = ["critical", "high", "info"] as const

// Alert type is parsed from the alertKey prefix (e.g. "auth_burst:1.2.3.4" →
// "auth_burst"), not a stored column — see threat-alerts.ts persistAlert.
// sensor-offline keys use a hyphen instead of an underscore.
function alertType(alertKey: string): string {
  const idx = alertKey.indexOf(":")
  return idx === -1 ? alertKey : alertKey.slice(0, idx)
}

const TYPE_LABEL_KEYS: Record<string, TranslationKey> = {
  threat_score: "set.alerts.typeThreatScore",
  multi_service: "set.alerts.typeMultiService",
  auth_burst: "set.alerts.typeAuthBurst",
  post_auth: "set.alerts.typePostAuth",
  first_login: "set.alerts.typeFirstLogin",
  attack_chain: "set.alerts.typeAttackChain",
  "sensor-offline": "set.alerts.typeSensorOffline",
  sensor_sweep: "set.alerts.typeSensorSweep",
  port_fanout: "set.alerts.typePortScanFanout",
  cred_reuse_cross_sensor: "set.alerts.typeCredReuse",
  deception: "set.alerts.typeDeception",
  canary: "set.alerts.typeCanary",
}

type GroupBy = "none" | "type" | "client" | "srcIp"

export default function AlertsPage() {
  const t = useT()
  const tz = useTimezone()
  const [data, setData] = useState<AlertsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [severity, setSeverity] = useState<string>("")
  const [groupBy, setGroupBy] = useState<GroupBy>("none")
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const { tenantId } = useTenant()

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // The active tenant scope lives in the global switcher (a cookie the server
  // reads), so we just refetch when it changes — no ?clientId needed here.
  // AbortController cancels any in-flight request when the tenant changes,
  // preventing stale responses from overwriting fresh data.
  const fetchAlerts = useCallback(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/alerts?limit=100`, { signal: controller.signal })
      .then((res) => assertOk(res, "Could not load alerts"))
      .then((res) => res.json())
      .then((body) => { setData(body); setLoading(false) })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        toast.error(err instanceof Error ? err.message : "Could not load alerts")
        setLoading(false)
      })
    return controller
  }, [])

  useEffect(() => {
    const controller = fetchAlerts()
    return () => controller.abort()
  }, [fetchAlerts, tenantId])

  async function markRead(id: string) {
    // Optimistic: flip the row to read immediately.
    setData((prev) => prev && {
      ...prev,
      alerts: prev.alerts.map((a) => (a.id === id ? { ...a, readAt: new Date().toISOString() } : a)),
      unreadCount: Math.max(0, prev.unreadCount - 1),
    })
    try {
      await assertOk(await fetch(`/api/alerts/${encodeURIComponent(id)}/read`, { method: "POST" }), "Could not mark as read")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark as read")
      fetchAlerts()
    }
  }

  async function markAllRead() {
    setMarkingAll(true)
    try {
      const res = await assertOk(await fetch(`/api/alerts/read-all`, { method: "POST" }), "Could not mark all as read")
      const body = await res.json().catch(() => ({}))
      toast.success(`${body.updated ?? 0} alert(s) marked as read`)
      fetchAlerts()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark all as read")
    } finally {
      setMarkingAll(false)
    }
  }

  async function deleteOne(id: string) {
    // Optimistic removal.
    setData((prev) => prev && { ...prev, alerts: prev.alerts.filter((a) => a.id !== id) })
    try {
      await assertOk(await fetch(`/api/alerts/${encodeURIComponent(id)}`, { method: "DELETE" }), "Could not delete alert")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete alert")
      fetchAlerts()
    }
  }

  async function deleteAll() {
    const scope = tenantId ? "for the selected tenant" : "in the current scope"
    if (!confirm(`Delete all alerts ${scope}? This cannot be undone.`)) return
    setDeletingAll(true)
    try {
      const res = await assertOk(await fetch(`/api/alerts`, { method: "DELETE" }), "Could not delete alerts")
      const body = await res.json().catch(() => ({}))
      toast.success(`${body.deleted ?? 0} alert(s) deleted`)
      fetchAlerts()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete alerts")
    } finally {
      setDeletingAll(false)
    }
  }

  const unread = data?.unreadCount ?? 0
  const total = data?.alerts.length ?? 0

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const a of data?.alerts ?? []) counts[a.level] = (counts[a.level] ?? 0) + 1
    return counts
  }, [data])

  const filtered = useMemo(() => {
    const alerts = data?.alerts ?? []
    return severity ? alerts.filter((a) => a.level === severity) : alerts
  }, [data, severity])

  const groups = useMemo((): Array<{ key: string; label: string; alerts: Alert[] }> => {
    if (groupBy === "none") return [{ key: "all", label: "", alerts: filtered }]
    const byKey = new Map<string, { label: string; alerts: Alert[] }>()
    for (const alert of filtered) {
      let key: string
      let label: string
      if (groupBy === "type") {
        const type = alertType(alert.alertKey)
        key = type
        const labelKey = TYPE_LABEL_KEYS[type]
        label = labelKey ? t(labelKey) : type
      } else if (groupBy === "client") {
        key = alert.clientId ?? "unknown"
        label = alert.clientName ?? t("alerts.group.unknownClient")
      } else {
        key = alert.srcIp ?? "unknown"
        label = alert.srcIp ?? t("alerts.group.unknownIp")
      }
      const existing = byKey.get(key)
      if (existing) existing.alerts.push(alert)
      else byKey.set(key, { label, alerts: [alert] })
    }
    return [...byKey.entries()]
      .map(([key, { label, alerts }]) => ({ key, label, alerts }))
      .sort((a, b) => b.alerts.length - a.alerts.length)
  }, [filtered, groupBy, t])

  return (
    <PageShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Alerts</h1>
          <p className="text-sm text-muted-foreground">
            Threat alerts within your current tenant scope.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      {!loading && data && data.alerts.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSeverity("")}
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                severity === ""
                  ? "border-foreground/40 bg-foreground/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t("alerts.severity.all")}
            </button>
            {SEVERITIES.filter((lvl) => severityCounts[lvl]).map((lvl) => {
              const style = LEVEL_STYLES[lvl]
              const isActive = severity === lvl
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSeverity(isActive ? "" : lvl)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium transition-colors",
                    style.badge,
                    isActive ? "ring-2 ring-foreground/40" : "opacity-70 hover:opacity-100",
                  )}
                >
                  {t(LEVEL_LABEL_KEYS[lvl])}
                  <span className="font-mono opacity-70">{severityCounts[lvl]}</span>
                </button>
              )
            })}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {t("alerts.groupBy.label")}
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              className="rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground"
            >
              <option value="none">{t("alerts.groupBy.none")}</option>
              <option value="type">{t("alerts.groupBy.type")}</option>
              <option value="client">{t("alerts.groupBy.client")}</option>
              <option value="srcIp">{t("alerts.groupBy.srcIp")}</option>
            </select>
          </label>
        </div>
      )}

      <Surface className="overflow-hidden">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">Loading alerts...</div>
        ) : !data || data.alerts.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Bell className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No alerts</p>
            <p className="text-sm text-muted-foreground">Alerts that fire will appear here.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">{t("alerts.empty.filtered")}</div>
        ) : (
          <div className="divide-y divide-border">
            {groups.map((group) => {
              const isCollapsed = groupBy !== "none" && collapsedGroups.has(group.key)
              return (
              <div key={group.key}>
                {groupBy !== "none" && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="flex w-full items-center gap-2 bg-secondary/40 px-4 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/60"
                  >
                    <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isCollapsed && "-rotate-90")} />
                    <span className="text-foreground">{group.label}</span>
                    <span className="font-mono">{t("alerts.group.count", { count: group.alerts.length })}</span>
                  </button>
                )}
                {!isCollapsed && (
                <ul className="divide-y divide-border">
                  {group.alerts.map((alert) => {
                    const style = LEVEL_STYLES[alert.level] ?? { dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground" }
                    const levelLabelKey = LEVEL_LABEL_KEYS[alert.level]
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
                              {levelLabelKey ? t(levelLabelKey) : alert.level}
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
                              {alert.clientName ?? t("alerts.group.unknownClient")}
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
              </div>
              )
            })}
          </div>
        )}
      </Surface>
    </PageShell>
  )
}

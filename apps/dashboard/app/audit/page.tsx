"use client"

import { useEffect, useState, useCallback, Fragment } from "react"
import { format } from "date-fns"
import { enUS } from "date-fns/locale"
import {
  ClipboardList, ChevronLeft, ChevronRight, Filter, X,
  MapPin, Network, ShieldAlert, Globe, Monitor, Code2,
} from "lucide-react"
import { PageShell } from "@/components/page-shell"

type AuditEntry = {
  id: string
  userId: string
  userEmail: string
  userName: string
  action: string
  resource: string
  resourceId: string | null
  resourceName: string | null
  details: Record<string, unknown>
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

type AuditResponse = {
  entries: AuditEntry[]
  total: number
  page: number
  limit: number
  pages: number
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Creation",
  UPDATE: "Update",
  DELETE: "Deletion",
  DOWNLOAD: "Download",
  LOGIN: "Login",
  LOGOUT: "Logout",
}

const RESOURCE_LABELS: Record<string, string> = {
  USER: "User",
  CLIENT: "Client",
  SENSOR: "Sensor",
  TOKEN: "Token",
  MALWARE: "Malware",
  SETTINGS: "Settings",
  SESSION: "Session",
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-500/10 text-emerald-400",
  UPDATE: "bg-cyan-500/10 text-cyan-400",
  DELETE: "bg-red-500/10 text-red-400",
  DOWNLOAD: "bg-violet-500/10 text-violet-400",
  LOGIN: "bg-blue-500/10 text-blue-400",
  LOGOUT: "bg-amber-500/10 text-amber-400",
}

const RESOURCE_COLORS: Record<string, string> = {
  USER: "bg-blue-500/10 text-blue-300",
  CLIENT: "bg-purple-500/10 text-purple-300",
  SENSOR: "bg-cyan-500/10 text-cyan-300",
  TOKEN: "bg-amber-500/10 text-amber-300",
  MALWARE: "bg-red-500/10 text-red-300",
  SETTINGS: "bg-slate-500/10 text-slate-300",
  SESSION: "bg-emerald-500/10 text-emerald-300",
}

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "DOWNLOAD", "LOGIN", "LOGOUT"]
const RESOURCES = ["USER", "CLIENT", "SENSOR", "TOKEN", "MALWARE", "SETTINGS", "SESSION"]

function Badge({ value, colorMap, labelMap }: { value: string; colorMap: Record<string, string>; labelMap: Record<string, string> }) {
  const color = colorMap[value] ?? "bg-muted text-muted-foreground"
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>
      {labelMap[value] ?? value}
    </span>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 80 ? "bg-red-500/15 text-red-300 border-red-500/30"
    : score >= 25 ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
  const label = score >= 80 ? "Alto riesgo" : score >= 25 ? "Sospechosa" : "Limpia"
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {label} · {score}%
    </span>
  )
}

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
        on
          ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
          : "border-border bg-muted/30 text-muted-foreground/50"
      }`}
    >
      {label}
    </span>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">{label}</span>
      <span className="text-xs text-foreground break-words">{value}</span>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}

/** Parsea un user-agent a "Navegador · SO" de forma aproximada. */
function parseUserAgent(ua: string): string {
  let browser = "Unknown browser"
  if (/Edg\//.test(ua)) browser = "Edge"
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera"
  else if (/Chrome\//.test(ua)) browser = "Chrome"
  else if (/Firefox\//.test(ua)) browser = "Firefox"
  else if (/Safari\//.test(ua)) browser = "Safari"

  let os = "Unknown OS"
  if (/Windows NT 10/.test(ua)) os = "Windows"
  else if (/Windows/.test(ua)) os = "Windows"
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS"
  else if (/Android/.test(ua)) os = "Android"
  else if (/iPhone|iPad|iOS/.test(ua)) os = "iOS"
  else if (/Linux/.test(ua)) os = "Linux"

  return `${browser} · ${os}`
}

function AuditDetail({ entry }: { entry: AuditEntry }) {
  const [showRaw, setShowRaw] = useState(false)
  const d = (entry.details ?? {}) as Record<string, unknown>
  const isSession = entry.action === "LOGIN" || entry.action === "LOGOUT"

  const countryName = (d.countryName ?? d.country) as string | undefined
  const city = d.city as string | undefined
  const region = d.region as string | undefined
  const timezone = d.timezone as string | undefined
  const asn = d.asn as string | undefined
  const org = d.org as string | undefined
  const isp = d.isp as string | undefined
  const usageType = d.usageType as string | undefined
  const score = d.abuseConfidenceScore as number | null | undefined
  const totalReports = d.totalReports as number | null | undefined
  const isVpn = d.isVpn as boolean | null | undefined
  const isTor = d.isTor as boolean | null | undefined
  const isHosting = d.isHosting as boolean | null | undefined

  const hasGeo = isSession && (countryName || city || asn || org || score != null)

  return (
    <div className="space-y-3">
      {hasGeo ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Section icon={<MapPin className="h-3.5 w-3.5" />} title="Geolocalización">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Field label="País" value={countryName} />
              <Field label="Ciudad" value={city} />
              <Field label="Región" value={region} />
              <Field label="Zona horaria" value={timezone} />
            </div>
          </Section>

          <Section icon={<Network className="h-3.5 w-3.5" />} title="Red">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Field label="ASN" value={asn} />
              <Field label="Organización" value={org} />
              <Field label="ISP" value={isp} />
              <Field label="Tipo de uso" value={usageType} />
            </div>
          </Section>

          <Section icon={<ShieldAlert className="h-3.5 w-3.5" />} title="Reputación">
            <div className="space-y-2">
              {score != null && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">AbuseIPDB</span>
                  <ScoreBadge score={score} />
                </div>
              )}
              {totalReports != null && totalReports > 0 && (
                <Field label="Reportes" value={totalReports.toLocaleString()} />
              )}
              {(isVpn != null || isTor != null || isHosting != null) && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {isVpn != null && <Flag label="VPN" on={!!isVpn} />}
                  {isTor != null && <Flag label="Tor" on={!!isTor} />}
                  {isHosting != null && <Flag label="Hosting" on={!!isHosting} />}
                </div>
              )}
            </div>
          </Section>
        </div>
      ) : (
        // Eventos no-sesión: grilla key/value legible
        <Section icon={<Globe className="h-3.5 w-3.5" />} title="Detalle del evento">
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(d).map(([k, v]) => (
              <Field
                key={k}
                label={k}
                value={
                  typeof v === "object" && v !== null
                    ? JSON.stringify(v)
                    : v === null
                      ? "—"
                      : String(v)
                }
              />
            ))}
          </div>
        </Section>
      )}

      {entry.userAgent && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-xs font-medium text-foreground">{parseUserAgent(entry.userAgent)}</div>
            <div className="truncate text-[10px] text-muted-foreground/60">{entry.userAgent}</div>
          </div>
        </div>
      )}

      <button
        onClick={() => setShowRaw((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
      >
        <Code2 className="h-3 w-3" />
        {showRaw ? "Ocultar JSON" : "Ver JSON crudo"}
      </button>
      {showRaw && (
        <pre className="rounded-lg bg-background border border-border px-3 py-2 text-xs text-foreground overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(entry.details, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default function AuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filterAction, setFilterAction] = useState("")
  const [filterResource, setFilterResource] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchAudit = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" })
      if (filterAction) params.set("action", filterAction)
      if (filterResource) params.set("resource", filterResource)

      const res = await fetch(`/api/audit?${params}`, { signal })
      if (res.ok) {
        setData(await res.json())
      }
    } catch {
      // ignore aborts (filter changed mid-flight) and transient errors
    } finally {
      // Don't flip loading off for a request we aborted — a newer one is running.
      if (!signal?.aborted) setLoading(false)
    }
  }, [page, filterAction, filterResource])

  // Re-fetch on filter/page change, cancelling the previous request so a slow
  // earlier response can't overwrite a newer one (out-of-order results).
  useEffect(() => {
    const controller = new AbortController()
    fetchAudit(controller.signal)
    return () => controller.abort()
  }, [fetchAudit])

  function handleFilterChange() {
    setPage(1)
  }

  const hasFilters = filterAction || filterResource

  return (
    <PageShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Audit Log</h1>
          <p className="text-sm text-muted-foreground">
            Record of all actions performed on the platform.
          </p>
        </div>
        {data && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
            <ClipboardList className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-medium text-foreground">{data.total.toLocaleString()}</span>
            <span className="text-sm text-muted-foreground">event{data.total !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filter by:
        </div>
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); handleFilterChange() }}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </select>
        <select
          value={filterResource}
          onChange={(e) => { setFilterResource(e.target.value); handleFilterChange() }}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All resources</option>
          {RESOURCES.map((r) => (
            <option key={r} value={r}>{RESOURCE_LABELS[r]}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setFilterAction(""); setFilterResource(""); setPage(1) }}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">Loading records...</div>
        ) : !data || data.entries.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No records</p>
            <p className="text-sm text-muted-foreground">Actions performed on the platform will appear here.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Resource</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Detail</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.entries.map((entry) => {
                const isExpanded = expandedId === entry.id
                const hasDetails = Object.keys(entry.details ?? {}).length > 0
                return (
                  <Fragment key={entry.id}>
                    <tr
                      onClick={() => hasDetails && setExpandedId(isExpanded ? null : entry.id)}
                      className={`transition-colors ${hasDetails ? "cursor-pointer hover:bg-muted/20" : "hover:bg-muted/10"}`}
                    >
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(entry.createdAt), "dd MMM yyyy HH:mm:ss", { locale: enUS })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-foreground">{entry.userName || "—"}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{entry.userEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge value={entry.action} colorMap={ACTION_COLORS} labelMap={ACTION_LABELS} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge value={entry.resource} colorMap={RESOURCE_COLORS} labelMap={RESOURCE_LABELS} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[220px]">
                        {entry.resourceName ? (
                          <span className="truncate block">
                            {entry.resourceName}
                            {(entry.action === "LOGIN" || entry.action === "LOGOUT") && entry.details?.city
                              ? ` · ${entry.details.city}`
                              : ""}
                          </span>
                        ) : hasDetails ? (
                          <span className="text-muted-foreground/50 italic">view detail</span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        <div>{entry.ipAddress ?? "—"}</div>
                        {(() => {
                          const d = entry.details ?? {}
                          const country = (d.countryName ?? d.country) as string | undefined
                          const asn = d.asn as string | undefined
                          const org = d.org as string | undefined
                          const score = d.abuseConfidenceScore as number | null | undefined
                          if (!country && !asn && !org && score == null) return null
                          return (
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] font-sans text-muted-foreground/70">
                              {country && <span>{country}</span>}
                              {asn && <span className="text-muted-foreground/50">{asn}</span>}
                              {org && <span className="truncate max-w-[140px]">{org}</span>}
                              {typeof score === "number" && score > 0 && (
                                <span className={score >= 80 ? "text-red-400" : score >= 25 ? "text-amber-400" : "text-muted-foreground/60"}>
                                  abuso {score}%
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-muted/10">
                        <td colSpan={6} className="px-4 py-3">
                          <AuditDetail entry={entry} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">
            Page {data.page} of {data.pages} · {data.total.toLocaleString()} records
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              disabled={page === data.pages}
              className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </PageShell>
  )
}

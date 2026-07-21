"use client"

import { useState, Fragment } from "react"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"
import {
  ClipboardList, Filter, X,
  MapPin, Network, ShieldAlert, Globe, Monitor, Code2, UserCog,
} from "lucide-react"
import { Surface } from "@/components/ui/surface"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { TablePagination } from "@/components/table-pagination"
import { useNavTransitionOptional } from "@/lib/use-nav-transition"
import type { PaginationMeta } from "@/lib/api"
import type { AuditEntry } from "@/lib/audit"

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
  const label = score >= 80 ? "High risk" : score >= 25 ? "Suspicious" : "Clean"
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

/** Approximately parses a user-agent into "Browser · OS". */
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
  const { _meta, ...d } = (entry.details ?? {}) as Record<string, unknown>
  const meta = (_meta ?? null) as Record<string, unknown> | null
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
          <Section icon={<MapPin className="h-3.5 w-3.5" />} title="Geolocation">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Field label="Country" value={countryName} />
              <Field label="City" value={city} />
              <Field label="Region" value={region} />
              <Field label="Timezone" value={timezone} />
            </div>
          </Section>

          <Section icon={<Network className="h-3.5 w-3.5" />} title="Network">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Field label="ASN" value={asn} />
              <Field label="Organization" value={org} />
              <Field label="ISP" value={isp} />
              <Field label="Usage type" value={usageType} />
            </div>
          </Section>

          <Section icon={<ShieldAlert className="h-3.5 w-3.5" />} title="Reputation">
            <div className="space-y-2">
              {score != null && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">AbuseIPDB</span>
                  <ScoreBadge score={score} />
                </div>
              )}
              {totalReports != null && totalReports > 0 && (
                <Field label="Reports" value={totalReports.toLocaleString()} />
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
        // Non-session events: readable key/value grid
        <Section icon={<Globe className="h-3.5 w-3.5" />} title="Event detail">
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

      {meta && Boolean(meta.actorRole || meta.method || meta.path || meta.actorClientId) && (
        <Section icon={<UserCog className="h-3.5 w-3.5" />} title="Request / Actor">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
            <Field label="Actor role" value={meta.actorRole as string | undefined} />
            <Field label="Actor tenant" value={(meta.actorClientId as string | null) ?? undefined} />
            <Field label="Method" value={meta.method as string | undefined} />
            <Field label="Route" value={meta.path as string | undefined} />
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
        {showRaw ? "Hide JSON" : "View raw JSON"}
      </button>
      {showRaw && (
        <pre className="rounded-lg bg-background border border-border px-3 py-2 text-xs text-foreground overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(entry.details, null, 2)}
        </pre>
      )}
    </div>
  )
}

export function AuditTable({
  entries,
  pagination,
  action,
  resource,
}: {
  entries: AuditEntry[]
  pagination: PaginationMeta
  action: string
  resource: string
}) {
  const tz = useTimezone()
  const { pushParams, isPending } = useNavTransitionOptional()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const hasFilters = action || resource

  return (
    <>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filter by:
        </div>
        <select
          value={action}
          onChange={(e) => pushParams({ action: e.target.value, page: "1" })}
          disabled={isPending}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </select>
        <select
          value={resource}
          onChange={(e) => pushParams({ resource: e.target.value, page: "1" })}
          disabled={isPending}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        >
          <option value="">All resources</option>
          {RESOURCES.map((r) => (
            <option key={r} value={r}>{RESOURCE_LABELS[r]}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => pushParams({ action: "", resource: "", page: "1" })}
            disabled={isPending}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      <Surface className="overflow-hidden">
        {entries.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No records</p>
            <p className="text-sm text-muted-foreground">Actions performed on the platform will appear here.</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const isExpanded = expandedId === entry.id
                  const hasDetails = Object.keys(entry.details ?? {}).length > 0
                  return (
                    <Fragment key={entry.id}>
                      <TableRow
                        onClick={() => hasDetails && setExpandedId(isExpanded ? null : entry.id)}
                        className={hasDetails ? "cursor-pointer hover:bg-muted/20" : "hover:bg-muted/10"}
                      >
                        <TableCell className="text-xs text-muted-foreground">
                          {formatInTimezone(entry.createdAt, tz, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-medium text-foreground">{entry.userName || "—"}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{entry.userEmail}</div>
                        </TableCell>
                        <TableCell>
                          <Badge value={entry.action} colorMap={ACTION_COLORS} labelMap={ACTION_LABELS} />
                        </TableCell>
                        <TableCell>
                          <Badge value={entry.resource} colorMap={RESOURCE_COLORS} labelMap={RESOURCE_LABELS} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[220px]">
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
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
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
                                    abuse {score}%
                                  </span>
                                )}
                              </div>
                            )
                          })()}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-muted/10 hover:bg-muted/10">
                          <TableCell colSpan={6} className="whitespace-normal">
                            <AuditDetail entry={entry} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
            {pagination.totalPages > 1 && <TablePagination pagination={pagination} />}
          </>
        )}
      </Surface>
    </>
  )
}

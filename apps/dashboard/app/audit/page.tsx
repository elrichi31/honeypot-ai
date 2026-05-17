"use client"

import { useEffect, useState, useCallback } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { ClipboardList, ChevronLeft, ChevronRight, Filter, X } from "lucide-react"
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
  CREATE: "Creación",
  UPDATE: "Actualización",
  DELETE: "Eliminación",
  DOWNLOAD: "Descarga",
  LOGIN: "Inicio de sesión",
  LOGOUT: "Cierre de sesión",
}

const RESOURCE_LABELS: Record<string, string> = {
  USER: "Usuario",
  CLIENT: "Cliente",
  SENSOR: "Sensor",
  TOKEN: "Token",
  MALWARE: "Malware",
  SETTINGS: "Configuración",
  SESSION: "Sesión",
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

export default function AuditPage() {
  const [data, setData] = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filterAction, setFilterAction] = useState("")
  const [filterResource, setFilterResource] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchAudit = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" })
      if (filterAction) params.set("action", filterAction)
      if (filterResource) params.set("resource", filterResource)

      const res = await fetch(`/api/audit?${params}`)
      if (res.ok) {
        setData(await res.json())
      }
    } finally {
      setLoading(false)
    }
  }, [page, filterAction, filterResource])

  useEffect(() => { fetchAudit() }, [fetchAudit])

  function handleFilterChange() {
    setPage(1)
  }

  const hasFilters = filterAction || filterResource

  return (
    <PageShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Auditoría</h1>
          <p className="text-sm text-muted-foreground">
            Registro de todas las acciones realizadas en la plataforma.
          </p>
        </div>
        {data && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
            <ClipboardList className="h-4 w-4 text-violet-400" />
            <span className="text-sm font-medium text-foreground">{data.total.toLocaleString()}</span>
            <span className="text-sm text-muted-foreground">evento{data.total !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filtrar por:
        </div>
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); handleFilterChange() }}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Todas las acciones</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </select>
        <select
          value={filterResource}
          onChange={(e) => { setFilterResource(e.target.value); handleFilterChange() }}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Todos los recursos</option>
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
            Limpiar
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">Cargando registros...</div>
        ) : !data || data.entries.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No hay registros</p>
            <p className="text-sm text-muted-foreground">Las acciones realizadas en la plataforma aparecerán aquí.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Usuario</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Acción</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Recurso</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Detalle</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.entries.map((entry) => {
                const isExpanded = expandedId === entry.id
                const hasDetails = Object.keys(entry.details ?? {}).length > 0
                return (
                  <>
                    <tr
                      key={entry.id}
                      onClick={() => hasDetails && setExpandedId(isExpanded ? null : entry.id)}
                      className={`transition-colors ${hasDetails ? "cursor-pointer hover:bg-muted/20" : "hover:bg-muted/10"}`}
                    >
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(entry.createdAt), "dd MMM yyyy HH:mm:ss", { locale: es })}
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
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                        {entry.resourceName ?? (hasDetails ? <span className="text-muted-foreground/50 italic">ver detalle</span> : "—")}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {entry.ipAddress ?? "—"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${entry.id}-detail`} className="bg-muted/10">
                        <td colSpan={6} className="px-4 py-3">
                          <pre className="rounded-lg bg-background border border-border px-3 py-2 text-xs text-foreground overflow-x-auto whitespace-pre-wrap break-all">
                            {JSON.stringify(entry.details, null, 2)}
                          </pre>
                          {entry.userAgent && (
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              <span className="font-medium">User-Agent:</span> {entry.userAgent}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
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
            Página {data.page} de {data.pages} · {data.total.toLocaleString()} registros
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

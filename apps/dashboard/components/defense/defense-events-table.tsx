"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ShieldAlert, RefreshCw, ChevronLeft, ChevronRight, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IpEnrichmentPopover } from "@/components/ip-enrichment-popover"
import { formatTs } from "@/lib/formatting"
import { Surface } from "@/components/ui/surface"
import { useT } from "@/components/locale-provider"
import type { TranslationKey } from "@/lib/i18n/dictionaries"

type DefenseEvent = {
  id: string; srcIp: string; method: string; path: string
  userAgent: string; attackType: string; details: Record<string, string>
  statusCode: number | null; timestamp: string
}
type PaginationMeta = {
  page: number; pageSize: number; total: number; totalPages: number
  hasNextPage: boolean; hasPreviousPage: boolean
}

type AttackFilter = "all" | "scanner" | "path_probe" | "injection" | "brute_force"

const TABS: { key: AttackFilter; labelKey: TranslationKey }[] = [
  { key: "all",         labelKey: "defense.events.tab.all" },
  { key: "scanner",     labelKey: "defense.type.scanner"    },
  { key: "path_probe",  labelKey: "defense.type.pathProbe"  },
  { key: "injection",   labelKey: "defense.type.injection"  },
  { key: "brute_force", labelKey: "defense.type.bruteForce" },
]

const TYPE_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  scanner:     { dot: "bg-orange-500", text: "text-orange-400", label: "SCAN"  },
  path_probe:  { dot: "bg-yellow-500", text: "text-yellow-400", label: "PROBE" },
  injection:   { dot: "bg-red-500",    text: "text-red-400",    label: "INJECT"},
  brute_force: { dot: "bg-purple-500", text: "text-purple-400", label: "BRUTE" },
}

export function DefenseEventsTable() {
  const t = useT()
  const [filter, setFilter]         = useState<AttackFilter>("all")
  const [page, setPage]             = useState(1)
  const [items, setItems]           = useState<DefenseEvent[]>([])
  const [meta, setMeta]             = useState<PaginationMeta | null>(null)
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState("")
  const [debouncedIp, setDebouncedIp] = useState("")
  const timer                       = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleSearch(v: string) {
    setSearch(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { setDebouncedIp(v.trim()); setPage(1) }, 300)
  }

  const load = useCallback((p: number, f: AttackFilter, ip: string) => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(p), pageSize: "25" })
    if (f !== "all") params.set("attackType", f)
    if (ip)          params.set("ip", ip)
    fetch(`/api/defense/events?${params}`)
      .then(r => r.json())
      .then((d: unknown) => {
        const obj = d && typeof d === "object" ? d as Record<string, unknown> : {}
        setItems(Array.isArray(obj.items) ? obj.items : [])
        setMeta(obj.pagination && typeof obj.pagination === "object" ? obj.pagination as PaginationMeta : null)
      })
      .catch(() => { setItems([]); setMeta(null) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { setPage(1); load(1, filter, debouncedIp) }, [filter, debouncedIp, load])

  function goPage(p: number) { setPage(p); load(p, filter, debouncedIp) }

  return (
    <Surface className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-400/10">
            <ShieldAlert className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("defense.events.title")}</h2>
            <p className="text-[11px] text-muted-foreground">
              {meta ? t("defense.events.count", { n: meta.total.toLocaleString() }) : t("defense.events.loading")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setFilter(tab.key)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  filter === tab.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
          <button onClick={() => load(page, filter, debouncedIp)} disabled={loading}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* IP search */}
      <div className="px-3 py-2 border-b border-border/40 bg-[#0d0d0f]">
        <div className="flex items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5">
          <Search className="h-3 w-3 text-muted-foreground/60 shrink-0" />
          <input type="text" value={search} onChange={e => handleSearch(e.target.value)}
            placeholder={t("defense.events.filterByIp")}
            className="flex-1 bg-transparent font-mono text-xs text-foreground placeholder:text-muted-foreground/40 outline-none" />
          {search && (
            <button onClick={() => { setSearch(""); setDebouncedIp(""); setPage(1) }}
              className="text-muted-foreground/50 hover:text-muted-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto font-mono text-xs bg-[#0d0d0f] min-h-[300px]">
        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-red-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14">
            <ShieldAlert className="h-7 w-7 text-emerald-400/40" />
            <p className="text-[11px] text-muted-foreground">{t("defense.events.empty")}</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="pl-3 pr-2 py-1.5 w-5" />
                <th className="pr-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground/60 w-[65px]">{t("defense.events.col.type")}</th>
                <th className="pr-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground/60">{t("defense.events.col.sourceIp")}</th>
                <th className="pr-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground/60 w-12">{t("defense.events.col.method")}</th>
                <th className="pr-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground/60">{t("defense.events.col.path")}</th>
                <th className="pr-3 py-1.5 text-left text-[10px] font-medium text-muted-foreground/60">{t("defense.events.col.userAgent")}</th>
                <th className="pr-3 py-1.5 text-right text-[10px] font-medium text-muted-foreground/60 w-[130px]">{t("defense.events.col.when")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ev, i) => {
                const style = TYPE_STYLE[ev.attackType] ?? { dot: "bg-muted", text: "text-muted-foreground", label: "UNK" }
                return (
                  <tr key={ev.id} className={`border-b border-white/[0.04] ${i % 2 ? "bg-white/[0.01]" : ""}`}>
                    <td className="pl-3 pr-2 py-1.5 align-middle">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    </td>
                    <td className="pr-3 py-1.5 align-middle">
                      <span className={`text-[10px] font-bold ${style.text}`}>{style.label}</span>
                    </td>
                    <td className="pr-3 py-1.5 align-middle">
                      <IpEnrichmentPopover ip={ev.srcIp} className="text-yellow-300/90" />
                    </td>
                    <td className="pr-3 py-1.5 align-middle text-muted-foreground/70">{ev.method}</td>
                    <td className="pr-3 py-1.5 align-middle text-cyan-300/80 max-w-[200px] truncate">{ev.path}</td>
                    <td className="pr-3 py-1.5 align-middle text-muted-foreground/50 max-w-[160px] truncate">{ev.userAgent || "—"}</td>
                    <td className="pr-3 py-1.5 align-middle text-right text-muted-foreground/60 whitespace-nowrap">
                      {formatTs(ev.timestamp)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/60 bg-card rounded-b-xl">
          <span className="font-mono text-[11px] text-muted-foreground">
            {t("defense.events.pageInfo", { page: meta.page, total: meta.totalPages, count: meta.total.toLocaleString() })}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => goPage(page - 1)} disabled={!meta.hasPreviousPage || loading} className="h-6 w-6 p-0">
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => goPage(page + 1)} disabled={!meta.hasNextPage || loading} className="h-6 w-6 p-0">
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </Surface>
  )
}

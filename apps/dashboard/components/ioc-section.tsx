"use client"

import { useMemo, useState } from "react"
import { Copy, Check, Download, Search, Crosshair, Biohazard } from "lucide-react"
import { Surface } from "@/components/ui/surface"
import { toPlainList, toCsv, toStixBundle, type IocEntry, type IocType } from "@/lib/ioc-export"

// Icon + per-row metadata are resolved here (a Client Component) by `kind`,
// because functions/components can't be passed as props from the Server
// Component page — doing so crashes the RSC render.
const KIND_ICON = { ip: Crosshair, hash: Biohazard } as const

function metaLine(e: IocEntry): string {
  if (e.type === "ip") {
    const protos = e.meta?.protocols ? ` · ${String(e.meta.protocols).replace(/\|/g, ", ")}` : ""
    return `${e.meta?.level ?? ""} · score ${e.meta?.score ?? ""}${protos}`
  }
  return [e.meta?.source, e.meta?.fileType, e.meta?.srcIp].filter(Boolean).join(" · ")
}

const INITIAL_VISIBLE = 500

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {label && <span>{label}</span>}
    </button>
  )
}

export function IocSection({
  title,
  kind,
  entries,
  fileBase,
}: {
  title: string
  kind: IocType
  entries: IocEntry[]
  fileBase: string                         // e.g. "honeypot-ips"
}) {
  const Icon = KIND_ICON[kind]
  const [q, setQ] = useState("")
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter(
      (e) => e.value.toLowerCase().includes(needle) || metaLine(e).toLowerCase().includes(needle),
    )
  }, [entries, q])

  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE)
  const plain = useMemo(() => toPlainList(filtered), [filtered])

  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">{title}</h3>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            {entries.length.toLocaleString("en-US")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={plain} label="Copiar todo" />
          <button
            type="button"
            onClick={() => download(`${fileBase}.csv`, toCsv(filtered), "text/csv")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button
            type="button"
            onClick={() => download(`${fileBase}.stix.json`, toStixBundle(filtered), "application/json")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" /> STIX
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Sin indicadores de este tipo.</p>
      ) : (
        <>
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filtrar…"
                className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground"
              />
            </div>
          </div>

          <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
            {visible.map((e) => (
              <div key={e.value} className="flex items-center gap-2 px-4 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-foreground">{e.value}</p>
                  <p className="truncate text-xs text-muted-foreground">{metaLine(e)}</p>
                </div>
                <CopyButton value={e.value} />
              </div>
            ))}
          </div>

          {!showAll && filtered.length > INITIAL_VISIBLE && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full border-t border-border py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              Ver los {(filtered.length - INITIAL_VISIBLE).toLocaleString("en-US")} restantes
            </button>
          )}
        </>
      )}
    </Surface>
  )
}

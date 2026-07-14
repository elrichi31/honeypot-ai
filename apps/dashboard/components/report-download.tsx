"use client"

import { useEffect, useRef, useState } from "react"
import { useLocale } from "@/components/locale-provider"
import { resolvePresetWindow, type ReportPreset } from "@/lib/reports/shared/format"
import { ReportView } from "@/components/reports/report-view"
import type { ClientReportData } from "@/lib/reports/types"
import type { Client } from "@/lib/api"

interface Props {
  isSuperadmin: boolean
  clients: Client[]
  /** Pre-selected clientId for scoped users (non-superadmin). */
  scopedClientId: string | null
}

const PRESETS = [
  { key: "last7", label: "reports.range.last7" },
  { key: "last30", label: "reports.range.last30" },
  { key: "thisMonth", label: "reports.range.thisMonth" },
  { key: "lastMonth", label: "reports.range.lastMonth" },
  { key: "custom", label: "reports.range.custom" },
] as const satisfies readonly { key: ReportPreset; label: string }[]

export function ReportDownload({ isSuperadmin, clients, scopedClientId }: Props) {
  const { t, locale } = useLocale()
  const [preset, setPreset] = useState<ReportPreset>("last7")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "")
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ClientReportData | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const effectiveClientId = isSuperadmin ? clientId : (scopedClientId ?? "")
  const loading = progress !== null

  useEffect(() => () => esRef.current?.close(), [])

  function handleGenerate() {
    const window = resolvePresetWindow(preset, { start: customStart, end: customEnd })
    if (!window) {
      setError(t("reports.range.invalid"))
      return
    }

    esRef.current?.close()
    setError(null)
    setData(null)
    setProgress(0)

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const params = new URLSearchParams({
      startDate: window.startDate,
      endDate: window.endDate,
      timezone: tz,
      locale,
    })
    if (isSuperadmin && effectiveClientId) params.set("clientId", effectiveClientId)

    const es = new EventSource(`/api/reports/stream?${params}`)
    esRef.current = es
    let settled = false

    es.addEventListener("progress", (e) => {
      const { completed, total } = JSON.parse(e.data) as { completed: number; total: number }
      setProgress(total > 0 ? completed / total : 0)
    })
    es.addEventListener("result", (e) => {
      settled = true
      setData(JSON.parse(e.data) as ClientReportData)
      setProgress(null)
      es.close()
    })
    es.addEventListener("failed", (e) => {
      settled = true
      setError((JSON.parse((e as MessageEvent).data).error as string) ?? t("reports.download.error"))
      setProgress(null)
      es.close()
    })
    es.onerror = () => {
      if (settled) return
      settled = true
      setError(t("reports.download.error"))
      setProgress(null)
      es.close()
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Period selector */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">{t("reports.range.label")}</label>
        <div className="flex flex-wrap gap-3">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                preset === p.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              {t(p.label)}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="mt-1 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{t("reports.range.from")}</label>
              <input
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">{t("reports.range.to")}</label>
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        )}
      </div>

      {/* Client selector (superadmin only) */}
      {isSuperadmin && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">{t("reports.client.label")}</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-72 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="" disabled>
              {t("reports.client.placeholder")}
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-4 print:hidden">
        <button
          onClick={handleGenerate}
          disabled={loading || (isSuperadmin && !effectiveClientId)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("reports.preview")}
        </button>
        {data && (
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
          >
            {t("reports.download")}
          </button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* Progress */}
      {loading && (
        <div className="flex flex-col gap-2 print:hidden">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("reports.progress")}</span>
            <span className="tabular-nums">{Math.round((progress ?? 0) * 100)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${Math.max(4, (progress ?? 0) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Report */}
      {data ? (
        <ReportView data={data} />
      ) : (
        !loading && (
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground print:hidden">
            {t("reports.preview.empty")}
          </div>
        )
      )}
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { useLocale } from "@/components/locale-provider"
import { resolvePresetWindow, type ReportPreset } from "@/lib/reports/shared/format"
import { LocaleProvider } from "@/components/locale-provider"
import { ReportView } from "@/components/reports/report-view"
import type { ClientReportData, ReportNarrative, ReportTheme } from "@/lib/reports/types"
import type { Locale } from "@/lib/i18n/dictionaries"
import type { Client } from "@/lib/api"

interface Props {
  /** Global staff may pick any tenant for the report; `cliente` is locked to its own. */
  canPickTenant: boolean
  clients: Client[]
  /** Pre-selected clientId for a scoped `cliente`. */
  scopedClientId: string | null
}

const PRESETS = [
  { key: "last7", label: "reports.range.last7" },
  { key: "last30", label: "reports.range.last30" },
  { key: "thisMonth", label: "reports.range.thisMonth" },
  { key: "lastMonth", label: "reports.range.lastMonth" },
  { key: "custom", label: "reports.range.custom" },
] as const satisfies readonly { key: ReportPreset; label: string }[]

export function ReportDownload({ canPickTenant, clients, scopedClientId }: Props) {
  const { t, locale } = useLocale()
  const [preset, setPreset] = useState<ReportPreset>("last7")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "")
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ClientReportData | null>(null)
  const [narrative, setNarrative] = useState<ReportNarrative | null>(null)
  const [narrativePending, setNarrativePending] = useState(false)
  // Report language and palette are the deliverable's, not the operator's: an
  // English-speaking analyst routinely sends a Spanish client a Spanish report.
  const [reportLocale, setReportLocale] = useState<Locale>(locale)
  const [theme, setTheme] = useState<ReportTheme>("light")
  const esRef = useRef<EventSource | null>(null)

  // Mirrored onto <html> so the print stylesheet can paint the whole sheet;
  // the report's own vars are scoped to its root and can't reach <body>.
  useEffect(() => {
    document.documentElement.dataset.reportTheme = theme
  }, [theme])

  const effectiveClientId = canPickTenant ? clientId : (scopedClientId ?? "")
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
    setNarrative(null)
    setNarrativePending(false)
    setProgress(0)

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const params = new URLSearchParams({
      startDate: window.startDate,
      endDate: window.endDate,
      timezone: tz,
      locale: reportLocale,
    })
    if (canPickTenant && effectiveClientId) params.set("clientId", effectiveClientId)

    const es = new EventSource(`/api/reports/stream?${params}`)
    esRef.current = es
    let settled = false

    es.addEventListener("progress", (e) => {
      const { completed, total } = JSON.parse(e.data) as { completed: number; total: number }
      setProgress(total > 0 ? completed / total : 0)
    })
    // The stream stays open past `result` to deliver the AI narrative, so the
    // report renders while the prose is still being written.
    es.addEventListener("result", (e) => {
      settled = true
      setData(JSON.parse(e.data) as ClientReportData)
      setProgress(null)
      setNarrativePending(true)
    })
    es.addEventListener("narrative", (e) => {
      setNarrative(JSON.parse((e as MessageEvent).data) as ReportNarrative)
      setNarrativePending(false)
      es.close()
    })
    es.addEventListener("failed", (e) => {
      settled = true
      setError((JSON.parse((e as MessageEvent).data).error as string) ?? t("reports.download.error"))
      setProgress(null)
      es.close()
    })
    es.onerror = () => {
      // Also fires when the server closes the stream normally — after a result
      // that never got a narrative (AI unconfigured or failed). Not an error.
      setNarrativePending(false)
      if (settled) {
        es.close()
        return
      }
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

      {/* Deliverable options: what the client receives, not what the operator sees */}
      <div className="flex flex-wrap gap-8">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">{t("reports.language.label")}</label>
          <div className="flex gap-2">
            {(["en", "es"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setReportLocale(l)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  reportLocale === l
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                {t(`reports.language.${l}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">{t("reports.theme.label")}</label>
          <div className="flex gap-2">
            {(["light", "dark"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setTheme(mode)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  theme === mode
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                {t(`reports.theme.${mode}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Client selector (superadmin only) */}
      {canPickTenant && (
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
          disabled={loading || (canPickTenant && !effectiveClientId)}
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
        <LocaleProvider initialLocale={reportLocale} pinned>
          <ReportView
            data={data}
            narrative={narrative}
            narrativePending={narrativePending}
            theme={theme}
          />
        </LocaleProvider>
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

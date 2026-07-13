"use client"

import { useEffect, useState } from "react"
import { useLocale } from "@/components/locale-provider"
import { resolvePresetWindow, type ReportPreset } from "@/lib/reports/shared/format"
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ url: string; filename: string } | null>(null)

  const effectiveClientId = isSuperadmin ? clientId : (scopedClientId ?? "")

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url)
    }
  }, [preview])

  async function handleGenerate() {
    const window = resolvePresetWindow(preset, { start: customStart, end: customEnd })
    if (!window) {
      setError(t("reports.range.invalid"))
      return
    }

    setLoading(true)
    setError(null)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const params = new URLSearchParams({
        startDate: window.startDate,
        endDate: window.endDate,
        timezone: tz,
        locale,
      })
      if (isSuperadmin && effectiveClientId) params.set("clientId", effectiveClientId)

      const res = await fetch(`/api/reports?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const cd = res.headers.get("Content-Disposition") ?? ""
      const filename =
        cd.match(/filename="([^"]+)"/)?.[1] ??
        `report-${new Date().toISOString().slice(0, 10)}.pdf`

      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return { url, filename }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reports.download.error"))
    } finally {
      setLoading(false)
    }
  }

  function handleDownload() {
    if (!preview) return
    const a = document.createElement("a")
    a.href = preview.url
    a.download = preview.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
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
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={handleGenerate}
          disabled={loading || (isSuperadmin && !effectiveClientId)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              {t("reports.generating")}
            </>
          ) : (
            t("reports.preview")
          )}
        </button>
        {preview && (
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
          >
            {t("reports.download")}
          </button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* Preview */}
      {preview ? (
        <iframe
          title={preview.filename}
          src={preview.url}
          className="h-[80vh] w-full rounded-lg border border-border bg-white"
        />
      ) : (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          {t("reports.preview.empty")}
        </div>
      )}
    </div>
  )
}

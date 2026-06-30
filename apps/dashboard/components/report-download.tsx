"use client"

import { useState } from "react"
import { useLocale } from "@/components/locale-provider"
import type { Client } from "@/lib/api"

interface Props {
  isSuperadmin: boolean
  clients: Client[]
  /** Pre-selected clientId for scoped users (non-superadmin). */
  scopedClientId: string | null
}

export function ReportDownload({ isSuperadmin, clients, scopedClientId }: Props) {
  const { t, locale } = useLocale()
  const [range, setRange] = useState<"week" | "month">("week")
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveClientId = isSuperadmin ? clientId : (scopedClientId ?? "")

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const params = new URLSearchParams({ range, timezone: tz, locale })
      if (isSuperadmin && effectiveClientId) params.set("clientId", effectiveClientId)

      const res = await fetch(`/api/reports?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const cd = res.headers.get("Content-Disposition") ?? ""
      const match = cd.match(/filename="([^"]+)"/)
      a.href = url
      a.download = match?.[1] ?? `report-${range}-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reports.download.error"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Range selector */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">{t("reports.range.label")}</label>
        <div className="flex gap-3">
          {(["week", "month"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                range === r
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              {r === "week" ? t("reports.range.week") : t("reports.range.month")}
            </button>
          ))}
        </div>
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

      {/* Generate button */}
      <div className="flex items-center gap-4">
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
            t("reports.generate")
          )}
        </button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  )
}

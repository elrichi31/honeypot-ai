"use client"

import { useEffect, useState } from "react"
import { Activity, KeyRound, ShieldCheck } from "lucide-react"
import { StatCard } from "@/components/ui/stat-card"
import { EmptyState, ErrorState } from "@/components/ui/data-states"
import { useT } from "@/components/locale-provider"
import { compactNumber, LoadingSpinner } from "./shared"

type ReportSummary = {
  trends: { count: number }[]
  credentials: {
    top: { username: string | null; password: string | null; count: number }[]
    successRate: { successCount: number; failedCount: number; total: number }[]
  }
}
type Status = "loading" | "unavailable" | "error" | "ok"

export function OverviewSummary() {
  const t = useT()
  const [status, setStatus] = useState<Status>("loading")
  const [summary, setSummary] = useState<ReportSummary | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setStatus("loading")
    fetch("/api/analytics/report-summary?range=30d&credentialLimit=1", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 503) { setStatus("unavailable"); return }
        if (!response.ok) { setStatus("error"); return }
        setSummary(await response.json())
        setStatus("ok")
      })
      .catch((error) => { if (error?.name !== "AbortError") setStatus("error") })
    return () => controller.abort()
  }, [])

  if (status === "loading") return <LoadingSpinner />
  if (status === "unavailable") return <EmptyState icon="activity" title={t("analytics.unavailable.title")} description={t("analytics.unavailable.description")} />
  if (status === "error" || !summary) return <ErrorState />

  // ClickHouse serializes counts as strings (UInt64 precision) — `+` without
  // Number() here silently string-concatenates instead of summing, which is
  // exactly what produced the astronomical "170,142,..." total events bug.
  const totalEvents = summary.trends.reduce((sum, row) => sum + Number(row.count), 0)
  const totalAttempts = summary.credentials.successRate.reduce((sum, row) => sum + Number(row.total), 0)
  const totalSuccesses = summary.credentials.successRate.reduce((sum, row) => sum + Number(row.successCount), 0)
  const successRatePct = totalAttempts ? (totalSuccesses / totalAttempts) * 100 : 0
  const topCombo = summary.credentials.top[0]

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard
        label={t("analytics.overview.metric.events")}
        value={compactNumber(totalEvents)}
        sub={t("analytics.overview.metric.last30d")}
        icon={<Activity className="h-4 w-4 text-sky-400" />}
        mono
      />
      <StatCard
        label={t("analytics.overview.metric.successRate")}
        value={`${successRatePct.toFixed(1)}%`}
        sub={t("analytics.credentials.metric.ssh")}
        icon={<ShieldCheck className="h-4 w-4 text-rose-400" />}
        mono
      />
      <StatCard
        label={t("analytics.overview.metric.topCombo")}
        value={topCombo ? `${topCombo.username ?? "—"} / ${topCombo.password ?? "—"}` : "—"}
        sub={topCombo ? t("analytics.overview.metric.topComboSub", { count: Number(topCombo.count).toLocaleString() }) : t("analytics.credentials.topCombos.empty")}
        icon={<KeyRound className="h-4 w-4 text-amber-400" />}
      />
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { Fingerprint, KeyRound, Network, ShieldCheck } from "lucide-react"
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts"
import { Surface } from "@/components/ui/surface"
import { EmptyState, ErrorState } from "@/components/ui/data-states"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useT } from "@/components/locale-provider"
import {
  AnalyticsMetric, ChartHeader, ChartTooltip, compactNumber, fmtBucketLabel,
  LoadingSpinner, type Range, RangeSelector,
} from "./shared"

type CredentialCombo = {
  username: string | null
  password: string | null
  count: number
  uniqueIps: number
  firstSeen: string
  lastSeen: string
}
type CredentialCampaign = {
  bucket: string
  srcIp: string
  attempts: number
  successCount: number
  failedCount: number
  unknownCount: number
  protocols: string[]
}
type CredentialSuccessBucket = {
  bucket: string
  successCount: number
  failedCount: number
  total: number
  successRate: number
}
type Status = "loading" | "unavailable" | "error" | "ok"

function useAnalyticsFetch<T>(url: string, extract: (body: unknown) => T[]) {
  const [status, setStatus] = useState<Status>("loading")
  const [rows, setRows] = useState<T[]>([])

  useEffect(() => {
    const controller = new AbortController()
    setStatus("loading")
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 503) { setStatus("unavailable"); return }
        if (!response.ok) { setStatus("error"); return }
        setRows(extract(await response.json()))
        setStatus("ok")
      })
      .catch((error) => { if (error?.name !== "AbortError") setStatus("error") })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  return { status, rows }
}

function StatusPanel({ status, t }: { status: Exclude<Status, "ok">; t: ReturnType<typeof useT> }) {
  if (status === "loading") return <LoadingSpinner />
  if (status === "unavailable") return <EmptyState icon="activity" title={t("analytics.unavailable.title")} description={t("analytics.unavailable.description")} />
  return <ErrorState />
}

export default function CredentialsExplorer() {
  const t = useT()
  const [range, setRange] = useState<Range>("30d")
  const combos = useAnalyticsFetch<CredentialCombo>(
    `/api/analytics/credentials/top-combos?range=${range}&limit=20`,
    (body) => (body as { data: CredentialCombo[] }).data,
  )
  const campaigns = useAnalyticsFetch<CredentialCampaign>(
    `/api/analytics/credentials/campaigns?range=${range}&limit=100`,
    (body) => (body as { data: CredentialCampaign[] }).data,
  )
  const successRate = useAnalyticsFetch<CredentialSuccessBucket>(
    `/api/analytics/credentials/success-rate?range=${range}`,
    (body) => (body as { data: CredentialSuccessBucket[] }).data,
  )

  const successPoints = useMemo(() => successRate.rows.map((row) => ({
    ...row,
    label: fmtBucketLabel(row.bucket, range),
    successRatePct: Math.round(row.successRate * 1000) / 10,
  })), [successRate.rows, range])

  const comboPoints = useMemo(() => combos.rows.slice(0, 8).map((row) => ({
    ...row,
    label: `${row.username ?? "—"} / ${row.password ?? "—"}`,
  })).reverse(), [combos.rows])

  const metrics = useMemo(() => {
    const total = successRate.rows.reduce((sum, row) => sum + row.total, 0)
    const successes = successRate.rows.reduce((sum, row) => sum + row.successCount, 0)
    const uniqueAttackers = new Set(campaigns.rows.map((row) => row.srcIp)).size
    return {
      total,
      successRate: total ? (successes / total) * 100 : 0,
      campaigns: campaigns.rows.length,
      uniqueAttackers,
    }
  }, [campaigns.rows, successRate.rows])

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <RangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsMetric label={t("analytics.credentials.metric.attempts")} value={compactNumber(metrics.total)} detail={t("analytics.metric.selectedRange")} icon={<KeyRound className="h-4 w-4" />} tone="sky" />
        <AnalyticsMetric label={t("analytics.credentials.metric.successRate")} value={`${metrics.successRate.toFixed(1)}%`} detail={t("analytics.credentials.metric.ssh")} icon={<ShieldCheck className="h-4 w-4" />} tone="rose" />
        <AnalyticsMetric label={t("analytics.credentials.metric.campaigns")} value={compactNumber(metrics.campaigns)} detail={t("analytics.credentials.metric.bursts")} icon={<Network className="h-4 w-4" />} tone="amber" />
        <AnalyticsMetric label={t("analytics.credentials.metric.attackers")} value={compactNumber(metrics.uniqueAttackers)} detail={t("analytics.credentials.metric.campaignSources")} icon={<Fingerprint className="h-4 w-4" />} tone="violet" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
        <Surface padded className="min-w-0 space-y-4">
          <ChartHeader
            eyebrow={t("analytics.signal.eyebrow")}
            title={t("analytics.credentials.successRate.title")}
            description={t("analytics.credentials.successRate.description")}
          />
          {successRate.status !== "ok" ? (
            <StatusPanel status={successRate.status} t={t} />
          ) : successPoints.length === 0 ? (
            <EmptyState title={t("analytics.credentials.topCombos.empty")} />
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={successPoints} margin={{ top: 12, right: 0, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="credential-failed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f87171" stopOpacity={0.85} />
                    <stop offset="100%" stopColor="#f87171" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.055)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis yAxisId="count" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={46} tickFormatter={compactNumber} />
                <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={42} tickFormatter={(value) => `${value}%`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar yAxisId="count" dataKey="failedCount" name={t("analytics.credentials.campaigns.col.failed")} stackId="attempts" fill="url(#credential-failed)" radius={[2, 2, 0, 0]} />
                <Bar yAxisId="count" dataKey="successCount" name={t("analytics.credentials.campaigns.col.success")} stackId="attempts" fill="#34d399" fillOpacity={0.8} radius={[2, 2, 0, 0]} />
                <Line yAxisId="rate" type="monotone" dataKey="successRatePct" name={t("analytics.credentials.metric.successRate")} stroke="#fbbf24" strokeWidth={2.2} dot={false} activeDot={{ r: 4 }} unit="%" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Surface>

        <Surface padded className="min-w-0 space-y-4">
          <ChartHeader title={t("analytics.credentials.topCombos.title")} description={t("analytics.credentials.topCombos.chartDescription")} />
          {combos.status !== "ok" ? (
            <StatusPanel status={combos.status} t={t} />
          ) : comboPoints.length === 0 ? (
            <EmptyState title={t("analytics.credentials.topCombos.empty")} />
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={comboPoints} layout="vertical" margin={{ top: 4, right: 12, left: 12, bottom: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 5" stroke="rgba(255,255,255,0.055)" />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={112} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(value) => String(value).slice(0, 18)} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name={t("analytics.credentials.topCombos.col.count")} fill="#38bdf8" fillOpacity={0.8} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Surface>
      </div>

      <Surface className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <ChartHeader title={t("analytics.credentials.campaigns.title")} description={t("analytics.credentials.campaigns.description", { min: "10", window: "5" })} />
        </div>
        {campaigns.status !== "ok" ? (
          <StatusPanel status={campaigns.status} t={t} />
        ) : campaigns.rows.length === 0 ? (
          <EmptyState title={t("analytics.credentials.campaigns.empty")} />
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>{t("analytics.credentials.campaigns.col.time")}</TableHead>
                  <TableHead>{t("analytics.credentials.campaigns.col.ip")}</TableHead>
                  <TableHead className="text-right">{t("analytics.credentials.campaigns.col.attempts")}</TableHead>
                  <TableHead className="text-right">{t("analytics.credentials.campaigns.col.success")}</TableHead>
                  <TableHead className="text-right">{t("analytics.credentials.campaigns.col.failed")}</TableHead>
                  <TableHead>{t("analytics.credentials.campaigns.col.protocols")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.rows.map((row, index) => (
                  <TableRow key={`${row.bucket}-${row.srcIp}-${index}`}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(row.bucket.replace(" ", "T")).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">{row.srcIp}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{row.attempts.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-emerald-300">{row.successCount.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-rose-300">{row.failedCount.toLocaleString()}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1">{row.protocols.map((protocol) => <Badge key={protocol} variant="muted">{protocol}</Badge>)}</div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Surface>
    </div>
  )
}

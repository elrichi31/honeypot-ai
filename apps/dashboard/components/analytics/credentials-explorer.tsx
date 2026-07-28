"use client"

import { useEffect, useState } from "react"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts"
import { Surface } from "@/components/ui/surface"
import { EmptyState, ErrorState } from "@/components/ui/data-states"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useT } from "@/components/locale-provider"
import { type Range, RangeSelector, ChartTooltip, fmtBucketLabel, LoadingSpinner } from "./shared"

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
      .then(async (res) => {
        if (res.status === 503) { setStatus("unavailable"); return }
        if (!res.ok) { setStatus("error"); return }
        setRows(extract(await res.json()))
        setStatus("ok")
      })
      .catch((err) => { if (err?.name !== "AbortError") setStatus("error") })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  return { status, rows }
}

// Only called for status !== "ok" — the empty/loaded cases are handled by
// each section itself.
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
    (b) => (b as { data: CredentialCombo[] }).data,
  )
  const campaigns = useAnalyticsFetch<CredentialCampaign>(
    `/api/analytics/credentials/campaigns?range=${range}&limit=100`,
    (b) => (b as { data: CredentialCampaign[] }).data,
  )
  const successRate = useAnalyticsFetch<CredentialSuccessBucket>(
    `/api/analytics/credentials/success-rate?range=${range}`,
    (b) => (b as { data: CredentialSuccessBucket[] }).data,
  )

  const successPoints = successRate.rows.map((r) => ({
    ...r,
    label: fmtBucketLabel(r.bucket, range),
    successRatePct: Math.round(r.successRate * 1000) / 10,
  }))

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {/* Top combos */}
      <Surface className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-medium text-foreground">{t("analytics.credentials.topCombos.title")}</p>
        </div>
        {combos.status !== "ok" ? (
          <StatusPanel status={combos.status} t={t} />
        ) : combos.rows.length === 0 ? (
          <EmptyState title={t("analytics.credentials.topCombos.empty")} />
        ) : (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>{t("analytics.credentials.topCombos.col.username")}</TableHead>
                  <TableHead>{t("analytics.credentials.topCombos.col.password")}</TableHead>
                  <TableHead className="text-right">{t("analytics.credentials.topCombos.col.count")}</TableHead>
                  <TableHead className="text-right">{t("analytics.credentials.topCombos.col.uniqueIps")}</TableHead>
                  <TableHead>{t("analytics.credentials.topCombos.col.lastSeen")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {combos.rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{row.username ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{row.password ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.uniqueIps.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(row.lastSeen.replace(" ", "T")).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Surface>

      {/* Success rate */}
      <Surface padded className="space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">{t("analytics.credentials.successRate.title")}</p>
          <p className="text-xs text-muted-foreground">{t("analytics.credentials.successRate.description")}</p>
        </div>
        {successRate.status !== "ok" ? (
          <StatusPanel status={successRate.status} t={t} />
        ) : successPoints.length === 0 ? (
          <EmptyState title={t("analytics.credentials.topCombos.empty")} />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={successPoints} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="successRatePct" name="Success %" stroke="#f87171" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Surface>

      {/* Campaigns */}
      <Surface className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-medium text-foreground">{t("analytics.credentials.campaigns.title")}</p>
          <p className="text-xs text-muted-foreground">{t("analytics.credentials.campaigns.description", { min: "10", window: "5" })}</p>
        </div>
        {campaigns.status !== "ok" ? (
          <StatusPanel status={campaigns.status} t={t} />
        ) : campaigns.rows.length === 0 ? (
          <EmptyState title={t("analytics.credentials.campaigns.empty")} />
        ) : (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
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
                {campaigns.rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(row.bucket.replace(" ", "T")).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">{row.srcIp}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.attempts.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">{row.successCount.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">{row.failedCount.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.protocols.map((p) => <Badge key={p} variant="muted">{p}</Badge>)}
                      </div>
                    </TableCell>
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

"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Surface } from "@/components/ui/surface"
import { EmptyState, ErrorState } from "@/components/ui/data-states"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useT } from "@/components/locale-provider"
import { useTimezone } from "@/components/timezone-provider"
import { formatInTimezone } from "@/lib/timezone"
import { chTimestampToIso, ChartHeader, FULL_TIMESTAMP_OPTS, LoadingSpinner, type Range, RangeSelector } from "./shared"

type TopAttacker = {
  srcIp: string
  count: number
  firstSeen: string
  lastSeen: string
  sources: string[]
}
type Status = "loading" | "unavailable" | "error" | "ok"

export function TopAttackersTable() {
  const t = useT()
  const tz = useTimezone()
  const router = useRouter()
  const [range, setRange] = useState<Range>("30d")
  const [status, setStatus] = useState<Status>("loading")
  const [rows, setRows] = useState<TopAttacker[]>([])

  const load = useCallback((selectedRange: Range, signal: AbortSignal) => {
    setStatus("loading")
    fetch(`/api/analytics/top-attackers?range=${selectedRange}&limit=20`, { signal })
      .then(async (response) => {
        if (response.status === 503) { setStatus("unavailable"); return }
        if (!response.ok) { setStatus("error"); return }
        const body = (await response.json()) as { data: TopAttacker[] }
        setRows(body.data)
        setStatus("ok")
      })
      .catch((error) => { if (error?.name !== "AbortError") setStatus("error") })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(range, controller.signal)
    return () => controller.abort()
  }, [range, load])

  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <ChartHeader title={t("analytics.topAttackers.title")} description={t("analytics.topAttackers.description")} />
        <RangeSelector value={range} onChange={setRange} />
      </div>
      {status === "loading" ? (
        <LoadingSpinner />
      ) : status === "unavailable" ? (
        <EmptyState icon="activity" title={t("analytics.unavailable.title")} description={t("analytics.unavailable.description")} />
      ) : status === "error" ? (
        <ErrorState />
      ) : rows.length === 0 ? (
        <EmptyState title={t("analytics.topAttackers.empty")} />
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("analytics.topAttackers.col.ip")}</TableHead>
                <TableHead className="text-right">{t("analytics.topAttackers.col.count")}</TableHead>
                <TableHead>{t("analytics.topAttackers.col.sources")}</TableHead>
                <TableHead>{t("analytics.topAttackers.col.firstSeen")}</TableHead>
                <TableHead>{t("analytics.topAttackers.col.lastSeen")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.srcIp}
                  onClick={() => router.push(`/threats/${encodeURIComponent(row.srcIp)}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-mono text-xs">{row.srcIp}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{Number(row.count).toLocaleString()}</TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{row.sources.map((source) => <Badge key={source} variant="muted">{source}</Badge>)}</div></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatInTimezone(chTimestampToIso(row.firstSeen), tz, FULL_TIMESTAMP_OPTS)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatInTimezone(chTimestampToIso(row.lastSeen), tz, FULL_TIMESTAMP_OPTS)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Surface>
  )
}

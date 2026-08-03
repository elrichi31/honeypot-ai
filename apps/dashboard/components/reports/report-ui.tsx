"use client"

import { useLocale } from "@/components/locale-provider"
import { fmt, deltaStr } from "@/lib/reports/shared/format"
import type { MetricTrend } from "@/lib/api/types"

export function EmptyRow() {
  const { t } = useLocale()
  return <p className="text-sm text-muted-foreground">{t("reports.noActivity")}</p>
}

export function Section({
  title,
  insight,
  subtitle,
  children,
}: {
  title: string
  /** AI observation about this section's own numbers; omitted when the model
   *  had nothing worth saying, so no empty note box is ever rendered. */
  insight?: string
  subtitle?: string
  children: React.ReactNode
}) {
  const { t } = useLocale()
  return (
    <section className="report-section rounded-xl border border-border bg-card p-5">
      <h2 className={`text-base font-semibold text-primary ${subtitle ? "" : "mb-4"}`}>{title}</h2>
      {subtitle && <p className="mb-4 mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      {children}
      {insight && (
        <div className="mt-4 border-l-2 border-primary pl-3">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">
            {t("reports.insight.label")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{insight}</p>
        </div>
      )}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  )
}

export function Kpi({ label, value, trend, meta }: { label: string; value: string; trend?: MetricTrend; meta?: string }) {
  const delta = trend ? deltaStr(trend.deltaPct) : null
  const up = (trend?.deltaPct ?? 0) >= 0
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
      {delta && (
        <p className={`text-xs font-medium ${up ? "text-emerald-500" : "text-rose-500"}`}>{delta}</p>
      )}
      {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
    </div>
  )
}

export function Bars({ items }: { items: { label: string; value: number; meta?: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  if (!items.length) return <EmptyRow />
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} className="flex items-center gap-3">
          <div className="w-32 shrink-0 truncate text-xs text-muted-foreground" title={item.label}>
            {item.label}
          </div>
          {/* Full-strength track: the palette's muted is already a faint
              burgundy wash, and dropping it to 40% over white erases it. */}
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted">
            <div
              className="h-full rounded bg-primary"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <div className="w-24 shrink-0 text-right text-xs tabular-nums text-foreground">
            {fmt(item.value)}
            {item.meta ? <span className="ml-1 text-muted-foreground">{item.meta}</span> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return <EmptyRow />
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {headers.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4 tabular-nums text-foreground">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

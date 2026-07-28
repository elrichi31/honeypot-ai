"use client"

import type { ReactNode } from "react"
import { AreaChart, BarChart3, LineChart } from "lucide-react"
import { cn } from "@/lib/utils"
import { Surface } from "@/components/ui/surface"
import { useT } from "@/components/locale-provider"

export type Range = "7d" | "30d" | "90d" | "1y"
export type ChartMode = "area" | "bar" | "line"

export const RANGE_OPTIONS: { label: string; value: Range }[] = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "1y", value: "1y" },
]

export const CHART_COLORS = ["#38bdf8", "#34d399", "#f59e0b", "#f87171", "#a78bfa", "#fb923c", "#22d3ee"]

export function fmtBucketLabel(bucket: string, range: Range): string {
  const date = new Date(bucket.replace(" ", "T"))
  if (range === "7d") return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  return date.toLocaleDateString([], { month: "short", day: "numeric" })
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

export function RangeSelector({ value, onChange }: { value: Range; onChange: (range: Range) => void }) {
  const t = useT()
  return (
    <div className="inline-flex rounded-lg border border-border bg-background/50 p-0.5" aria-label={t("analytics.range.label")}>
      {RANGE_OPTIONS.map(({ label, value: option }) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={cn(
            "rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors",
            value === option
              ? "bg-sky-500/15 text-sky-300 shadow-sm"
              : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

const MODE_ICONS = { area: AreaChart, bar: BarChart3, line: LineChart }

export function ChartModeSelector({
  value,
  onChange,
  labels,
}: {
  value: ChartMode
  onChange: (mode: ChartMode) => void
  labels: Record<ChartMode, string>
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-background/50 p-0.5">
      {(Object.keys(MODE_ICONS) as ChartMode[]).map((mode) => {
        const Icon = MODE_ICONS[mode]
        return (
          <button
            key={mode}
            type="button"
            title={labels[mode]}
            aria-label={labels[mode]}
            aria-pressed={value === mode}
            onClick={() => onChange(mode)}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              value === mode ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        )
      })}
    </div>
  )
}

export function AnalyticsMetric({
  label,
  value,
  detail,
  icon,
  tone = "sky",
  delta,
}: {
  label: string
  value: string
  detail: string
  icon: ReactNode
  tone?: "sky" | "emerald" | "amber" | "violet" | "rose"
  delta?: number | null
}) {
  const tones = {
    sky: "from-sky-500/20 text-sky-300 ring-sky-400/20",
    emerald: "from-emerald-500/20 text-emerald-300 ring-emerald-400/20",
    amber: "from-amber-500/20 text-amber-300 ring-amber-400/20",
    violet: "from-violet-500/20 text-violet-300 ring-violet-400/20",
    rose: "from-rose-500/20 text-rose-300 ring-rose-400/20",
  }

  return (
    <Surface className="relative overflow-hidden p-4">
      <div className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent", tones[tone])} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="mt-2 truncate font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        <span className={cn("rounded-lg bg-gradient-to-br to-transparent p-2 ring-1", tones[tone])}>{icon}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{detail}</span>
        {delta != null && (
          <span className={cn("shrink-0 font-mono font-semibold", delta > 0 ? "text-rose-300" : delta < 0 ? "text-emerald-300" : "text-muted-foreground")}>
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
          </span>
        )}
      </div>
    </Surface>
  )
}

export function ChartHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow && <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-400">{eyebrow}</p>}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const items = (payload as Array<{ color: string; name: string; value: number | null; unit?: string }>)
    .filter((item) => item.value != null)
  if (!items.length) return null
  return (
    <div className="max-w-[240px] rounded-xl border border-white/10 bg-card/95 px-3 py-2.5 text-[11px] shadow-2xl backdrop-blur">
      {label && <p className="mb-2 border-b border-border pb-1.5 font-medium text-foreground">{label}</p>}
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-6">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate">{item.name}</span>
            </span>
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {Number(item.value).toLocaleString()}{item.unit ?? ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function LoadingSpinner() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-sky-400" />
    </div>
  )
}

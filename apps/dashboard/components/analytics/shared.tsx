"use client"

import type { ReactNode } from "react"
import { AreaChart, BarChart3, LineChart } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/components/locale-provider"
import { formatInTimezone } from "@/lib/timezone"

export type Range = "7d" | "30d" | "90d" | "1y"
export type ChartMode = "area" | "bar" | "line"

export const RANGE_OPTIONS: { label: string; value: Range }[] = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "1y", value: "1y" },
]

export const CHART_COLORS = ["#38bdf8", "#34d399", "#f59e0b", "#f87171", "#a78bfa", "#fb923c", "#22d3ee"]

// Full timestamp format for table cells (bucket/firstSeen/lastSeen) — same
// options suricata-client.tsx/timeline-chart.tsx use, always rendered through
// the configured dashboard timezone (useTimezone()), never the browser's local one.
export const FULL_TIMESTAMP_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
}

// ClickHouse's JSON DateTime format is "YYYY-MM-DD HH:MM:SS" in UTC, with no
// timezone marker — `new Date(...)` on that string (even after swapping the
// space for "T") parses it as the *browser's* local time, not UTC. Appending
// "Z" is what makes it parse as the correct UTC instant before formatting
// into the dashboard's configured timezone.
export function chTimestampToIso(value: string): string {
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`
}

export function fmtBucketLabel(bucket: string, range: Range, timezone: string): string {
  const opts: Intl.DateTimeFormatOptions = range === "7d"
    ? { hour: "2-digit", minute: "2-digit", hour12: false }
    : { month: "short", day: "numeric" }
  return formatInTimezone(chTimestampToIso(bucket), timezone, opts)
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
              ? "bg-white/[0.08] text-foreground"
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
        {eyebrow && <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>}
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
    <div className="max-w-[240px] rounded-lg border border-border/50 bg-background px-3 py-2.5 text-[11px] shadow-xl">
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
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-blue-400" />
    </div>
  )
}

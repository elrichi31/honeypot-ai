"use client"

// Shared pieces across every ANALYTICS_MODULE chart (trends, credentials,
// suricata-trends, comparison) — extracted once three call sites needed the
// same range selector / tooltip / bucket-label logic.

export type Range = "7d" | "30d" | "90d" | "1y"

export const RANGE_OPTIONS: { label: string; value: Range }[] = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "1y", value: "1y" },
]

export const CHART_COLORS = ["#60a5fa", "#34d399", "#f59e0b", "#f87171", "#a78bfa", "#fb923c", "#22d3ee"]

export function fmtBucketLabel(bucket: string, range: Range): string {
  const d = new Date(bucket.replace(" ", "T"))
  if (range === "7d") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

export function RangeSelector({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden">
      {RANGE_OPTIONS.map(({ label, value: v }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1 text-[11px] transition-colors ${value === v ? "bg-white/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// Same bordered/shadowed card every Recharts Tooltip in this app uses —
// `contentStyle` alone doesn't pick up the CSS variables reliably.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const items = (payload as Array<{ color: string; name: string; value: number | null }>)
    .filter((p) => p.value != null)
  if (!items.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-[11px] shadow-lg max-w-[220px]">
      {label && <p className="text-muted-foreground mb-1.5">{label}</p>}
      {items.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {Number(p.value).toLocaleString()}
        </p>
      ))}
    </div>
  )
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-blue-400" />
    </div>
  )
}

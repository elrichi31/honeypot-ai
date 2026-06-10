import * as React from "react"
import { cn } from "@/lib/utils"
import { Surface } from "@/components/ui/surface"

/**
 * KPI / summary stat: a small label, a large value, and an optional sub-line.
 * Standardizes the ~70 hand-rolled "label + big number" cards.
 *
 * - `tone` tints the value + label + surface for alert-style stats (e.g. the
 *   CRITICAL/HIGH cards on Threats). `default` keeps the normal surface.
 * - `mono` renders the value in the monospace face (counts/IDs).
 * - `icon` shows a small leading icon next to the label.
 * - Pass `children` for a custom body instead of value/sub (e.g. an inline
 *   filter), keeping the same card shell.
 */
const toneClasses = {
  default: { surface: "", label: "text-muted-foreground", value: "text-foreground" },
  critical: { surface: "border-red-500/30 bg-red-500/5", label: "text-red-400", value: "text-red-400" },
  high: { surface: "border-orange-500/30 bg-orange-500/5", label: "text-orange-400", value: "text-orange-400" },
  accent: { surface: "border-purple-500/30 bg-purple-500/5", label: "text-purple-400", value: "text-purple-400" },
  success: { surface: "", label: "text-muted-foreground", value: "text-success" },
} as const

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
  mono = false,
  className,
  children,
}: {
  label?: React.ReactNode
  value?: React.ReactNode
  sub?: React.ReactNode
  icon?: React.ReactNode
  tone?: keyof typeof toneClasses
  mono?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const t = toneClasses[tone]
  return (
    <Surface padded className={cn(t.surface, className)}>
      {label != null && (
        <div className={cn("flex items-center gap-2 text-xs", t.label)}>
          {icon}
          <span>{label}</span>
        </div>
      )}
      {children ?? (
        <>
          {value != null && (
            <p className={cn("mt-1 text-2xl font-semibold tabular-nums", mono && "font-mono", t.value)}>
              {value}
            </p>
          )}
          {sub != null && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </>
      )}
    </Surface>
  )
}

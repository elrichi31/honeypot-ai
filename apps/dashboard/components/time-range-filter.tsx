"use client"

import { useSearchParams } from "next/navigation"
import { useNavTransitionOptional } from "@/lib/use-nav-transition"
import { cn } from "@/lib/utils"

const RANGES: { value: string; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "all", label: "All" },
]

/**
 * Global time-window selector driving a `?range=` query param (24h / 7d / 30d /
 * all). Defaults to 30d to match the server when no range is set.
 */
export function TimeRangeFilter({ paramKey = "range", resetKeys = ["page"] }: { paramKey?: string; resetKeys?: string[] }) {
  const searchParams = useSearchParams()
  const { pushParams } = useNavTransitionOptional()
  const active = searchParams.get(paramKey) ?? "30d"

  const select = (value: string) => {
    if (value === "30d") pushParams({}, [paramKey, ...resetKeys])
    else pushParams({ [paramKey]: value }, resetKeys)
  }

  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/20 p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.value}
          type="button"
          onClick={() => select(r.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            active === r.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

"use client"

import { useSearchParams } from "next/navigation"
import { useNavTransitionOptional } from "@/lib/use-nav-transition"
import { ATTACK_COLORS, ATTACK_LABELS } from "@/lib/attack-types"
import { cn } from "@/lib/utils"

/**
 * Clickable attack-type chips that drive a `?type=` query param. Selecting a
 * chip filters the surrounding view to that attack type; clicking the active
 * chip (or "All") clears the filter. Only the types present in `types` are
 * shown, so empty categories don't clutter the bar.
 */
export function AttackTypeFilter({
  types,
  counts,
  paramKey = "type",
  resetKeys = ["page"],
}: {
  types: string[]
  counts?: Record<string, number>
  paramKey?: string
  resetKeys?: string[]
}) {
  const searchParams = useSearchParams()
  const { pushParams } = useNavTransitionOptional()
  const active = searchParams.get(paramKey) ?? ""

  const select = (type: string) => {
    if (type === active || type === "") {
      pushParams({}, [paramKey, ...resetKeys])
    } else {
      pushParams({ [paramKey]: type }, resetKeys)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => select("")}
        className={cn(
          "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
          active === ""
            ? "border-foreground/40 bg-foreground/10 text-foreground"
            : "border-border text-muted-foreground hover:text-foreground",
        )}
      >
        All
      </button>
      {types.map((type) => {
        const isActive = active === type
        return (
          <button
            key={type}
            type="button"
            onClick={() => select(type)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              ATTACK_COLORS[type] ?? ATTACK_COLORS.recon,
              isActive ? "ring-2 ring-foreground/40" : "opacity-70 hover:opacity-100",
            )}
          >
            {ATTACK_LABELS[type] ?? type}
            {counts?.[type] != null && <span className="font-mono opacity-70">{counts[type]}</span>}
          </button>
        )
      })}
    </div>
  )
}

"use client"

import * as React from "react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export type BadgeItem = {
  key: string
  label: React.ReactNode
  className?: string
}

/**
 * Renders up to `max` badges inline; the rest collapse into a "+N" chip that
 * reveals the full list in a tooltip on hover. Keeps wide cells (many protocols
 * / commands per row) from blowing up the row height.
 */
export function OverflowBadges({
  items,
  max = 3,
  className,
}: {
  items: BadgeItem[]
  max?: number
  className?: string
}) {
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground/50">-</span>
  }

  const visible = items.slice(0, max)
  const hidden = items.slice(max)

  return (
    <div className={cn("flex flex-nowrap items-center gap-1", className)}>
      {visible.map((item) => (
        <span
          key={item.key}
          className={cn(
            "inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium",
            item.className ?? "border-border bg-muted/10 text-muted-foreground",
          )}
        >
          {item.label}
        </span>
      ))}

      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex shrink-0 cursor-default items-center rounded border border-border bg-muted/20 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
            >
              +{hidden.length}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs bg-popover text-popover-foreground border border-border">
            <div className="flex flex-wrap gap-1 py-0.5">
              {hidden.map((item) => (
                <span
                  key={item.key}
                  className={cn(
                    "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium",
                    item.className ?? "border-border bg-muted/10 text-muted-foreground",
                  )}
                >
                  {item.label}
                </span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

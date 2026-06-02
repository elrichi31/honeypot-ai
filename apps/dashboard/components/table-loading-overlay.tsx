"use client"

import { Spinner } from "@/components/ui/spinner"

/**
 * Semi-transparent overlay shown over a table/panel while a navigation
 * (tab switch, filter, pagination) is loading new server data.
 */
export function TableLoadingOverlay({ show, label = "Loading…" }: { show: boolean; label?: string }) {
  if (!show) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px] transition-opacity">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm">
        <Spinner className="size-4 text-primary" />
        {label}
      </div>
    </div>
  )
}

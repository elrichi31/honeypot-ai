"use client"

import { useMemo } from "react"
import type { WebHourlyCell } from "@/lib/api"
import { heatmapColor, HEATMAP_LEGEND_STEPS } from "@/lib/heatmap-color"

const HOURS = Array.from({ length: 24 }, (_, i) => i)

/**
 * Day × hour-of-day activity heatmap. Surfaces *when* attacks land — a single
 * bright cell means one burst at one hour; a vertical band means a recurring
 * daily pattern (e.g. always 03:00 UTC). Complements the per-day bar chart,
 * which can't show intra-day timing.
 */
export function HourlyHeatmap({ cells }: { cells: WebHourlyCell[] }) {
  const { days, grid, max } = useMemo(() => {
    const dayset = [...new Set(cells.map((c) => c.day))].sort().reverse().slice(0, 14)
    const lookup = new Map<string, number>()
    let max = 0
    for (const c of cells) {
      lookup.set(`${c.day}:${c.hour}`, c.count)
      if (c.count > max) max = c.count
    }
    const grid = dayset.map((day) => ({
      day,
      hours: HOURS.map((h) => lookup.get(`${day}:${h}`) ?? 0),
    }))
    return { days: dayset, grid, max }
  }, [cells])

  if (days.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No data yet</p>
  }


  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Hour axis */}
        <div className="mb-1 flex pl-14 text-[10px] text-muted-foreground">
          {HOURS.map((h) => (
            <div key={h} className="flex-1 text-center">{h % 3 === 0 ? h : ""}</div>
          ))}
        </div>
        {grid.map((row) => (
          <div key={row.day} className="mb-0.5 flex items-center">
            <div className="w-14 pr-2 text-right font-mono text-[10px] text-muted-foreground">
              {row.day.slice(5)}
            </div>
            <div className="flex flex-1 gap-0.5">
              {row.hours.map((count, h) => (
                <div
                  key={h}
                  className="h-4 flex-1 rounded-sm"
                  style={{ backgroundColor: heatmapColor(count, max) }}
                  title={`${row.day} ${String(h).padStart(2, "0")}:00 UTC · ${count} hits`}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
          <span>less</span>
          {HEATMAP_LEGEND_STEPS.map((bg) => (
            <div key={bg} className="h-3 w-3 rounded-sm" style={{ backgroundColor: bg }} />
          ))}
          <span>more</span>
        </div>
      </div>
    </div>
  )
}

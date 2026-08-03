"use client"

// Charts for the client report. Plain CSS/SVG on purpose: the deliverable is
// produced with window.print(), and a canvas-based chart library renders blank
// or clipped in print. Everything here is layout the print engine understands.
import { fmt } from "@/lib/reports/shared/format"
import type { ReportDailyBucket, ReportHourBucket } from "@/lib/reports/types"

/** Daily volume as vertical bars — shows bursts and quiet days at a glance,
 *  which the horizontal ranked bars cannot. */
export function DailyBars({ data, label }: { data: ReportDailyBucket[]; label?: string }) {
  if (data.length < 2) return null
  const max = Math.max(1, ...data.map((d) => d.count))
  const peak = data.reduce((best, d) => (d.count > best.count ? d : best), data[0])

  return (
    <div>
      {label && <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="flex h-24 items-end gap-[2px]">
        {data.map((bucket) => (
          <div
            key={bucket.date}
            title={`${bucket.date}: ${fmt(bucket.count)}`}
            className="flex-1 rounded-t bg-primary"
            style={{ height: `${Math.max(2, (bucket.count / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0].date.slice(5)}</span>
        <span>peak {peak.date.slice(5)} · {fmt(peak.count)}</span>
        <span>{data[data.length - 1].date.slice(5)}</span>
      </div>
    </div>
  )
}

/** Hour-of-day intensity. A flat band means automation running around the
 *  clock; a business-hours bulge means a human is driving it. */
export function HourHeatmap({ data, label }: { data: ReportHourBucket[]; label?: string }) {
  if (!data.length) return null
  const byHour = new Map(data.map((d) => [d.hour, d.count]))
  const max = Math.max(1, ...data.map((d) => d.count))
  const busiest = data.reduce((best, d) => (d.count > best.count ? d : best), data[0])

  return (
    <div>
      {label && <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>}
      <div className="flex gap-[2px]">
        {Array.from({ length: 24 }, (_, hour) => {
          const count = byHour.get(hour) ?? 0
          return (
            <div
              key={hour}
              title={`${String(hour).padStart(2, "0")}:00 — ${fmt(count)}`}
              className="h-8 flex-1 rounded-sm bg-primary"
              // Opacity rather than a colour ramp: survives both report themes
              // and prints legibly in greyscale.
              style={{ opacity: count === 0 ? 0.08 : 0.25 + (count / max) * 0.75 }}
            />
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>00h</span>
        <span>busiest {String(busiest.hour).padStart(2, "0")}h · {fmt(busiest.count)}</span>
        <span>23h</span>
      </div>
    </div>
  )
}

/** Share-of-total split as one stacked bar. Reads faster than a pie for a
 *  handful of categories and needs no library. */
export function ShareBar({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((sum, i) => sum + i.value, 0)
  if (total === 0) return null
  const shades = [1, 0.75, 0.55, 0.4, 0.28, 0.2]

  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded">
        {items.map((item, i) => (
          <div
            key={item.label}
            title={`${item.label}: ${fmt(item.value)}`}
            className="h-full bg-primary"
            style={{ width: `${(item.value / total) * 100}%`, opacity: shades[i] ?? 0.15 }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {items.map((item, i) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-primary" style={{ opacity: shades[i] ?? 0.15 }} />
            {item.label} {((item.value / total) * 100).toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  )
}

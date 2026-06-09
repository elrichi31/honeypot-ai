export const dynamic = "force-dynamic"

import { WebAttacksNav } from "@/components/web-attacks-nav"
import { PageShell } from "@/components/page-shell"
import { SectionError } from "@/components/section-error"
import { fetchWebTimeline, fetchWebHitsStats, fetchWebHourly } from "@/lib/api"
import { TimelineCharts } from "./timeline-charts"
import { HourlyHeatmap } from "./hourly-heatmap"
import type { WebHourlyCell } from "@/lib/api"

export default async function WebTimelinePage() {
  let days, attackTypes, stats
  let hourly: WebHourlyCell[] = []
  try {
    const [timeline, hitsStats, hourlyData] = await Promise.all([
      fetchWebTimeline(),
      fetchWebHitsStats(),
      fetchWebHourly({ range: "7d" }),
    ])
    days = timeline.days
    attackTypes = timeline.attackTypes
    stats = hitsStats
    hourly = hourlyData.cells
  } catch {
    days = null
  }

  return (
    <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Web Attacks · Timeline</h1>
          <p className="text-sm text-muted-foreground">
            Activity over the last 30 days broken down by attack type
          </p>
        </div>

        <WebAttacksNav active="timeline" />

        {days === null || !stats ? (
          <SectionError />
        ) : (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-1 font-semibold text-foreground">Activity by hour</h3>
              <p className="mb-4 text-xs text-muted-foreground">Last 14 days · hour of day (UTC) · reveals when attacks land</p>
              <HourlyHeatmap cells={hourly} />
            </div>
            <TimelineCharts days={days} attackTypes={attackTypes!} byAttackType={stats.byAttackType} />
          </div>
        )}
  </PageShell>
  )
}

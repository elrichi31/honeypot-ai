export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { WebAttacksNav } from "@/components/web-attacks-nav"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { SectionError } from "@/components/section-error"
import { fetchWebTimeline, fetchWebHitsStats, fetchWebHourly } from "@/lib/api"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { HourlyHeatmap } from "./hourly-heatmap"
import type { WebHourlyCell } from "@/lib/api"
import nextDynamic from "next/dynamic"

// No `ssr: false` (disallowed in Server Components in Next 16); timeline-charts is
// already a client component, so this just code-splits it.
const TimelineCharts = nextDynamic(
  () => import("./timeline-charts").then(m => ({ default: m.TimelineCharts })),
)

export const metadata: Metadata = {
  title: "Web Attacks Timeline — HoneyTrap",
}

export default async function WebTimelinePage() {
  let days, attackTypes, stats
  let hourly: WebHourlyCell[] = []
  const { sensorIds } = await effectiveSensorScope()
  try {
    const [timeline, hitsStats, hourlyData] = await Promise.all([
      fetchWebTimeline(sensorIds),
      fetchWebHitsStats(undefined, sensorIds),
      fetchWebHourly({ range: "7d" }, sensorIds),
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
            <Surface padded>
              <h3 className="mb-1 font-semibold text-foreground">Activity by hour</h3>
              <p className="mb-4 text-xs text-muted-foreground">Last 14 days · hour of day (UTC) · reveals when attacks land</p>
              <HourlyHeatmap cells={hourly} />
            </Surface>
            <TimelineCharts days={days} attackTypes={attackTypes!} byAttackType={stats.byAttackType} />
          </div>
        )}
  </PageShell>
  )
}

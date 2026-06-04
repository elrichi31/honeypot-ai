export const dynamic = "force-dynamic"

import { WebAttacksNav } from "@/components/web-attacks-nav"
import { PageShell } from "@/components/page-shell"
import { SectionError } from "@/components/section-error"
import { fetchWebTimeline, fetchWebHitsStats } from "@/lib/api"
import { TimelineCharts } from "./timeline-charts"

export default async function WebTimelinePage() {
  let days, attackTypes, stats
  try {
    const [timeline, hitsStats] = await Promise.all([
      fetchWebTimeline(),
      fetchWebHitsStats(),
    ])
    days = timeline.days
    attackTypes = timeline.attackTypes
    stats = hitsStats
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

        {days === null || !stats
          ? <SectionError />
          : <TimelineCharts days={days} attackTypes={attackTypes!} byAttackType={stats.byAttackType} />}
  </PageShell>
  )
}

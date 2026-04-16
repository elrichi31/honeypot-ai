import { AppSidebar } from "@/components/app-sidebar"
import { WebAttacksNav } from "@/components/web-attacks-nav"
import { fetchWebTimeline, fetchWebHitsStats } from "@/lib/api"
import { TimelineCharts } from "./timeline-charts"

export default async function WebTimelinePage() {
  const [{ days, attackTypes }, stats] = await Promise.all([
    fetchWebTimeline(),
    fetchWebHitsStats(),
  ])

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="ml-60 flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Web Attacks · Timeline</h1>
          <p className="text-sm text-muted-foreground">
            Actividad de los últimos 30 días desglosada por tipo de ataque
          </p>
        </div>

        <WebAttacksNav active="timeline" />

        <TimelineCharts days={days} attackTypes={attackTypes} byAttackType={stats.byAttackType} />
      </main>
    </div>
  )
}

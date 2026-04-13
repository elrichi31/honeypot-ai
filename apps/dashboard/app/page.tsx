import { AppSidebar } from "@/components/app-sidebar"
import { StatsCards } from "@/components/stats-cards"
import { SessionsTable } from "@/components/sessions-table"
import { TopLists } from "@/components/top-lists"
import { ActivityChart } from "@/components/activity-chart"
import { fetchEvents, fetchSessions } from "@/lib/api"
import { getStatsFromData } from "@/lib/stats"

export default async function DashboardPage() {
  const [sessions, events] = await Promise.all([
    fetchSessions({ limit: 100 }),
    fetchEvents({ limit: 100 }),
  ])

  const stats = getStatsFromData(sessions, events)

  const sessionsList = sessions.map((s) => ({
    id: s.id,
    srcIp: s.srcIp,
    startTime: s.startedAt,
    endTime: s.endedAt || undefined,
    username: s.username || undefined,
    password: s.password || undefined,
    commandCount: s._count.events,
  }))

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="ml-60 flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Real-time honeypot activity monitoring
          </p>
        </div>

        <div className="space-y-6">
          <StatsCards stats={stats} />
          <ActivityChart stats={stats} />
          <div className="grid gap-6 xl:grid-cols-2">
            <SessionsTable sessions={sessionsList} />
            <TopLists stats={stats} />
          </div>
        </div>
      </main>
    </div>
  )
}

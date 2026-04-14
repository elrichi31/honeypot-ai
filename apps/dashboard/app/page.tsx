import { Suspense } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { StatsCards } from "@/components/stats-cards"
import { SessionsTable } from "@/components/sessions-table"
import { TopLists } from "@/components/top-lists"
import { ActivityChart } from "@/components/activity-chart"
import { AttackMap } from "@/components/attack-map"
import { fetchEvents, fetchSessions } from "@/lib/api"
import { getStatsFromData } from "@/lib/stats"
import { geolocateIps } from "@/lib/geo"
import type { TimeRange } from "@/lib/types"

function getDateRange(range: TimeRange): { startDate: string; endDate: string } {
  const now = new Date()
  const end = now.toISOString()
  const start = new Date(now)

  if (range === "week") {
    start.setDate(start.getDate() - 7)
  } else if (range === "month") {
    start.setDate(start.getDate() - 30)
  } else {
    // day
    start.setHours(start.getHours() - 24)
  }

  return { startDate: start.toISOString(), endDate: end }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const params = await searchParams
  const range: TimeRange =
    params.range === "week" || params.range === "month" ? params.range : "day"

  const { startDate, endDate } = getDateRange(range)

  const [sessions, events, allSessions] = await Promise.all([
    fetchSessions({ limit: 1000, startDate, endDate }),
    fetchEvents({ limit: 2000, startDate, endDate }),
    fetchSessions({ limit: 5000 }), // all-time for the map
  ])

  const stats = getStatsFromData(sessions, events)

  // Geolocate all sessions across all time (not filtered by range)
  const countryAttacks = geolocateIps(
    allSessions.map((s) => ({ srcIp: s.srcIp, loginSuccess: s.loginSuccess ?? null })),
  )

  // Geo cache for the overview's session table
  const geoCache2 = new Map<string, ReturnType<typeof geolocateIps>[0] | null>()

  const sessionsList = sessions.map((s) => {
    const location = (() => {
      if (!geoCache2.has(s.srcIp)) {
        const r = geolocateIps([{ srcIp: s.srcIp }])
        geoCache2.set(s.srcIp, r[0] ?? null)
      }
      return geoCache2.get(s.srcIp) ?? null
    })()
    const durationSec = s.endedAt
      ? Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)
      : null
    return {
      id: s.id,
      srcIp: s.srcIp,
      country: location?.country ?? null,
      countryName: location?.name ?? null,
      startTime: s.startedAt,
      endTime: s.endedAt || undefined,
      duration: durationSec,
      username: s.username || undefined,
      password: s.password || undefined,
      loginSuccess: s.loginSuccess ?? null,
      eventCount: s._count.events,
      hassh: s.hassh ?? undefined,
      clientVersion: s.clientVersion ?? undefined,
    }
  })

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
          <Suspense fallback={<div className="h-[268px] rounded-xl border border-border bg-card" />}>
            <ActivityChart stats={stats} range={range} />
          </Suspense>
          <AttackMap countryAttacks={countryAttacks} />
          <div className="grid gap-6 xl:grid-cols-2">
            <SessionsTable sessions={sessionsList} />
            <TopLists stats={stats} />
          </div>
        </div>
      </main>
    </div>
  )
}

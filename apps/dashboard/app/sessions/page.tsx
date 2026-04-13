import { AppSidebar } from "@/components/app-sidebar"
import { SessionsTable } from "@/components/sessions-table"
import { fetchSessions } from "@/lib/api"

export default async function SessionsPage() {
  const sessions = await fetchSessions({ limit: 100 })

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
          <h1 className="text-2xl font-semibold text-foreground">Sessions</h1>
          <p className="text-sm text-muted-foreground">
            All recorded SSH sessions with detailed event timelines
          </p>
        </div>

        <SessionsTable sessions={sessionsList} showAll />
      </main>
    </div>
  )
}

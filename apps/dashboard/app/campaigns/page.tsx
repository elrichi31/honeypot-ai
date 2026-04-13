import { AppSidebar } from "@/components/app-sidebar"
import { CampaignsView } from "@/components/campaigns-view"
import { fetchSessions, fetchSessionCommands } from "@/lib/api"

export default async function CampaignsPage() {
  const [sessions, commandsMap] = await Promise.all([
    fetchSessions({ limit: 1000 }),
    fetchSessionCommands(),
  ])

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="ml-60 flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Detect repeat attackers and behavioral clusters across sessions
          </p>
        </div>
        <CampaignsView sessions={sessions} commandsMap={commandsMap} />
      </main>
    </div>
  )
}

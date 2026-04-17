import { PageShell } from "@/components/page-shell"
import { CampaignsView } from "@/components/campaigns-view"
import { fetchSessions, fetchSessionCommands } from "@/lib/api"

export default async function CampaignsPage() {
  const [sessions, commandsMap] = await Promise.all([
    fetchSessions({ limit: 1000 }),
    fetchSessionCommands(),
  ])

  return (
    <PageShell>
      
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Detect repeat attackers and behavioral clusters across sessions
          </p>
        </div>
        <CampaignsView sessions={sessions} commandsMap={commandsMap} />
  </PageShell>
  )
}

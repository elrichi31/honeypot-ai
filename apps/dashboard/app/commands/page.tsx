import { PageShell } from "@/components/page-shell"
import { CommandsView } from "@/components/commands-view"
import { fetchEvents } from "@/lib/api"

export default async function CommandsPage() {
  const events = await fetchEvents({ type: "command.input", limit: 100 })

  return (
    <PageShell>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Commands</h1>
          <p className="text-sm text-muted-foreground">
            All executed commands captured by the honeypot
          </p>
        </div>

        <CommandsView events={events} />
  </PageShell>
  )
}

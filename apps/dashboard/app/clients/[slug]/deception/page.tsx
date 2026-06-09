export const dynamic = "force-dynamic"

import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Ghost } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { SectionError } from "@/components/section-error"
import {
  fetchClients,
  fetchClientDeceptionOverview,
  fetchClientDeceptionNodes,
  fetchClientDeceptionKillchain,
  fetchClientDeceptionEvents,
} from "@/lib/api"
import { DeceptionOverview } from "@/components/deception/deception-overview"
import { KillChainView } from "@/components/deception/kill-chain-view"
import { DeceptionNodesGrid } from "@/components/deception/deception-nodes-grid"
import { DeceptionEventsTable } from "@/components/deception/deception-events-table"

export default async function ClientDeceptionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // Resolve the client for the header. notFound if the slug doesn't exist.
  let client
  try {
    const clients = await fetchClients()
    client = clients.find((c) => c.slug === slug)
  } catch {
    client = undefined
  }
  if (!client) notFound()

  let data
  try {
    const [overview, nodes, chains, events] = await Promise.all([
      fetchClientDeceptionOverview(slug),
      fetchClientDeceptionNodes(slug),
      fetchClientDeceptionKillchain(slug, 200),
      fetchClientDeceptionEvents(slug, { limit: 50 }),
    ])
    data = { overview, nodes, chains, events: events.data }
  } catch {
    return (
      <PageShell>
        <SectionError
          title="Could not load the deception network"
          message="The server took too long or did not respond. Try again in a few seconds."
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="mb-6 space-y-3">
        <Link
          href={`/clients/${slug}`}
          className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300"
        >
          <ArrowLeft className="h-4 w-4" />
          {client.name}
        </Link>
        <div className="flex items-center gap-3">
          <Ghost className="h-5 w-5 text-purple-400" />
          <h1 className="text-2xl font-semibold text-foreground">
            Deception · {client.name}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Attacker lateral movement inside this client's internal trap network (OpenCanary).
          Each interaction with a node confirms they got past the SSH honeypot.
        </p>
      </div>

      <div className="space-y-8">
        <DeceptionOverview data={data.overview} />

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Kill-chain · lateral movement</h2>
          <KillChainView chains={data.chains} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Trap nodes</h2>
          <DeceptionNodesGrid nodes={data.nodes} />
        </section>

        <DeceptionEventsTable events={data.events} />
      </div>
    </PageShell>
  )
}

export const dynamic = "force-dynamic"

import { Ghost } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { SectionError } from "@/components/section-error"
import {
  fetchDeceptionOverview,
  fetchDeceptionNodes,
  fetchDeceptionKillchain,
  fetchDeceptionEvents,
} from "@/lib/api"
import { DeceptionOverview } from "@/components/deception/deception-overview"
import { KillChainView } from "@/components/deception/kill-chain-view"
import { DeceptionNodesGrid } from "@/components/deception/deception-nodes-grid"
import { DeceptionEventsTable } from "@/components/deception/deception-events-table"

export default async function DeceptionPage() {
  let data
  try {
    const [overview, nodes, chains, events] = await Promise.all([
      fetchDeceptionOverview(),
      fetchDeceptionNodes(),
      fetchDeceptionKillchain(200),
      fetchDeceptionEvents({ limit: 50 }),
    ])
    data = { overview, nodes, chains, events: events.data }
  } catch {
    return (
      <PageShell>
        <SectionError
          title="No se pudo cargar la red de deception"
          message="El servidor tardó demasiado o no respondió. Reintenta en unos segundos."
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-3">
          <Ghost className="h-5 w-5 text-purple-400" />
          <h1 className="text-2xl font-semibold text-foreground">Deception Network</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Movimiento lateral del atacante dentro de la red trampa interna (OpenCanary). Cada
          interacción con un nodo confirma que superó el honeypot SSH.
        </p>
      </div>

      <div className="space-y-8">
        <DeceptionOverview data={data.overview} />

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Kill-chain · movimiento lateral</h2>
          <KillChainView chains={data.chains} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Nodos trampa</h2>
          <DeceptionNodesGrid nodes={data.nodes} />
        </section>

        <DeceptionEventsTable events={data.events} />
      </div>
    </PageShell>
  )
}

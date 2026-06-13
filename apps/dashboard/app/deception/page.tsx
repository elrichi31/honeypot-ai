export const dynamic = "force-dynamic"

import { Ghost } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { SectionError } from "@/components/section-error"
import {
  fetchDeceptionOverview,
  fetchDeceptionNodes,
  fetchDeceptionKillchain,
  fetchDeceptionEvents,
  fetchDeceptionPortscans,
  fetchClientDeceptionOverview,
  fetchClientDeceptionNodes,
  fetchClientDeceptionKillchain,
  fetchClientDeceptionEvents,
  fetchClientDeceptionPortscans,
  fetchClients,
  fetchSensors,
} from "@/lib/api"
import { DeceptionOverview } from "@/components/deception/deception-overview"
import { KillChainView } from "@/components/deception/kill-chain-view"
import { DeceptionNodesGrid } from "@/components/deception/deception-nodes-grid"
import { DeceptionEventsTable } from "@/components/deception/deception-events-table"
import { DeceptionPortscansTable } from "@/components/deception/deception-portscans-table"
import { DeceptionFilter } from "@/components/deception/deception-filter"
import { Surface } from "@/components/ui/surface"

export default async function DeceptionPage({
  searchParams,
}: {
  searchParams: Promise<{ clientSlug?: string; nodeId?: string }>
}) {
  const params = await searchParams
  const clientSlug = params.clientSlug?.trim() || undefined
  const nodeId = params.nodeId?.trim() || undefined

  let data
  let clients: Awaited<ReturnType<typeof fetchClients>> = []
  let sensors: Awaited<ReturnType<typeof fetchSensors>> = []
  try {
    const [overview, nodes, chains, events, portscans, clientList, sensorList] = await Promise.all([
      // Scope the overview/nodes/killchain/events to the selected client's network
      // (its OpenCanary trap nodes) when a client is picked; otherwise aggregate.
      clientSlug ? fetchClientDeceptionOverview(clientSlug) : fetchDeceptionOverview(),
      clientSlug ? fetchClientDeceptionNodes(clientSlug) : fetchDeceptionNodes(),
      clientSlug ? fetchClientDeceptionKillchain(clientSlug, 200) : fetchDeceptionKillchain(200),
      clientSlug
        ? fetchClientDeceptionEvents(clientSlug, { limit: 50, nodeId })
        : fetchDeceptionEvents({ limit: 50, nodeId }),
      clientSlug
        ? fetchClientDeceptionPortscans(clientSlug, { limit: 50, nodeId })
        : fetchDeceptionPortscans({ limit: 50, nodeId }),
      fetchClients().catch(() => []),
      fetchSensors().catch(() => []),
    ])
    data = { overview, nodes, chains, events: events.data, portscans: portscans.data }
    clients = clientList
    sensors = sensorList
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

  // Deception trap nodes carry client attribution on the sensor record, which the
  // /deception/nodes feed doesn't include — so build the filter's node list from
  // the sensors feed (protocol = deception).
  const deceptionSensors = sensors.filter((s) => s.protocol === "deception")

  // When a single node is selected, scope the cards/grid that the API doesn't
  // filter by node (overview, nodes, killchain stay network-wide; the events
  // table is already node-scoped server-side).
  const visibleNodes = nodeId ? data.nodes.filter((n) => n.sensorId === nodeId) : data.nodes

  return (
    <PageShell>
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-3">
          <Ghost className="h-5 w-5 text-purple-400" />
          <h1 className="text-2xl font-semibold text-foreground">Deception Network</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Attacker lateral movement inside the internal trap network (OpenCanary). Each
          interaction with a node confirms they got past the SSH honeypot.
        </p>
      </div>

      <Surface padded className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">Filter:</span>
          <DeceptionFilter
            clients={clients.map((c) => ({ slug: c.slug, name: c.name }))}
            nodes={deceptionSensors.map((s) => ({
              sensorId: s.sensorId,
              name: s.name,
              clientSlug: s.clientSlug,
              clientName: s.clientName,
            }))}
          />
        </div>
      </Surface>

      <div className="space-y-8">
        <DeceptionOverview data={data.overview} />

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Kill-chain · lateral movement</h2>
          <KillChainView chains={data.chains} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Trap nodes</h2>
          <DeceptionNodesGrid nodes={visibleNodes} />
        </section>

        <DeceptionPortscansTable portscans={data.portscans} />

        <DeceptionEventsTable events={data.events} />
      </div>
    </PageShell>
  )
}

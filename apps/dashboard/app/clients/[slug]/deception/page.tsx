export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Ghost } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { SectionError } from "@/components/section-error"
import { ClientDetailNav } from "@/components/clients/client-detail-nav"
import { Surface } from "@/components/ui/surface"
import {
  fetchClients,
  fetchSensors,
  fetchClientDeceptionOverview,
  fetchClientDeceptionNodes,
  fetchClientDeceptionKillchain,
  fetchClientDeceptionEvents,
} from "@/lib/api"
import { getServerT } from "@/lib/i18n/server"
import { DeceptionOverview } from "@/components/deception/deception-overview"
import { KillChainView } from "@/components/deception/kill-chain-view"
import { DeceptionNodesGrid } from "@/components/deception/deception-nodes-grid"
import { DeceptionEventsTable } from "@/components/deception/deception-events-table"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return { title: `Deception — ${slug} — HoneyTrap` }
}

export default async function ClientDeceptionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const t = await getServerT()

  // Resolve the client for the header. notFound if the slug doesn't exist.
  let client
  let hasDeceptionSensors = false
  try {
    const [clients, sensors] = await Promise.all([fetchClients(), fetchSensors()])
    client = clients.find((c) => c.slug === slug)
    hasDeceptionSensors = sensors.some((s) => s.clientSlug === slug && s.protocol === "deception")
  } catch {
    client = undefined
  }
  if (!client) notFound()

  if (!hasDeceptionSensors) {
    return (
      <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">{client.name}</h1>
        </div>
        <ClientDetailNav slug={slug} active="deception" t={t} />
        <Surface className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
          <Ghost className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">{t("clients.detail.deception.empty.title")}</p>
          <p className="max-w-md text-[13px] text-muted-foreground">{t("clients.detail.deception.empty.desc")}</p>
        </Surface>
      </PageShell>
    )
  }

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

      <ClientDetailNav slug={slug} active="deception" t={t} deceptionBadge={data.overview.hits24h} />

      <div className="space-y-8">
        <DeceptionOverview data={data.overview} />

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Kill-chain · lateral movement</h2>
          <KillChainView chains={data.chains} showClient={false} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Trap nodes</h2>
          <DeceptionNodesGrid nodes={data.nodes} />
        </section>

        <DeceptionEventsTable events={data.events} showClient={false} />
      </div>
    </PageShell>
  )
}

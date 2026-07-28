export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Ghost, ShieldAlert } from "lucide-react"
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
  fetchClientDeceptionPortscans,
} from "@/lib/api"
import { getServerT } from "@/lib/i18n/server"
import { DeceptionOverview } from "@/components/deception/deception-overview"
import { KillChainView } from "@/components/deception/kill-chain-view"
import { DeceptionNodesGrid } from "@/components/deception/deception-nodes-grid"
import { DeceptionEventsTable } from "@/components/deception/deception-events-table"
import { DeceptionPortscansTable } from "@/components/deception/deception-portscans-table"
import { DeceptionNodeFilter } from "@/components/deception/deception-filter"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return { title: `Deception — ${slug} — HoneyTrap` }
}

const DAY_MS = 24 * 60 * 60 * 1000

export default async function ClientDeceptionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ nodeId?: string }>
}) {
  const { slug } = await params
  const nodeId = (await searchParams).nodeId?.trim() || undefined
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
    const [overview, nodes, chains, events, portscans] = await Promise.all([
      fetchClientDeceptionOverview(slug),
      fetchClientDeceptionNodes(slug),
      fetchClientDeceptionKillchain(slug, 200),
      fetchClientDeceptionEvents(slug, { limit: 50, nodeId }),
      fetchClientDeceptionPortscans(slug, { limit: 50, nodeId }),
    ])
    data = { overview, nodes, chains, events: events.data, portscans: portscans.data }
  } catch {
    return (
      <PageShell>
        <SectionError title={t("deception.error.title")} message={t("deception.error.desc")} />
      </PageShell>
    )
  }

  // Same signal the index card's "breached" status encodes: a chain that touched
  // two or more trap nodes means the attacker is moving, not just probing.
  const cutoff = Date.now() - DAY_MS
  const breaches = data.chains.filter(
    (c) => c.nodesTouched >= 2 && new Date(c.lastSeen).getTime() >= cutoff,
  ).length

  return (
    <PageShell>
      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-3">
          <Ghost className="h-5 w-5 text-purple-400" />
          <h1 className="text-2xl font-semibold text-foreground">
            {t("deception.detail.title", { client: client.name })}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">{t("deception.detail.subtitle")}</p>
      </div>

      <ClientDetailNav slug={slug} active="deception" t={t} deceptionBadge={data.overview.hits24h} />

      <div className="space-y-8">
        {breaches > 0 && (
          <Surface className="flex items-start gap-3 border-red-400/40 px-4 py-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div>
              <p className="text-sm font-medium text-red-400">{t("deception.detail.breach.title")}</p>
              <p className="text-[13px] text-muted-foreground">
                {t("deception.detail.breach.desc", { n: breaches })}
              </p>
            </div>
          </Surface>
        )}

        <DeceptionOverview data={data.overview} />

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">{t("deception.detail.killchain")}</h2>
          <KillChainView chains={data.chains} showClient={false} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">{t("deception.detail.nodes")}</h2>
          <DeceptionNodesGrid nodes={nodeId ? data.nodes.filter((n) => n.sensorId === nodeId) : data.nodes} />
        </section>

        <Surface padded>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">{t("deception.detail.filter")}</span>
            <DeceptionNodeFilter nodes={data.nodes.map((n) => ({ sensorId: n.sensorId, name: n.name }))} />
          </div>
        </Surface>

        <DeceptionPortscansTable portscans={data.portscans} showClient={false} />

        <DeceptionEventsTable events={data.events} showClient={false} />
      </div>
    </PageShell>
  )
}

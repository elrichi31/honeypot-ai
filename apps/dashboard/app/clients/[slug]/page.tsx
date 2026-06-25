import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Server, Wifi, Ghost } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { ClientSensorAssignment } from "@/components/clients/client-sensor-assignment"
import { ClientForwardingSettings } from "@/components/clients/client-forwarding-settings"
import { ClientSensorCatalog } from "@/components/clients/client-sensor-catalog"
import { ClientOVADownload } from "@/components/clients/client-ova-download"
import { ClientActivityChart } from "@/components/clients/client-activity-chart"
import { ClientLogsViewer } from "@/components/clients/client-logs-viewer"
import { ClientAlerts } from "@/components/clients/client-alerts"
import { ClientStatsBar } from "@/components/clients/client-stats-bar"
import { SectionError } from "@/components/section-error"
import { Surface } from "@/components/ui/surface"
import { fetchClients, fetchSensors } from "@/lib/api"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return { title: `Client ${slug} — HoneyTrap` }
}

export default async function ClientDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let clients, sensors
  try {
    [clients, sensors] = await Promise.all([fetchClients(), fetchSensors()])
  } catch {
    return (
      <PageShell>
        <div className="mb-6">
          <Link href="/clients" className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300">
            <ArrowLeft className="h-4 w-4" />
            Back to clients
          </Link>
        </div>
        <SectionError />
      </PageShell>
    )
  }
  const client = clients.find((item) => item.slug === slug)

  if (!client) notFound()

  const clientSensors = sensors
    .filter((sensor) => sensor.clientSlug === slug)
    .sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || b.eventsTotal - a.eventsTotal)
  const unassignedSensors = sensors.filter((sensor) => !sensor.clientId)

  const online = clientSensors.filter((sensor) => sensor.online).length
  const totalEvents = clientSensors.reduce((sum, sensor) => sum + sensor.eventsTotal, 0)
  const hasDeception = clientSensors.some((sensor) => sensor.protocol === "deception")

  return (
    <PageShell>
      <div className="mb-6 space-y-3">
        <Link href="/clients" className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300">
          <ArrowLeft className="h-4 w-4" />
          Back to clients
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{client.name}</h1>
          <p className="text-sm text-muted-foreground">{client.description || "No description available."}</p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Surface className="flex items-center gap-2 px-4 py-3">
          <Server className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-medium text-foreground">{clientSensors.length} sensors</span>
        </Surface>
        <Surface className="flex items-center gap-2 px-4 py-3">
          <Wifi className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-medium text-foreground">{online} online</span>
        </Surface>
        <Surface className="flex items-center gap-2 px-4 py-3">
          <span className="text-sm font-medium text-foreground">{totalEvents.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground">total events</span>
        </Surface>
        <ClientOVADownload client={client} />
        {hasDeception && (
          <Link
            href={`/clients/${client.slug}/deception`}
            className="inline-flex items-center gap-2 rounded-xl border border-purple-400/30 bg-purple-400/10 px-4 py-3 text-sm font-medium text-purple-300 transition-colors hover:bg-purple-400/20"
          >
            <Ghost className="h-4 w-4" />
            Ver deception
          </Link>
        )}
      </div>

      <div className="mb-6">
        <ClientForwardingSettings client={client} />
      </div>

      <div className="mb-6">
        <ClientSensorCatalog client={client} assignedSensors={clientSensors} />
      </div>

      <div className="mb-6">
        <ClientStatsBar clientSlug={client.slug} />
      </div>

      <div className="mb-6">
        <ClientActivityChart clientSlug={client.slug} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ClientLogsViewer
          clientSlug={client.slug}
          sensors={clientSensors.map((s) => ({ sensorId: s.sensorId, name: s.name, protocol: s.protocol }))}
        />
        <ClientAlerts clientSlug={client.slug} />
      </div>

      <ClientSensorAssignment
        client={client}
        initialAssignedSensors={clientSensors}
        initialUnassignedSensors={unassignedSensors}
      />
    </PageShell>
  )
}

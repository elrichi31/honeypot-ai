import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Server, Wifi } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { ClientSensorAssignment } from "@/components/clients/client-sensor-assignment"
import { fetchClients, fetchSensors } from "@/lib/api"

export default async function ClientDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const [clients, sensors] = await Promise.all([fetchClients(), fetchSensors()])
  const client = clients.find((item) => item.slug === slug)

  if (!client) notFound()

  const clientSensors = sensors
    .filter((sensor) => sensor.clientSlug === slug)
    .sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || b.eventsTotal - a.eventsTotal)
  const unassignedSensors = sensors.filter((sensor) => !sensor.clientId)

  const online = clientSensors.filter((sensor) => sensor.online).length
  const totalEvents = clientSensors.reduce((sum, sensor) => sum + sensor.eventsTotal, 0)

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
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
          <Server className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-medium text-foreground">{clientSensors.length} sensors</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
          <Wifi className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-medium text-foreground">{online} online</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-sm font-medium text-foreground">{totalEvents.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground">total events</span>
        </div>
      </div>

      <ClientSensorAssignment
        client={client}
        initialAssignedSensors={clientSensors}
        initialUnassignedSensors={unassignedSensors}
      />
    </PageShell>
  )
}

import { PageShell } from "@/components/page-shell"
import { ClientManager } from "@/components/clients/client-manager"
import { fetchClients, fetchSensors } from "@/lib/api"
import type { Client, Sensor } from "@/lib/api"

export default async function ClientsPage() {
  let clients: Client[] = []
  let sensors: Sensor[] = []

  try {
    ;[clients, sensors] = await Promise.all([fetchClients(), fetchSensors()])
  } catch {
    clients = []
    sensors = []
  }

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Clients</h1>
        <p className="text-sm text-muted-foreground">
          Create tenants and map each sensor to the right customer.
        </p>
      </div>

      <ClientManager initialClients={clients} initialSensors={sensors} />
    </PageShell>
  )
}

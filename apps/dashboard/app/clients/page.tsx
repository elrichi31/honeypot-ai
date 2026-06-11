export const dynamic = "force-dynamic"

import { PageShell } from "@/components/page-shell"
import { ClientManager } from "@/components/clients/client-manager"
import { fetchClients, fetchSensors } from "@/lib/api"
import type { Client, Sensor } from "@/lib/api"
import { getServerT } from "@/lib/i18n/server"

export default async function ClientsPage() {
  const t = await getServerT()
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
        <h1 className="text-2xl font-semibold text-foreground">{t("clients.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("clients.subtitle")}
        </p>
      </div>

      <ClientManager initialClients={clients} initialSensors={sensors} />
    </PageShell>
  )
}

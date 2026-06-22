"use client"

import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Client, Sensor } from "@/lib/api"
import { ClientCard } from "./client-card"
import { CreateClientDialog } from "./create-client-dialog"
import { EditClientDialog } from "./edit-client-dialog"
import { DeleteClientDialog } from "./delete-client-dialog"
import { useT } from "@/components/locale-provider"

type Props = {
  initialClients: Client[]
  initialSensors: Sensor[]
}

export function ClientManager({ initialClients, initialSensors }: Props) {
  const t = useT()
  const [clients, setClients] = useState(initialClients)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [deleteClient, setDeleteClient] = useState<Client | null>(null)

  const clientStats = useMemo(() => {
    const stats = new Map<string, { sensors: number; online: number; events: number }>()
    for (const client of clients) stats.set(client.id, { sensors: 0, online: 0, events: 0 })
    for (const sensor of initialSensors) {
      if (!sensor.clientId) continue
      const current = stats.get(sensor.clientId)
      if (!current) continue
      current.sensors += 1
      current.online += sensor.online ? 1 : 0
      current.events += sensor.eventsTotal
    }
    return stats
  }, [clients, initialSensors])

  function sortedInsert(list: Client[], client: Client) {
    return [...list.filter((c) => c.id !== client.id), client].sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("clients.inventory.subtitle")}</p>
        <CreateClientDialog
          trigger={
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("clients.add")}
            </Button>
          }
          onCreated={(client) => setClients((prev) => sortedInsert(prev, client))}
        />
      </div>

      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("clients.none")}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                stats={clientStats.get(client.id) ?? { sensors: 0, online: 0, events: 0 }}
                onEdit={setEditClient}
                onDelete={setDeleteClient}
              />
            ))}
          </div>

          <EditClientDialog
            client={editClient}
            onClose={() => setEditClient(null)}
            onSaved={(updated) => setClients((prev) => sortedInsert(prev, updated))}
          />

          <DeleteClientDialog
            client={deleteClient}
            onClose={() => setDeleteClient(null)}
            onDeleted={(id) => setClients((prev) => prev.filter((c) => c.id !== id))}
          />
        </>
      )}
    </div>
  )
}

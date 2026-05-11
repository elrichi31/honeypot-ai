"use client"

import { useMemo, useState } from "react"
import { Building2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Client, Sensor } from "@/lib/api"
import { ClientCard } from "./client-card"
import { CreateClientDialog } from "./create-client-dialog"
import { EditClientDialog } from "./edit-client-dialog"
import { DeleteClientDialog } from "./delete-client-dialog"

type Props = {
  initialClients: Client[]
  initialSensors: Sensor[]
}

export function ClientManager({ initialClients, initialSensors }: Props) {
  const [clients, setClients] = useState(initialClients)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [deleteClient, setDeleteClient] = useState<Client | null>(null)
  const [message, setMessage] = useState<string | null>(null)

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
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400/10">
              <Building2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Client Inventory</h2>
              <p className="text-sm text-muted-foreground">
                Create clients first, then open each one to assign unassigned sensors.
              </p>
            </div>
          </div>

          <CreateClientDialog
            trigger={
              <Button className="gap-2 self-start md:self-auto">
                <Plus className="h-4 w-4" />
                Add Client
              </Button>
            }
            onCreated={(client) => {
              setClients((prev) => sortedInsert(prev, client))
              setMessage(`Client ${client.name} created.`)
            }}
          />
        </div>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients created yet.</p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
              onSaved={(updated) =>
                setClients((prev) => sortedInsert(prev, updated))
              }
            />

            <DeleteClientDialog
              client={deleteClient}
              onClose={() => setDeleteClient(null)}
              onDeleted={(id) => setClients((prev) => prev.filter((c) => c.id !== id))}
            />
          </>
        )}
      </section>
    </div>
  )
}

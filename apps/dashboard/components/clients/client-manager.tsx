"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Building2, Save, Server } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Client, Sensor } from "@/lib/api"

type Props = {
  initialClients: Client[]
  initialSensors: Sensor[]
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function ClientManager({ initialClients, initialSensors }: Props) {
  const [clients, setClients] = useState(initialClients)
  const [sensors, setSensors] = useState(initialSensors)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [creating, setCreating] = useState(false)
  const [assigningSensorId, setAssigningSensorId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const sortedSensors = useMemo(
    () =>
      [...sensors].sort((a, b) => {
        const clientA = a.clientName ?? "ZZZ"
        const clientB = b.clientName ?? "ZZZ"
        return clientA.localeCompare(clientB) || a.name.localeCompare(b.name)
      }),
    [sensors],
  )

  const clientStats = useMemo(() => {
    const stats = new Map<string, { sensors: number; online: number; events: number }>()
    for (const client of clients) {
      stats.set(client.id, { sensors: 0, online: 0, events: 0 })
    }
    for (const sensor of sensors) {
      if (!sensor.clientId) continue
      const current = stats.get(sensor.clientId)
      if (!current) continue
      current.sensors += 1
      current.online += sensor.online ? 1 : 0
      current.events += sensor.eventsTotal
    }
    return stats
  }, [clients, sensors])

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setMessage(null)

    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug: slug || slugify(name),
          description,
        }),
      })

      if (!res.ok) throw new Error("Could not create client")
      const client = (await res.json()) as Client
      setClients((current) =>
        [...current.filter((item) => item.id !== client.id), client].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      )
      setName("")
      setSlug("")
      setDescription("")
      setMessage(`Client ${client.name} is ready.`)
    } catch {
      setMessage("Could not create the client.")
    } finally {
      setCreating(false)
    }
  }

  async function handleAssignSensor(sensorId: string, clientId: string) {
    setAssigningSensorId(sensorId)
    setMessage(null)

    try {
      const res = await fetch(`/api/sensors/${encodeURIComponent(sensorId)}/client`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientId || null }),
      })

      if (!res.ok) throw new Error("Could not assign sensor")
      const updated = (await res.json()) as {
        sensorId: string
        clientId: string | null
        clientName: string | null
        clientSlug: string | null
      }

      setSensors((current) =>
        current.map((sensor) =>
          sensor.sensorId === sensorId
            ? {
                ...sensor,
                clientId: updated.clientId,
                clientName: updated.clientName,
                clientSlug: updated.clientSlug,
              }
            : sensor,
        ),
      )

      setMessage("Sensor assignment updated.")
    } catch {
      setMessage("Could not update the sensor assignment.")
    } finally {
      setAssigningSensorId(null)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreateClient} className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/10">
            <Building2 className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Create Client</h2>
            <p className="text-sm text-muted-foreground">
              Use one client per tenant, company, or environment.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="client-name">Name</Label>
            <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client A" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-slug">Slug</Label>
            <Input
              id="client-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="client-a"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="client-description">Description</Label>
          <Textarea
            id="client-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional notes about this customer or deployment."
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={creating || !name.trim()}>
            <Save className="h-4 w-4" />
            {creating ? "Creating..." : "Create Client"}
          </Button>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
      </form>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400/10">
            <Server className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Client Inventory</h2>
            <p className="text-sm text-muted-foreground">
              Every client groups one or more sensors under the same deployment owner.
            </p>
          </div>
        </div>

        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients created yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {clients.map((client) => {
              const stats = clientStats.get(client.id) ?? { sensors: 0, online: 0, events: 0 }

              return (
                <div key={client.id} className="rounded-xl border border-border/70 bg-background/60 p-4 space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-foreground">{client.name}</h3>
                      <Link href={`/clients/${client.slug}`} className="text-xs font-medium text-cyan-400 hover:text-cyan-300">
                        Open
                      </Link>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">{client.slug}</p>
                  </div>
                  <p className="text-sm text-muted-foreground min-h-10">
                    {client.description || "No description yet."}
                  </p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sensors</p>
                      <p className="font-semibold text-foreground">{stats.sensors}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Online</p>
                      <p className="font-semibold text-foreground">{stats.online}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Events</p>
                      <p className="font-semibold text-foreground">{stats.events.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Assign Sensors</h2>
          <p className="text-sm text-muted-foreground">
            Reassign existing sensors without restarting the honeypot containers.
          </p>
        </div>

        <div className="space-y-3">
          {sortedSensors.map((sensor) => (
            <div
              key={sensor.sensorId}
              className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/60 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium text-foreground">{sensor.name}</p>
                <p className="text-xs text-muted-foreground">
                  {sensor.sensorId} | {sensor.protocol.toUpperCase()} | {sensor.ip || "no-ip"}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  className="flex h-10 min-w-52 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={sensor.clientId ?? ""}
                  onChange={(e) => handleAssignSensor(sensor.sensorId, e.target.value)}
                  disabled={assigningSensorId === sensor.sensorId}
                >
                  <option value="">Unassigned</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted-foreground">
                  {assigningSensorId === sensor.sensorId ? "Saving..." : sensor.clientName ?? "No client"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

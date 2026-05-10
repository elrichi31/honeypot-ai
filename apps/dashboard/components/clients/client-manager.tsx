"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Building2, Plus, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const clientStats = useMemo(() => {
    const stats = new Map<string, { sensors: number; online: number; events: number }>()
    for (const client of clients) {
      stats.set(client.id, { sensors: 0, online: 0, events: 0 })
    }
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

  function resetForm() {
    setName("")
    setSlug("")
    setDescription("")
  }

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
      resetForm()
      setOpen(false)
      setMessage(`Client ${client.name} created.`)
    } catch {
      setMessage("Could not create the client.")
    } finally {
      setCreating(false)
    }
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

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 self-start md:self-auto">
                <Plus className="h-4 w-4" />
                Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <form onSubmit={handleCreateClient} className="space-y-5">
                <DialogHeader>
                  <DialogTitle>Create Client</DialogTitle>
                  <DialogDescription>
                    Create the tenant first. Sensor assignment happens inside the client detail.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="client-name">Name</Label>
                    <Input
                      id="client-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Client A"
                    />
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

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetForm()
                      setOpen(false)
                    }}
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating || !name.trim()}>
                    <Save className="h-4 w-4" />
                    {creating ? "Creating..." : "Create Client"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients created yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {clients.map((client) => {
              const stats = clientStats.get(client.id) ?? { sensors: 0, online: 0, events: 0 }

              return (
                <Link
                  key={client.id}
                  href={`/clients/${client.slug}`}
                  className="rounded-xl border border-border/70 bg-background/60 p-4 space-y-3 transition-colors hover:border-cyan-400/50 hover:bg-background"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-foreground">{client.name}</h3>
                      <span className="text-xs font-medium text-cyan-400">Open</span>
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
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

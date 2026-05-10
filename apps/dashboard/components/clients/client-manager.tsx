"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Building2, Pencil, Plus, Save, Trash2, X } from "lucide-react"
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

function normalizeClientCode(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "")
    .trim()
    .toUpperCase()
}

function deriveClientCode(value: string) {
  return normalizeClientCode(value).slice(0, 12)
}

export function ClientManager({ initialClients, initialSensors }: Props) {
  const [clients, setClients] = useState(initialClients)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")
  const [forwardUrl, setForwardUrl] = useState("")
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [editClient, setEditClient] = useState<Client | null>(null)
  const [editName, setEditName] = useState("")
  const [editCode, setEditCode] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editForwardUrl, setEditForwardUrl] = useState("")
  const [saving, setSaving] = useState(false)

  const [deleteClient, setDeleteClient] = useState<Client | null>(null)
  const [deleting, setDeleting] = useState(false)

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
    setCode("")
    setDescription("")
    setForwardUrl("")
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
          code: code || deriveClientCode(slug || name),
          description,
          forwardUrl,
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

  function openEdit(client: Client) {
    setEditClient(client)
    setEditName(client.name)
    setEditCode(client.code)
    setEditDescription(client.description || "")
    setEditForwardUrl(client.forwardUrl || "")
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editClient) return
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(editClient.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          code: editCode,
          description: editDescription,
          forwardUrl: editForwardUrl,
        }),
      })
      if (!res.ok) throw new Error()
      const updated = (await res.json()) as Client
      setClients((current) =>
        current.map((c) => (c.id === updated.id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name)),
      )
      setEditClient(null)
    } catch {
      // keep modal open on error
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteClient) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(deleteClient.id)}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setClients((current) => current.filter((c) => c.id !== deleteClient.id))
      setDeleteClient(null)
    } catch {
      // keep modal open on error
    } finally {
      setDeleting(false)
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
                  <Label htmlFor="client-code">Client Code</Label>
                  <Input
                    id="client-code"
                    value={code}
                    onChange={(e) => setCode(normalizeClientCode(e.target.value))}
                    placeholder="SLSA"
                    className="font-mono uppercase"
                  />
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

                <div className="space-y-2">
                  <Label htmlFor="client-forward-url">Forward URL</Label>
                  <Input
                    id="client-forward-url"
                    value={forwardUrl}
                    onChange={(e) => setForwardUrl(e.target.value)}
                    placeholder="https://ingestapi.com/alerts/cop-pz"
                    className="font-mono text-sm"
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
          <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {clients.map((client) => {
              const stats = clientStats.get(client.id) ?? { sensors: 0, online: 0, events: 0 }

              return (
                <div
                  key={client.id}
                  className="rounded-xl border border-border/70 bg-background/60 p-4 space-y-3 transition-colors hover:border-border hover:bg-background"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/clients/${client.slug}`}
                        className="font-semibold text-foreground hover:text-cyan-400 transition-colors"
                      >
                        {client.name}
                      </Link>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEdit(client)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title="Edit client"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteClient(client)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-red-400/10 hover:text-red-400 transition-colors"
                          title="Delete client"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <p className="font-mono">{client.slug}</p>
                      <span className="rounded border border-border/70 bg-card px-1.5 py-0.5 font-mono text-[10px] text-foreground/90">
                        {client.code}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground min-h-10">
                    {client.description || "No description yet."}
                  </p>
                  <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Forwarding</p>
                    <p className="mt-1 truncate font-mono text-xs text-foreground">
                      {client.forwardUrl || "disabled"}
                    </p>
                  </div>
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
                  <Link
                    href={`/clients/${client.slug}`}
                    className="block text-center text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors pt-1"
                  >
                    Open →
                  </Link>
                </div>
              )
            })}
          </div>

          {/* Edit modal */}
          <Dialog open={!!editClient} onOpenChange={(open) => { if (!open) setEditClient(null) }}>
            <DialogContent className="sm:max-w-xl">
              <form onSubmit={handleSaveEdit} className="space-y-5">
                <DialogHeader>
                  <DialogTitle>Edit Client</DialogTitle>
                  <DialogDescription>
                    Update the client details. The slug cannot be changed.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Name</Label>
                    <Input
                      id="edit-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Client A"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-code">Client Code</Label>
                    <Input
                      id="edit-code"
                      value={editCode}
                      onChange={(e) => setEditCode(normalizeClientCode(e.target.value))}
                      placeholder="SLSA"
                      className="font-mono uppercase"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Slug</Label>
                  <div className="flex h-10 items-center rounded-md border border-border bg-muted px-3 font-mono text-sm text-muted-foreground">
                    {editClient?.slug}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Optional notes."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-forward-url">Forward URL</Label>
                  <Input
                    id="edit-forward-url"
                    value={editForwardUrl}
                    onChange={(e) => setEditForwardUrl(e.target.value)}
                    placeholder="https://ingestapi.com/alerts/cop-pz"
                    className="font-mono text-sm"
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditClient(null)}>
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving || !editName.trim() || !editCode.trim()}>
                    <Save className="h-4 w-4" />
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Delete confirmation modal */}
          <Dialog open={!!deleteClient} onOpenChange={(open) => { if (!open) setDeleteClient(null) }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Delete Client</DialogTitle>
                <DialogDescription>
                  This will permanently delete{" "}
                  <span className="font-semibold text-foreground">{deleteClient?.name}</span> and unassign
                  all its sensors. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteClient(null)} disabled={deleting}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? "Deleting..." : "Delete Client"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
        )}
      </section>
    </div>
  )
}

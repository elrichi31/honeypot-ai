"use client"

import { apiFetch } from "@/lib/client-fetch"

import { useEffect, useState } from "react"
import { Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Client } from "@/lib/api"
import { normalizeClientCode } from "./client-utils"

type Props = {
  client: Client | null
  onClose: () => void
  onSaved: (client: Client) => void
}

export function EditClientDialog({ client, onClose, onSaved }: Props) {
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")
  const [forwardUrl, setForwardUrl] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (client) {
      setName(client.name)
      setCode(client.code)
      setDescription(client.description || "")
      setForwardUrl(client.forwardUrl || "")
    }
  }, [client])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!client) return
    setSaving(true)
    try {
      const res = await apiFetch(`/api/clients/${encodeURIComponent(client.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, description, forwardUrl }),
      })
      if (!res.ok) throw new Error()
      onSaved(await res.json() as Client)
      onClose()
    } catch {
      // keep dialog open on error
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!client} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update the client details. The slug cannot be changed.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Client A"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-code">Client Code</Label>
              <Input
                id="edit-code"
                value={code}
                onChange={(e) => setCode(normalizeClientCode(e.target.value))}
                placeholder="SLSA"
                className="font-mono uppercase"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Slug</Label>
            <div className="flex h-10 items-center rounded-md border border-border bg-muted px-3 font-mono text-sm text-muted-foreground">
              {client?.slug}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-forward-url">Forward URL</Label>
            <Input
              id="edit-forward-url"
              value={forwardUrl}
              onChange={(e) => setForwardUrl(e.target.value)}
              placeholder="https://ingestapi.com/alerts/cop-pz"
              className="font-mono text-sm"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim() || !code.trim()}>
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

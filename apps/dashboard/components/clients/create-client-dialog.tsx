"use client"

import { apiFetch } from "@/lib/client-fetch"

import { useState } from "react"
import { Save, X } from "lucide-react"
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
import type { Client } from "@/lib/api"
import { slugify, normalizeClientCode, deriveClientCode } from "./client-utils"

type Props = {
  trigger: React.ReactNode
  onCreated: (client: Client) => void
}

export function CreateClientDialog({ trigger, onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")
  const [forwardUrl, setForwardUrl] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")

  function reset() {
    setName("")
    setSlug("")
    setCode("")
    setDescription("")
    setForwardUrl("")
    setError("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError("")
    try {
      const res = await apiFetch("/api/clients", {
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
      if (!res.ok) {
        // Surface the server's validation message (e.g. invalid slug/code/URL)
        // instead of silently leaving the dialog open with no feedback.
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? `No se pudo crear el cliente (error ${res.status})`)
        return
      }
      const client = (await res.json()) as Client
      onCreated(client)
      reset()
      setOpen(false)
    } catch {
      setError("No se pudo conectar con el servidor")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-5">
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

          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); setOpen(false) }}>
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
  )
}

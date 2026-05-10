"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, Save, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Client } from "@/lib/api"

type Props = {
  client: Client
}

export function ClientForwardingSettings({ client }: Props) {
  const router = useRouter()
  const [name, setName] = useState(client.name)
  const [code, setCode] = useState(client.code)
  const [description, setDescription] = useState(client.description || "")
  const [forwardUrl, setForwardUrl] = useState(client.forwardUrl || "")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function normalizeClientCode(value: string) {
    return value
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "")
      .trim()
      .toUpperCase()
  }

  async function saveSettings() {
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(client.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code,
          description,
          forwardUrl,
        }),
      })

      if (!res.ok) throw new Error("Could not save client settings")
      router.refresh()
      setMessage(forwardUrl.trim() ? "Client settings saved." : "Client saved with forwarding disabled.")
    } catch {
      setMessage("Could not save the client settings.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Send className="h-5 w-5 text-foreground/80" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Client Forwarding</h2>
          <p className="text-sm text-muted-foreground">
            Every new event from this client's sensors will be POSTed here as JSON.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="client-name">Client Name</Label>
          <Input
            id="client-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Cliente A"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="client-code">Client Code</Label>
          <Input
            id="client-code"
            value={code}
            onChange={(event) => setCode(normalizeClientCode(event.target.value))}
            placeholder="SLSA"
            className="font-mono uppercase"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="client-slug">Slug</Label>
        <div className="flex h-10 items-center rounded-md border border-border bg-muted px-3 font-mono text-sm text-muted-foreground">
          {client.slug}
        </div>
        <p className="text-xs text-muted-foreground">
          The slug stays stable because sensors and forwarding use it as the tenant key.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="client-description">Description</Label>
        <Textarea
          id="client-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optional notes about this customer or deployment."
          className="min-h-24"
        />
      </div>

      <div className="space-y-2 rounded-xl border border-border/70 bg-background/40 p-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-foreground/80" />
          <p className="text-sm font-medium text-foreground">Forwarding Endpoint</p>
        </div>
        <Input
          id="client-forward-url"
          value={forwardUrl}
          onChange={(event) => setForwardUrl(event.target.value)}
          placeholder="https://ingestapi.com/alerts/cop-pz"
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Leave empty to disable forwarding for this client.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={saveSettings} disabled={saving || !name.trim() || !code.trim()} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Client"}
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </section>
  )
}

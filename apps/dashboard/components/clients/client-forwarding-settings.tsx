"use client"

import { useState } from "react"
import { Save, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Client } from "@/lib/api"

type Props = {
  client: Client
}

export function ClientForwardingSettings({ client }: Props) {
  const [forwardUrl, setForwardUrl] = useState(client.forwardUrl || "")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function saveForwarding() {
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(client.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forwardUrl }),
      })

      if (!res.ok) throw new Error("Could not save forwarding")
      setMessage(forwardUrl.trim() ? "Forwarding URL saved." : "Forwarding disabled for this client.")
    } catch {
      setMessage("Could not save the forwarding URL.")
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

      <div className="space-y-2">
        <Label htmlFor="client-forward-url">Forward URL</Label>
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
        <Button onClick={saveForwarding} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Forwarding"}
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </section>
  )
}

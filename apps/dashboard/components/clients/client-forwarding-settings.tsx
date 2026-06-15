"use client"

import { apiFetch } from "@/lib/client-fetch"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, Save, Send, Settings2, CheckCircle2, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { Client } from "@/lib/api"

type Props = { client: Client }

export function ClientForwardingSettings({ client }: Props) {
  const router = useRouter()
  const [open, setOpen]               = useState(false)
  const [name, setName]                       = useState(client.name)
  const [code, setCode]                       = useState(client.code)
  const [description, setDescription]         = useState(client.description || "")
  const [forwardUrl, setForwardUrl]           = useState(client.forwardUrl || "")
  const [crowdstrikeHecUrl, setCrowdstrikeHecUrl] = useState(client.crowdstrikeHecUrl || "")
  const [crowdstrikeApiKey, setCrowdstrikeApiKey] = useState(client.crowdstrikeApiKey || "")
  const [saving, setSaving]                   = useState(false)
  const [message, setMessage]                 = useState<string | null>(null)

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
      const res = await apiFetch(`/api/clients/${encodeURIComponent(client.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, description, forwardUrl, crowdstrikeHecUrl, crowdstrikeApiKey }),
      })
      if (!res.ok) throw new Error()
      router.refresh()
      setMessage(forwardUrl.trim() ? "Settings saved." : "Saved — forwarding disabled.")
    } catch {
      setMessage("Could not save client settings.")
    } finally {
      setSaving(false)
    }
  }

  const hasForwarding = !!client.forwardUrl
  const hasCrowdStrike = !!(client.crowdstrikeHecUrl && client.crowdstrikeApiKey)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-border/80 hover:bg-card/80 group">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Send className="h-4 w-4 text-foreground/70" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground">Client Settings</p>
                {hasForwarding && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Forwarding active
                  </span>
                )}
                {hasCrowdStrike && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-400/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
                    <Shield className="h-3 w-3" />
                    CrowdStrike
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {hasForwarding ? client.forwardUrl : hasCrowdStrike ? "CrowdStrike SIEM active" : "Name, code, description and event forwarding"}
              </p>
            </div>
            <Settings2 className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-hover:rotate-45 duration-300" />
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Settings2 className="h-4 w-4 text-foreground/80" />
            </div>
            <div>
              <DialogTitle>Client Settings</DialogTitle>
              <DialogDescription className="mt-0.5">
                Edit client details and configure event forwarding.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client-name">Client Name</Label>
              <Input
                id="client-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Cliente A"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-code">Client Code</Label>
              <Input
                id="client-code"
                value={code}
                onChange={e => setCode(normalizeClientCode(e.target.value))}
                placeholder="SLSA"
                className="font-mono uppercase"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Slug</Label>
            <div className="flex h-9 items-center rounded-md border border-border bg-muted px-3 font-mono text-sm text-muted-foreground">
              {client.slug}
            </div>
            <p className="text-xs text-muted-foreground">
              Stable — sensors and forwarding use it as the tenant key.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-description">Description</Label>
            <Textarea
              id="client-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional notes about this customer or deployment."
              className="min-h-20 resize-none"
            />
          </div>

          <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-foreground/70" />
              <p className="text-sm font-medium text-foreground">Forwarding Endpoint</p>
            </div>
            <Input
              value={forwardUrl}
              onChange={e => setForwardUrl(e.target.value)}
              placeholder="https://ingestapi.com/alerts/cop-pz"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to disable. Every new event will be POSTed here as JSON.
            </p>
          </div>

          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-foreground/70" />
              <p className="text-sm font-medium text-foreground">CrowdStrike Next-Gen SIEM</p>
              {(crowdstrikeHecUrl && crowdstrikeApiKey) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Active
                </span>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cs-hec-url">API URL</Label>
              <Input
                id="cs-hec-url"
                value={crowdstrikeHecUrl}
                onChange={e => setCrowdstrikeHecUrl(e.target.value)}
                placeholder="https://<id>.ingest.<region>.crowdstrike.com/services/collector"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cs-api-key">API Key</Label>
              <Input
                id="cs-api-key"
                type="password"
                value={crowdstrikeApiKey}
                onChange={e => setCrowdstrikeApiKey(e.target.value)}
                placeholder="••••••••••••••••••••••••••••••••"
                className="font-mono text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Alerts for this client will be forwarded to CrowdStrike Next-Gen SIEM via HEC. Leave both fields empty to disable.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={saveSettings}
              disabled={saving || !name.trim() || !code.trim()}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save"}
            </Button>
            {message && (
              <p className="text-sm text-muted-foreground">{message}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

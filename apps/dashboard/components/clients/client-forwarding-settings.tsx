"use client"

import { apiFetch } from "@/lib/client-fetch"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, Save, Send, Settings2, CheckCircle2, ChevronDown, ChevronUp, FlaskConical, XCircle, Loader2 } from "lucide-react"
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

function CrowdStrikeLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="CrowdStrike">
      <rect width="32" height="32" rx="6" fill="#FC0000"/>
      <path d="M7 11.5C8.8 8.5 12.2 6.5 16 6.5C21.5 6.5 26 10.7 26 16C26 19.3 24.2 22.2 21.5 23.9L20.2 21.8C22.3 20.5 23.7 18.4 23.7 16C23.7 12 20.2 8.8 16 8.8C13.1 8.8 10.5 10.3 9.1 12.6L7 11.5Z" fill="white"/>
      <path d="M10.5 20.5C9.3 19.2 8.5 17.5 8.5 15.6C8.5 11.9 11.5 9 15.2 9C17.2 9 19 9.8 20.3 11.2L18.6 12.7C17.7 11.8 16.5 11.3 15.2 11.3C12.8 11.3 10.8 13.2 10.8 15.6C10.8 16.8 11.3 17.9 12.1 18.7L10.5 20.5Z" fill="white"/>
      <path d="M16 13C17.7 13 19.1 14 19.8 15.4L22 14.3C20.9 12.1 18.6 10.7 16 10.7C12.4 10.7 9.5 13.6 9.5 17.2C9.5 19.1 10.3 20.8 11.6 22L13.2 20.2C12.4 19.4 11.9 18.4 11.9 17.2C11.9 14.9 13.7 13 16 13Z" fill="white"/>
    </svg>
  )
}

type TestStatus = "idle" | "sending" | "ok" | "error"

export function ClientForwardingSettings({ client }: Props) {
  const router = useRouter()
  const [open, setOpen]               = useState(false)
  const [name, setName]               = useState(client.name)
  const [code, setCode]               = useState(client.code)
  const [description, setDescription] = useState(client.description || "")
  const [forwardUrl, setForwardUrl]   = useState(client.forwardUrl || "")
  const [crowdstrikeHecUrl, setCrowdstrikeHecUrl] = useState(client.crowdstrikeHecUrl || "")
  const [crowdstrikeApiKey, setCrowdstrikeApiKey] = useState(client.crowdstrikeApiKey || "")
  const [csExpanded, setCsExpanded]   = useState(!!(client.crowdstrikeHecUrl && client.crowdstrikeApiKey))
  const [saving, setSaving]           = useState(false)
  const [message, setMessage]         = useState<string | null>(null)
  const [testStatus, setTestStatus]   = useState<TestStatus>("idle")
  const [testError, setTestError]     = useState<string | null>(null)

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
      setMessage("Settings saved.")
    } catch {
      setMessage("Could not save client settings.")
    } finally {
      setSaving(false)
    }
  }

  async function sendTestEvent() {
    setTestStatus("sending")
    setTestError(null)
    try {
      const res = await apiFetch(`/api/clients/${encodeURIComponent(client.id)}/crowdstrike-test`, {
        method: "POST",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setTestStatus("ok")
      setTimeout(() => setTestStatus("idle"), 4000)
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Unknown error")
      setTestStatus("error")
      setTimeout(() => setTestStatus("idle"), 6000)
    }
  }

  const hasForwarding = !!client.forwardUrl
  const hasCrowdStrike = !!(client.crowdstrikeHecUrl && client.crowdstrikeApiKey)
  const csConfigured = !!(crowdstrikeHecUrl && crowdstrikeApiKey)

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
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
                    <CrowdStrikeLogo className="h-3 w-3" />
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

      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

          {/* CrowdStrike integration — collapsible */}
          <div className="rounded-xl border border-border/70 bg-muted/30 overflow-hidden">
            <button
              type="button"
              onClick={() => setCsExpanded(v => !v)}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
            >
              <CrowdStrikeLogo className="h-5 w-5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">CrowdStrike Next-Gen SIEM</p>
                  {csConfigured ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Not configured
                    </span>
                  )}
                </div>
              </div>
              {csExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>

            {csExpanded && (
              <div className="px-4 pb-4 space-y-3 border-t border-border/50">
                <div className="space-y-2 pt-3">
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

                {/* Test button */}
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!hasCrowdStrike || testStatus === "sending"}
                    onClick={sendTestEvent}
                    className="gap-2"
                  >
                    {testStatus === "sending" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FlaskConical className="h-3.5 w-3.5" />
                    )}
                    {testStatus === "sending" ? "Sending…" : "Send test event"}
                  </Button>
                  {testStatus === "ok" && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Event delivered
                    </span>
                  )}
                  {testStatus === "error" && (
                    <span className="flex items-center gap-1 text-xs text-red-400">
                      <XCircle className="h-3.5 w-3.5" />
                      {testError}
                    </span>
                  )}
                  {!hasCrowdStrike && testStatus === "idle" && (
                    <span className="text-xs text-muted-foreground">Save credentials first</span>
                  )}
                </div>
              </div>
            )}
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

"use client"

import { apiFetch, assertOk } from "@/lib/client-fetch"

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
    <svg className={className} viewBox="0 0 173 32" xmlns="http://www.w3.org/2000/svg" aria-label="CrowdStrike">
      <g fill="#fc0000">
        <g transform="translate(13 3.527)">
          <path d="m14.52 12.24v-0.307l-2.6-2.238h-0.303c-0.715 0.79-1.819 1.382-3.054 1.382-1.928 0-3.445-1.47-3.445-3.488s1.517-3.488 3.445-3.488c1.235 0 2.339 0.592 3.054 1.382h0.303l2.6-2.238v-0.307c-1.365-1.667-3.509-2.742-5.936-2.742-4.462 0-7.841 3.159-7.841 7.393 0 0.164 0.037 0.315 0.048 0.476 1.826 1.242 3.438 2.236 4.826 3.146 2.001 1.266 3.616 2.431 4.946 3.514 1.658-0.419 3.002-1.328 3.957-2.485m-12.15-0.079c1.042 1.28 2.513 2.198 4.248 2.59-1.172-0.659-2.307-1.306-3.364-2.022-0.31-0.192-0.586-0.378-0.884-0.568"/>
          <path d="m29.57 14.04-0.65-2.808-0.238-0.154c-0.13 0.066-0.238 0.154-0.563 0.154-0.499 0-0.802-0.527-1.062-0.943-0.433-0.659-0.78-1.01-1.083-1.163 1.581-0.702 2.643-2.018 2.643-3.905 0-2.918-1.993-4.761-5.697-4.761h-6.456v14.26h4.289v-5.002h0.39c0.953 0 2.167 2.062 2.73 2.984 1.17 1.865 2.101 2.281 3.769 2.281 0.78 0 1.43-0.285 1.82-0.636zm-5.329-8.578c0 0.944-0.693 1.404-1.495 1.404h-1.993v-2.896h1.993c0.802 0 1.495 0.527 1.495 1.492z"/>
          <path d="m46.14 7.594c0-4.234-3.379-7.393-7.863-7.393-4.485 0-7.864 3.159-7.864 7.393s3.379 7.393 7.864 7.393c4.484 0 7.863-3.181 7.863-7.393m-4.376 0c0 2.04-1.56 3.488-3.487 3.488-1.928 0-3.488-1.448-3.488-3.488s1.56-3.488 3.488-3.488c1.927 0 3.487 1.448 3.487 3.488"/>
        </g>
        <polygon points="68.7 3.991 66.03 11.84 63.5 3.991 59.4 3.991 59.21 4.32 64.45 18.25 67.05 18.25 70 10.48 72.96 18.25 75.56 18.25 80.81 4.32 80.61 3.991 76.52 3.991 73.98 11.89 71.3 3.991"/>
        <path d="m96.51 11.1c0-4.256-2.838-7.108-7.452-7.108h-6.564v14.26h6.564c4.614 0 7.452-2.852 7.452-7.152m-4.376 0.022c0 2.325-1.365 3.62-3.249 3.62h-2.102v-7.24h2.102c1.884 0 3.249 1.295 3.249 3.62"/>
        <polygon points="110.7 7.501 114.9 7.501 114.9 18.25 119.2 18.25 119.2 7.501 123.5 7.501 123.5 3.991 110.7 3.991"/>
        <path d="m137.2 8.751c0-2.918-1.993-4.761-5.697-4.761h-6.456v14.26h4.29v-5.002h1.018l2.664 5.002h4.268l0.195-0.329-2.86-5.287c1.538-0.724 2.578-2.018 2.578-3.883m-4.376 0.241c0 0.944-0.693 1.404-1.495 1.404h-1.992v-2.896h1.992c0.802 0 1.495 0.527 1.495 1.492"/>
        <polygon points="139.8 18.25 144.1 18.25 144.1 3.991 139.8 3.991"/>
        <polygon points="151.1 9.059 151.1 3.991 146.8 3.991 146.8 18.25 151.1 18.25 151.1 13.86 151.9 12.94 155.5 18.25 160 18.25 160.2 17.92 155 10.37 159.8 4.32 159.7 3.991 155.1 3.991"/>
        <polygon points="165.7 14.74 165.7 12.77 170.6 12.77 170.6 9.475 165.7 9.475 165.7 7.501 172.1 7.501 172.1 3.99 161.4 3.99 161.4 18.25 172.2 18.25 172.2 14.74"/>
        <g transform="translate(0 .5267)">
          <path d="m103.8 17.89c3.142 0 5.869-1.535 5.869-4.495 0-3.226-2.749-4.06-5.175-4.762-0.954-0.285-1.93-0.615-1.93-1.317 0-0.505 0.542-0.812 1.366-0.812 1.409 0 2.6 0.878 3.206 1.449h0.303l2.014-2.413v-0.307c-1.061-1.206-3.226-2.127-5.61-2.127-3.336 0-5.652 1.798-5.652 4.408 0 2.809 2.554 4.038 4.72 4.652 1.409 0.395 2.364 0.461 2.364 1.229 0 0.549-0.673 0.878-1.714 0.878-1.322 0-2.924-0.856-3.703-1.624h-0.303l-1.992 2.501v0.307c1.277 1.425 3.572 2.433 6.237 2.433"/>
          <path d="m29.82 31c-1.039-2.378-3.126-5.429-11.3-9.786-3.77-2.096-10.21-5.323-16-11.46 0.525 2.214 3.215 7.079 14.78 13.15 3.204 1.753 8.622 3.397 12.52 8.088"/>
          <path d="m29.3 26.93c-0.986-2.81-2.766-6.408-11.21-11.75-4.111-2.694-10.15-6.077-18.09-14.7 0.568 2.325 3.078 8.371 15.73 16.22 4.156 2.816 9.52 4.553 13.57 10.23"/>
        </g>
      </g>
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
      await assertOk(await apiFetch(`/api/clients/${encodeURIComponent(client.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, description, forwardUrl, crowdstrikeHecUrl, crowdstrikeApiKey }),
      }), "Could not save client settings")
      router.refresh()
      setMessage("Settings saved.")
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save client settings.")
    } finally {
      setSaving(false)
    }
  }

  async function sendTestEvent() {
    setTestStatus("sending")
    setTestError(null)
    try {
      await assertOk(await apiFetch(`/api/clients/${encodeURIComponent(client.id)}/crowdstrike-test`, {
        method: "POST",
      }))
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
  const csUnsaved = crowdstrikeHecUrl !== (client.crowdstrikeHecUrl || "") ||
    crowdstrikeApiKey !== (client.crowdstrikeApiKey || "")

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
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
                    <CrowdStrikeLogo className="h-2.5 w-auto" />
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
              <CrowdStrikeLogo className="h-4 w-auto shrink-0" />
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
                    disabled={!hasCrowdStrike || csUnsaved || testStatus === "sending"}
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
                  {(!hasCrowdStrike || csUnsaved) && testStatus === "idle" && (
                    <span className="text-xs text-muted-foreground">
                      {csUnsaved ? "Save credentials first" : "Enter credentials above to test"}
                    </span>
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

"use client"

import { apiFetch } from "@/lib/client-fetch"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Bell, Eye, EyeOff, CheckCircle, Loader2, Send, AlertTriangle } from "lucide-react"
import { SaveFeedback, CardHeader, type SaveStatus } from "./setting-card"

export function DiscordForm() {
  const [url, setUrl] = useState("")
  const [show, setShow] = useState(false)
  const [hasWebhook, setHasWebhook] = useState(false)
  const [status, setStatus] = useState<SaveStatus>("loading")
  const [error, setError] = useState("")
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState("")

  useEffect(() => {
    apiFetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setHasWebhook(d.hasDiscordWebhook)
        // Never pre-populate the URL field — the masked value would overwrite the real one on save
        setStatus("idle")
      })
      .catch(() => setStatus("idle"))
  }, [])

  async function save() {
    setStatus("saving")
    setError("")
    try {
      const body: Record<string, string> = {}
      // Only include the URL if the user actually typed something
      if (url.trim()) body.discordWebhookUrl = url.trim()
      const res = await apiFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      if (url.trim()) setHasWebhook(true)
      setStatus("saved")
      setTimeout(() => setStatus("idle"), 3000)
    } catch {
      setError("Could not save.")
      setStatus("error")
    }
  }

  async function sendTest() {
    setTesting(true)
    setTestError("")
    try {
      const res = await apiFetch("/api/alerts/test", { method: "POST" })
      if (res.status === 401 || res.status === 403) {
        setTestError("Admin role is required to send the test.")
      } else if (!res.ok) {
        setTestError("Failed to send the test.")
      }
    } catch {
      setTestError("Could not connect.")
    } finally {
      setTesting(false)
    }
  }

  function clear() {
    setUrl("")
    setHasWebhook(false)
    apiFetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordWebhookUrl: "" }),
    })
  }

  const badge = hasWebhook ? (
    <span className="flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
      <CheckCircle className="h-3 w-3" /> Configured
    </span>
  ) : undefined

  return (
    <div className="rounded-xl border border-border bg-card">
      <CardHeader
        icon={Bell}
        iconBg="bg-indigo-500/20"
        iconColor="text-indigo-400"
        title="Discord alerts"
        description="Real-time notifications of critical honeypot events"
        badge={badge}
      />

      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="discord-webhook">Webhook URL</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              {status === "loading" ? (
                <div className="flex h-10 items-center rounded-md border border-border bg-secondary px-3 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading...
                </div>
              ) : (
                <Input
                  id="discord-webhook"
                  type={show ? "text" : "password"}
                  placeholder={hasWebhook ? "Paste a new URL to replace the current webhook" : "https://discord.com/api/webhooks/..."}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  className="pr-10 font-mono text-sm"
                />
              )}
              {status !== "loading" && (
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
            <Button
              onClick={save}
              disabled={status === "saving" || status === "loading"}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {status === "saving"
                ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving</>
                : status === "saved"
                ? <><CheckCircle className="mr-1.5 h-3.5 w-3.5" />Saved</>
                : "Save"}
            </Button>
            {hasWebhook && <Button variant="outline" onClick={clear}>Clear</Button>}
          </div>
          <SaveFeedback status={status} error={error} />
          <p className="text-xs text-muted-foreground">
            Discord → channel → Edit → Integrations → Webhooks → New Webhook → Copy URL
          </p>
        </div>

        {hasWebhook && (
          <div className="flex flex-col gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={sendTest}
              disabled={testing}
              className="gap-2 self-start"
            >
              {testing
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending...</>
                : <><Send className="h-3.5 w-3.5" />Send test message</>}
            </Button>
            {testError && (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" />{testError}
              </p>
            )}
          </div>
        )}

        <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">When you'll receive alerts</p>
          <ul className="space-y-0.5">
            <li>🔓 <strong>Successful SSH login</strong> — an attacker authenticated successfully</li>
            <li>🚨 <strong>IP with abuse score ≥ 80%</strong> — detected when querying enrichment</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

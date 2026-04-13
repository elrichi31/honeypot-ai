"use client"

import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Server, Bell, Database, Shield, Sparkles, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from "lucide-react"

function OpenAiSettings() {
  const [key, setKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading")
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setHasKey(data.hasKey)
        setKey(data.hasKey ? data.openaiApiKey : "")
        setStatus("idle")
      })
      .catch(() => setStatus("idle"))
  }, [])

  async function save() {
    setStatus("saving")
    setError("")
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiApiKey: key }),
      })
      if (!res.ok) throw new Error("Failed to save")
      setHasKey(!!key.trim())
      setStatus("saved")
      setTimeout(() => setStatus("idle"), 3000)
    } catch {
      setError("Could not save. Is the server running?")
      setStatus("error")
    }
  }

  function clear() {
    setKey("")
    setHasKey(false)
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openaiApiKey: "" }),
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">AI Analysis</h3>
          <p className="text-sm text-muted-foreground">OpenAI key for session threat analysis</p>
        </div>
        {hasKey && (
          <span className="flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
            <CheckCircle className="h-3 w-3" /> Configured
          </span>
        )}
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="openai-key">OpenAI API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              {status === "loading" ? (
                <div className="flex h-10 items-center rounded-md border border-border bg-secondary px-3 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Loading...
                </div>
              ) : (
                <Input
                  id="openai-key"
                  type={showKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  className="pr-10 font-mono text-sm"
                />
              )}
              {status !== "loading" && (
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
            <Button
              onClick={save}
              disabled={status === "saving" || status === "loading"}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {status === "saving" ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving</>
              ) : status === "saved" ? (
                <><CheckCircle className="mr-1.5 h-3.5 w-3.5" /> Saved</>
              ) : (
                "Save"
              )}
            </Button>
            {hasKey && (
              <Button variant="outline" onClick={clear}>
                Clear
              </Button>
            )}
          </div>

          {status === "error" && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" /> {error}
            </p>
          )}
          {status === "saved" && (
            <p className="flex items-center gap-1 text-xs text-success">
              <CheckCircle className="h-3 w-3" /> API key saved successfully.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Get your key at{" "}
            <span className="font-mono text-foreground">platform.openai.com/api-keys</span>.
            The key is stored locally on the server and never sent to the browser in plain text.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">How it works</p>
          <p>
            Open any session from the Sessions view and click <strong>Analyze session</strong>.
            The dashboard sends the session data to GPT-4o mini and shows a threat assessment
            with threat level, attack type, intent, and recommendations.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="ml-60 flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure your honeypot monitoring preferences
          </p>
        </div>

        <div className="max-w-2xl space-y-6">
          {/* Connection Settings */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-1/20">
                <Server className="h-4 w-4 text-chart-1" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Connection</h3>
                <p className="text-sm text-muted-foreground">Honeypot server connection settings</p>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="api-url">API Endpoint</Label>
                <Input id="api-url" placeholder="http://localhost:3000" defaultValue="http://localhost:3000" />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-refresh</Label>
                  <p className="text-xs text-muted-foreground">Automatically refresh data every 30 seconds</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/20">
                <Bell className="h-4 w-4 text-warning" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Notifications</h3>
                <p className="text-sm text-muted-foreground">Alert preferences for honeypot events</p>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>New session alerts</Label>
                  <p className="text-xs text-muted-foreground">Get notified when a new session is detected</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Successful login alerts</Label>
                  <p className="text-xs text-muted-foreground">Get notified on successful authentication attempts</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Suspicious command alerts</Label>
                  <p className="text-xs text-muted-foreground">Get notified when suspicious commands are executed</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </div>

          {/* Data Retention */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-2/20">
                <Database className="h-4 w-4 text-chart-2" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Data Retention</h3>
                <p className="text-sm text-muted-foreground">Configure how long data is stored</p>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="retention">Retention Period (days)</Label>
                <Input id="retention" type="number" defaultValue="90" min={1} max={365} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Archive old data</Label>
                  <p className="text-xs text-muted-foreground">Move old data to archive storage</p>
                </div>
                <Switch />
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/20">
                <Shield className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Security</h3>
                <p className="text-sm text-muted-foreground">Security and access settings</p>
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Two-factor authentication</Label>
                  <p className="text-xs text-muted-foreground">Require 2FA for dashboard access</p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>IP Whitelisting</Label>
                  <p className="text-xs text-muted-foreground">Only allow access from specific IPs</p>
                </div>
                <Switch />
              </div>
            </div>
          </div>

          {/* AI — fully interactive */}
          <OpenAiSettings />
        </div>
      </main>
    </div>
  )
}

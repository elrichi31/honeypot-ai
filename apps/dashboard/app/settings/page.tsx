"use client"

import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Server, Bell, Database, Shield, Sparkles, Eye, EyeOff, CheckCircle, AlertCircle, Loader2, Network, Globe, Clock } from "lucide-react"

const TIMEZONE_GROUPS = [
  {
    label: "América",
    zones: [
      { value: "America/New_York",       label: "New York (UTC−5/−4)" },
      { value: "America/Chicago",        label: "Chicago (UTC−6/−5)" },
      { value: "America/Denver",         label: "Denver (UTC−7/−6)" },
      { value: "America/Los_Angeles",    label: "Los Ángeles (UTC−8/−7)" },
      { value: "America/Bogota",         label: "Bogotá (UTC−5)" },
      { value: "America/Lima",           label: "Lima (UTC−5)" },
      { value: "America/Guayaquil",      label: "Guayaquil (UTC−5)" },
      { value: "America/Caracas",        label: "Caracas (UTC−4)" },
      { value: "America/La_Paz",         label: "La Paz (UTC−4)" },
      { value: "America/Santiago",       label: "Santiago (UTC−4/−3)" },
      { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (UTC−3)" },
      { value: "America/Sao_Paulo",      label: "São Paulo (UTC−3/−2)" },
      { value: "America/Mexico_City",    label: "Ciudad de México (UTC−6/−5)" },
      { value: "America/Havana",         label: "La Habana (UTC−5/−4)" },
      { value: "America/Santo_Domingo",  label: "Santo Domingo (UTC−4)" },
      { value: "America/Anchorage",      label: "Anchorage (UTC−9/−8)" },
      { value: "Pacific/Honolulu",       label: "Honolulú (UTC−10)" },
    ],
  },
  {
    label: "Europa",
    zones: [
      { value: "UTC",                    label: "UTC" },
      { value: "Europe/London",          label: "Londres (UTC+0/+1)" },
      { value: "Europe/Madrid",          label: "Madrid (UTC+1/+2)" },
      { value: "Europe/Paris",           label: "París (UTC+1/+2)" },
      { value: "Europe/Berlin",          label: "Berlín (UTC+1/+2)" },
      { value: "Europe/Rome",            label: "Roma (UTC+1/+2)" },
      { value: "Europe/Amsterdam",       label: "Ámsterdam (UTC+1/+2)" },
      { value: "Europe/Moscow",          label: "Moscú (UTC+3)" },
    ],
  },
  {
    label: "Asia / Pacífico",
    zones: [
      { value: "Asia/Dubai",             label: "Dubái (UTC+4)" },
      { value: "Asia/Kolkata",           label: "India (UTC+5:30)" },
      { value: "Asia/Bangkok",           label: "Bangkok (UTC+7)" },
      { value: "Asia/Singapore",         label: "Singapur (UTC+8)" },
      { value: "Asia/Shanghai",          label: "Shanghái (UTC+8)" },
      { value: "Asia/Tokyo",             label: "Tokio (UTC+9)" },
      { value: "Australia/Sydney",       label: "Sídney (UTC+10/+11)" },
    ],
  },
  {
    label: "África",
    zones: [
      { value: "Africa/Cairo",           label: "El Cairo (UTC+2/+3)" },
      { value: "Africa/Johannesburg",    label: "Johannesburgo (UTC+2)" },
      { value: "Africa/Lagos",           label: "Lagos (UTC+1)" },
    ],
  },
]

function InfrastructureSettings() {
  const [form, setForm] = useState({
    honeypotIp: "",
    sshPort: "22",
    ingestPort: "8022",
    ingestApiUrl: "http://localhost:3000",
    timezone: "UTC",
  })
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading")
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setForm({
          honeypotIp: data.honeypotIp ?? "",
          sshPort: String(data.sshPort ?? 22),
          ingestPort: String(data.ingestPort ?? 8022),
          ingestApiUrl: data.ingestApiUrl ?? "http://localhost:3000",
          timezone: data.timezone ?? "UTC",
        })
        setStatus("idle")
      })
      .catch(() => setStatus("idle"))
  }, [])

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function save() {
    setStatus("saving")
    setError("")
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          honeypotIp: form.honeypotIp,
          sshPort: Number(form.sshPort),
          ingestPort: Number(form.ingestPort),
          ingestApiUrl: form.ingestApiUrl,
          timezone: form.timezone,
        }),
      })
      if (!res.ok) throw new Error()
      // Persist timezone in localStorage so TimezoneProvider picks it up
      // immediately on client-side navigation (without waiting for another fetch).
      localStorage.setItem("dashboard_tz", form.timezone)
      setStatus("saved")
      setTimeout(() => setStatus("idle"), 3000)
    } catch {
      setError("No se pudo guardar. ¿Está corriendo el servidor?")
      setStatus("error")
    }
  }

  const loading = status === "loading"

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-1/20">
          <Network className="h-4 w-4 text-chart-1" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">Infraestructura</h3>
          <p className="text-sm text-muted-foreground">IP y puertos del honeypot</p>
        </div>
      </div>

      <div className="space-y-5 p-4">
        {/* Honeypot IP */}
        <div className="space-y-2">
          <Label htmlFor="honeypot-ip">IP del Honeypot</Label>
          {loading ? (
            <Skeleton />
          ) : (
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="honeypot-ip"
                placeholder="ej. 192.168.1.100 o 203.0.113.5"
                value={form.honeypotIp}
                onChange={set("honeypotIp")}
                className="pl-9 font-mono text-sm"
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            IP pública o privada de la máquina donde corre el honeypot SSH.
          </p>
        </div>

        {/* Ports */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ssh-port">Puerto SSH (honeypot)</Label>
            {loading ? (
              <Skeleton />
            ) : (
              <Input
                id="ssh-port"
                type="number"
                min={1}
                max={65535}
                value={form.sshPort}
                onChange={set("sshPort")}
                className="font-mono text-sm"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Atacantes se conectan aquí. Por defecto <span className="font-mono">22</span>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ingest-port">Puerto Ingest (honeypot → backend)</Label>
            {loading ? (
              <Skeleton />
            ) : (
              <Input
                id="ingest-port"
                type="number"
                min={1}
                max={65535}
                value={form.ingestPort}
                onChange={set("ingestPort")}
                className="font-mono text-sm"
              />
            )}
            <p className="text-xs text-muted-foreground">
              Canal interno de envío de logs. Por defecto <span className="font-mono">8022</span>.
            </p>
          </div>
        </div>

        {/* Ingest API URL */}
        <div className="space-y-2">
          <Label htmlFor="ingest-api">URL del Ingest API</Label>
          {loading ? (
            <Skeleton />
          ) : (
            <Input
              id="ingest-api"
              placeholder="http://localhost:3000"
              value={form.ingestApiUrl}
              onChange={set("ingestApiUrl")}
              className="font-mono text-sm"
            />
          )}
          <p className="text-xs text-muted-foreground">
            Endpoint del backend que el dashboard consulta para obtener sesiones y eventos.
          </p>
        </div>

        {/* Timezone */}
        <div className="space-y-2">
          <Label>Zona horaria</Label>
          {loading ? (
            <Skeleton />
          ) : (
            <Select value={form.timezone} onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}>
              <SelectTrigger className="w-full font-mono text-sm">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Selecciona una zona horaria" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.zones.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value} className="font-mono text-sm">
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="text-xs text-muted-foreground">
            Zona horaria usada en las gráficas de actividad del dashboard.
          </p>
        </div>

        {/* Summary card */}
        {!loading && (form.honeypotIp || form.sshPort || form.ingestPort) && (
          <div className="rounded-lg border border-border bg-secondary/50 p-3 font-mono text-xs space-y-1">
            {form.honeypotIp && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-28">Honeypot IP</span>
                <span className="text-foreground">{form.honeypotIp}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-28">SSH (atacantes)</span>
              <span className="text-foreground">{form.honeypotIp || "<ip>"}:{form.sshPort}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-28">Ingest API</span>
              <span className="text-foreground">{form.ingestApiUrl}</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button
            onClick={save}
            disabled={status === "saving" || loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {status === "saving" ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Guardando</>
            ) : status === "saved" ? (
              <><CheckCircle className="mr-1.5 h-3.5 w-3.5" /> Guardado</>
            ) : (
              "Guardar"
            )}
          </Button>
          {status === "error" && (
            <p className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" /> {error}
            </p>
          )}
          {status === "saved" && (
            <p className="flex items-center gap-1 text-xs text-success">
              <CheckCircle className="h-3 w-3" /> Configuración guardada.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Skeleton() {
  return <div className="h-10 w-full animate-pulse rounded-md bg-secondary" />
}

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
          {/* Infrastructure — fully interactive */}
          <InfrastructureSettings />

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

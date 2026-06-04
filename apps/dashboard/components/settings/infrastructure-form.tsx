"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Network, Globe, Clock, Wand2, PenLine, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { TIMEZONE_GROUPS } from "@/lib/timezones"
import { Skeleton, SaveButton, SaveFeedback, CardHeader, type SaveStatus } from "./setting-card"

type IngestMode = "auto" | "manual"

type FormState = {
  honeypotIp: string
  sshPort: string
  ingestPort: string
  ingestApiUrl: string
  timezone: string
  ingestMode: IngestMode
}

type OvaConfig = { ingestUrl: string; ip: string; port: string; source: string }

const SOURCE_LABEL: Record<string, string> = {
  "settings":            "URL configurada en Settings",
  "SENSOR_INGEST_URL":   "Variable SENSOR_INGEST_URL",
  "NEXT_PUBLIC_API_URL": "Variable NEXT_PUBLIC_API_URL",
  "auto-detected":       "IP pública auto-detectada",
}

export function InfrastructureForm() {
  const [form, setForm] = useState<FormState>({
    honeypotIp: "", sshPort: "22", ingestPort: "8022",
    ingestApiUrl: "", timezone: "UTC", ingestMode: "auto",
  })
  const [status, setStatus] = useState<SaveStatus>("loading")
  const [error, setError] = useState("")

  const [ovaConfig, setOvaConfig] = useState<OvaConfig | null>(null)
  const [ovaLoading, setOvaLoading] = useState(false)
  const [ovaError, setOvaError] = useState<string | null>(null)

  function loadOvaConfig() {
    setOvaLoading(true)
    setOvaError(null)
    fetch("/api/ova/config")
      .then((r) => r.json())
      .then((d: OvaConfig & { error?: string }) => {
        if (d.error) setOvaError(d.error)
        else setOvaConfig(d)
      })
      .catch(() => setOvaError("No se pudo detectar la IP pública"))
      .finally(() => setOvaLoading(false))
  }

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        const hasManualUrl = !!data.ingestApiUrl &&
          !data.ingestApiUrl.includes("localhost") &&
          !data.ingestApiUrl.includes("ingest-api")
        setForm({
          honeypotIp: data.honeypotIp ?? "",
          sshPort: String(data.sshPort ?? 22),
          ingestPort: String(data.ingestPort ?? 8022),
          ingestApiUrl: data.ingestApiUrl ?? "",
          timezone: data.timezone ?? "UTC",
          ingestMode: hasManualUrl ? "manual" : "auto",
        })
        setStatus("idle")
      })
      .catch(() => setStatus("idle"))

    loadOvaConfig()
  }, [])

  function field(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
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
          ingestApiUrl: form.ingestMode === "manual" ? form.ingestApiUrl : "",
          timezone: form.timezone,
        }),
      })
      if (!res.ok) throw new Error()
      localStorage.setItem("dashboard_tz", form.timezone)
      setStatus("saved")
      setTimeout(() => setStatus("idle"), 3000)
    } catch {
      setError("No se pudo guardar. ¿Está corriendo el servidor?")
      setStatus("error")
    }
  }

  const loading = status === "loading"
  const effectiveIngestUrl = form.ingestMode === "manual" ? form.ingestApiUrl : (ovaConfig?.ingestUrl ?? "")

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card">
      <CardHeader icon={Network} iconBg="bg-chart-1/20" iconColor="text-chart-1" title="Infraestructura" description="IP, puertos y URL de ingest del honeypot" />

      <div className="space-y-5 p-4">
        {/* Honeypot IP */}
        <div className="space-y-2">
          <Label htmlFor="honeypot-ip">IP del Honeypot</Label>
          {loading ? <Skeleton /> : (
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="honeypot-ip"
                placeholder="ej. 192.168.1.100"
                value={form.honeypotIp}
                onChange={field("honeypotIp")}
                className="pl-9 font-mono text-sm"
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">IP pública de la máquina donde corre el honeypot SSH.</p>
        </div>

        {/* Ports */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ssh-port">Puerto SSH</Label>
            {loading ? <Skeleton /> : (
              <Input id="ssh-port" type="number" min={1} max={65535} value={form.sshPort} onChange={field("sshPort")} className="font-mono text-sm" />
            )}
            <p className="text-xs text-muted-foreground">Por defecto <span className="font-mono">22</span>.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ingest-port">Puerto Ingest</Label>
            {loading ? <Skeleton /> : (
              <Input id="ingest-port" type="number" min={1} max={65535} value={form.ingestPort} onChange={field("ingestPort")} className="font-mono text-sm" />
            )}
            <p className="text-xs text-muted-foreground">Por defecto <span className="font-mono">8022</span>.</p>
          </div>
        </div>

        {/* Timezone */}
        <div className="space-y-2">
          <Label>Zona horaria</Label>
          {loading ? <Skeleton /> : (
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
                      <SelectItem key={tz.value} value={tz.value} className="font-mono text-sm">{tz.label}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Ingest API URL — auto vs manual */}
        <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">URL del Ingest API</Label>
            {!loading && (
              <div className="flex rounded-md border border-border overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, ingestMode: "auto" }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                    form.ingestMode === "auto"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Wand2 className="h-3 w-3" />
                  Auto-detectar
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, ingestMode: "manual" }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors border-l border-border ${
                    form.ingestMode === "manual"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <PenLine className="h-3 w-3" />
                  Manual
                </button>
              </div>
            )}
          </div>

          {loading ? <Skeleton /> : form.ingestMode === "auto" ? (
            <div className="space-y-2">
              {ovaLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Detectando IP pública…
                </div>
              )}
              {ovaError && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{ovaError} — puedes usar modo Manual o definir <code className="font-mono">SENSOR_INGEST_URL</code> en tu .env</span>
                </div>
              )}
              {ovaConfig && (
                <div className="rounded-md border border-border divide-y divide-border">
                  <InfoRow label="Ingest URL" value={ovaConfig.ingestUrl} mono />
                  <InfoRow label="IP pública" value={ovaConfig.ip} mono />
                  <InfoRow label="Puerto" value={ovaConfig.port} mono />
                  <InfoRow
                    label="Fuente"
                    value={
                      <span className="flex items-center gap-1 text-emerald-400 text-xs">
                        <CheckCircle2 className="h-3 w-3" />
                        {SOURCE_LABEL[ovaConfig.source] ?? ovaConfig.source}
                      </span>
                    }
                  />
                </div>
              )}
              <button
                type="button"
                onClick={loadOvaConfig}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                Redetectar
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Input
                id="ingest-api"
                placeholder="http://173.249.48.182:3000"
                value={form.ingestApiUrl}
                onChange={field("ingestApiUrl")}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">URL pública que los sensores remotos usan para conectarse al ingest API.</p>
            </div>
          )}
        </div>

        {/* Summary */}
        {!loading && (form.honeypotIp || form.sshPort) && (
          <div className="rounded-lg border border-border bg-secondary/50 p-3 font-mono text-xs space-y-1">
            {form.honeypotIp && (
              <div className="flex gap-2"><span className="w-28 text-muted-foreground">Honeypot IP</span><span>{form.honeypotIp}</span></div>
            )}
            <div className="flex gap-2"><span className="w-28 text-muted-foreground">SSH</span><span>{form.honeypotIp || "<ip>"}:{form.sshPort}</span></div>
            {effectiveIngestUrl && (
              <div className="flex gap-2"><span className="w-28 text-muted-foreground">Ingest API</span><span className="truncate">{effectiveIngestUrl}</span></div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <SaveButton status={status} loading={loading} />
          <SaveFeedback status={status} error={error} />
        </div>
      </div>
    </form>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      {mono
        ? <code className="font-mono text-xs text-foreground truncate">{value as string}</code>
        : <div className="text-right">{value}</div>
      }
    </div>
  )
}

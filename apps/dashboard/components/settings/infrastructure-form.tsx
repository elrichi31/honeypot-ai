"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Network, Globe, Clock } from "lucide-react"
import { TIMEZONE_GROUPS } from "@/lib/timezones"
import { Skeleton, SaveButton, SaveFeedback, CardHeader, type SaveStatus } from "./setting-card"

type FormState = {
  honeypotIp: string
  sshPort: string
  ingestPort: string
  ingestApiUrl: string
  timezone: string
}

export function InfrastructureForm() {
  const [form, setForm] = useState<FormState>({
    honeypotIp: "", sshPort: "22", ingestPort: "8022",
    ingestApiUrl: "http://localhost:3000", timezone: "UTC",
  })
  const [status, setStatus] = useState<SaveStatus>("loading")
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
          ingestApiUrl: form.ingestApiUrl,
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

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card">
      <CardHeader icon={Network} iconBg="bg-chart-1/20" iconColor="text-chart-1" title="Infraestructura" description="IP y puertos del honeypot" />

      <div className="space-y-5 p-4">
        <div className="space-y-2">
          <Label htmlFor="honeypot-ip">IP del Honeypot</Label>
          {loading ? <Skeleton /> : (
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="honeypot-ip" placeholder="ej. 192.168.1.100" value={form.honeypotIp} onChange={field("honeypotIp")} className="pl-9 font-mono text-sm" />
            </div>
          )}
          <p className="text-xs text-muted-foreground">IP pública o privada de la máquina donde corre el honeypot SSH.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ssh-port">Puerto SSH</Label>
            {loading ? <Skeleton /> : <Input id="ssh-port" type="number" min={1} max={65535} value={form.sshPort} onChange={field("sshPort")} className="font-mono text-sm" />}
            <p className="text-xs text-muted-foreground">Por defecto <span className="font-mono">22</span>.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ingest-port">Puerto Ingest</Label>
            {loading ? <Skeleton /> : <Input id="ingest-port" type="number" min={1} max={65535} value={form.ingestPort} onChange={field("ingestPort")} className="font-mono text-sm" />}
            <p className="text-xs text-muted-foreground">Por defecto <span className="font-mono">8022</span>.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ingest-api">URL del Ingest API</Label>
          {loading ? <Skeleton /> : <Input id="ingest-api" placeholder="http://localhost:3000" value={form.ingestApiUrl} onChange={field("ingestApiUrl")} className="font-mono text-sm" />}
        </div>

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

        {!loading && (form.honeypotIp || form.sshPort) && (
          <div className="rounded-lg border border-border bg-secondary/50 p-3 font-mono text-xs space-y-1">
            {form.honeypotIp && (
              <div className="flex gap-2"><span className="w-28 text-muted-foreground">Honeypot IP</span><span>{form.honeypotIp}</span></div>
            )}
            <div className="flex gap-2"><span className="w-28 text-muted-foreground">SSH</span><span>{form.honeypotIp || "<ip>"}:{form.sshPort}</span></div>
            <div className="flex gap-2"><span className="w-28 text-muted-foreground">Ingest API</span><span>{form.ingestApiUrl}</span></div>
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

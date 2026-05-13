"use client"

import { useEffect, useState } from "react"
import { AlertCircle, Box, CheckCircle2, Download, HardDrive, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { Client } from "@/lib/api"

type ServiceKey = "ssh" | "http" | "ftp" | "mysql" | "port"

const SERVICES: { key: ServiceKey; label: string; description: string; ports: string }[] = [
  { key: "ssh",   label: "SSH Honeypot",   description: "Cowrie — captura brute-force SSH",            ports: "22, 2222" },
  { key: "http",  label: "Web Honeypot",   description: "HTTP/HTTPS — fake login pages y admin panels", ports: "80, 8443" },
  { key: "ftp",   label: "FTP Honeypot",   description: "Captura credenciales FTP",                     ports: "21" },
  { key: "mysql", label: "MySQL Honeypot", description: "Captura intentos de conexión MySQL",           ports: "3306" },
  { key: "port",  label: "Port Honeypot",  description: "RDP, Redis, MongoDB, Docker, Elastic…",       ports: "múltiples" },
]

type OvaConfig = { ingestUrl: string; ip: string; port: string; source: string }

type Props = { client: Client }

export function ClientOVADownload({ client }: Props) {
  const [open, setOpen]           = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [selected, setSelected]   = useState<Set<ServiceKey>>(new Set(["ssh", "http", "ftp", "mysql", "port"]))
  const [config, setConfig]       = useState<OvaConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [configLoading, setConfigLoading] = useState(false)

  // Fetch server config whenever dialog opens
  useEffect(() => {
    if (!open) return
    setConfigLoading(true)
    setConfigError(null)
    fetch("/api/ova/config")
      .then(r => r.json())
      .then((data: OvaConfig & { error?: string }) => {
        if (data.error) setConfigError(data.error)
        else setConfig(data)
      })
      .catch(() => setConfigError("No se pudo obtener la configuración del servidor"))
      .finally(() => setConfigLoading(false))
  }, [open])

  function toggleService(key: ServiceKey) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function downloadOVA() {
    if (selected.size === 0 || loading) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/clients/${client.id}/ova`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: Array.from(selected) }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error || `Error ${res.status}`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `honeypot-sensor-${client.slug}.ova`
      a.click()
      URL.revokeObjectURL(url)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(val: boolean) {
    if (loading) return
    setOpen(val)
    if (!val) { setError(null); setConfig(null) }
  }

  const sourceLabel: Record<string, string> = {
    "SENSOR_INGEST_URL":   "variable SENSOR_INGEST_URL",
    "NEXT_PUBLIC_API_URL": "variable NEXT_PUBLIC_API_URL",
    "auto-detected":       "IP pública auto-detectada",
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <HardDrive className="h-3.5 w-3.5" />
          Download OVA Package
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Box className="h-5 w-5 text-violet-400" />
            OVA Sensor Package — {client.name}
          </DialogTitle>
          <DialogDescription>
            Selecciona los honeypots a activar. El OVA generado ya tiene el token embebido — solo importa en VMware y arranca.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">

          {/* Server config preview */}
          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Configuración del servidor</p>

            {configLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Detectando IP pública…
              </div>
            )}

            {configError && (
              <div className="flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{configError}</span>
              </div>
            )}

            {config && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Ingest URL</span>
                  <code className="font-mono text-xs text-foreground">{config.ingestUrl}</code>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">IP pública</span>
                  <code className="font-mono text-xs text-foreground">{config.ip}</code>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Puerto</span>
                  <code className="font-mono text-xs text-foreground">{config.port}</code>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Fuente</span>
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    {sourceLabel[config.source] ?? config.source}
                  </span>
                </div>
                {config.source === "auto-detected" && (
                  <p className="text-[11px] text-amber-400/80 pt-0.5">
                    Asegúrate de que el puerto {config.port} esté abierto en el firewall del servidor.
                  </p>
                )}
              </div>
            )}

            {config && (
              <button
                onClick={() => { setConfig(null); setConfigLoading(true); fetch("/api/ova/config").then(r=>r.json()).then((d: OvaConfig & {error?:string})=>{ if(d.error) setConfigError(d.error); else setConfig(d) }).catch(()=>setConfigError("Error")).finally(()=>setConfigLoading(false)) }}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className="h-3 w-3" /> Redetectar
              </button>
            )}
          </div>

          {/* Service selector */}
          <div className="space-y-2">
            {SERVICES.map(s => (
              <label
                key={s.key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  selected.has(s.key)
                    ? "border-violet-400/40 bg-violet-400/5"
                    : "border-border bg-muted/20 opacity-60"
                }`}
              >
                <Checkbox
                  checked={selected.has(s.key)}
                  onCheckedChange={() => toggleService(s.key)}
                  className="mt-0.5 shrink-0"
                  disabled={loading}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{s.label}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{s.ports}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </div>
              </label>
            ))}
          </div>

          {selected.size === 0 && (
            <p className="text-xs text-destructive">Selecciona al menos un servicio.</p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="border-t border-border" />

          <Button
            onClick={downloadOVA}
            disabled={loading || selected.size === 0 || !!configError || configLoading}
            className="w-full gap-2"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando OVA…</>
              : <><Download className="h-4 w-4" /> Descargar OVA con token embebido</>}
          </Button>

          {loading && (
            <p className="text-center text-xs text-muted-foreground">
              Esto puede tardar unos segundos en la primera descarga mientras se prepara el disco base.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useState } from "react"
import { Box, Check, Copy, Download, HardDrive, RefreshCw } from "lucide-react"
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
  { key: "ssh",   label: "SSH Honeypot",    description: "Cowrie — captura brute-force SSH",           ports: "22, 2222" },
  { key: "http",  label: "Web Honeypot",    description: "HTTP/HTTPS — fake login pages y admin panels", ports: "80, 8443" },
  { key: "ftp",   label: "FTP Honeypot",    description: "Captura credenciales FTP",                    ports: "21" },
  { key: "mysql", label: "MySQL Honeypot",  description: "Captura intentos de conexión MySQL",          ports: "3306" },
  { key: "port",  label: "Port Honeypot",   description: "RDP, Redis, MongoDB, Docker, Elastic…",      ports: "múltiples" },
]

type Props = { client: Client }

type TokenResult = { token: string; expiresAt: string; services: ServiceKey[] }

export function ClientOVADownload({ client }: Props) {
  const [open, setOpen]               = useState(false)
  const [loading, setLoading]         = useState(false)
  const [result, setResult]           = useState<TokenResult | null>(null)
  const [copied, setCopied]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [selected, setSelected]       = useState<Set<ServiceKey>>(new Set(["ssh", "http", "ftp", "mysql", "port"]))

  function toggleService(key: ServiceKey) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function generateToken() {
    if (selected.size === 0) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/sensor/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, services: Array.from(selected) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || "Failed to generate token")
      }
      setResult(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  function copyToken() {
    if (!result) return
    navigator.clipboard.writeText(result.token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadProvisionFile() {
    if (!result) return
    const ingestUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://YOUR_SERVER_IP:3000"
    const lines = [
      `# Sensor Provision File — ${client.name}`,
      `# Generated: ${new Date().toISOString()}`,
      `# Expires: ${new Date(result.expiresAt).toISOString()}`,
      `# Services: ${result.services.join(", ")}`,
      ``,
      `PROVISION_TOKEN=${result.token}`,
      `INGEST_API_URL=${ingestUrl}`,
    ].join("\n")

    const blob = new Blob([lines], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `sensor-provision-${client.slug}.env`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) { setResult(null); setError(null) }
  }

  const expiresLabel = result
    ? new Date(result.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null

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
            Selecciona qué honeypots activar en esta VM. Solo los servicios seleccionados van a correr.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">

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

          <div className="border-t border-border" />

          {!result && (
            <Button onClick={generateToken} disabled={loading || selected.size === 0} className="w-full gap-2">
              {loading
                ? <RefreshCw className="h-4 w-4 animate-spin" />
                : <HardDrive className="h-4 w-4" />}
              {loading ? "Generando…" : "Generar Token de Provisioning"}
            </Button>
          )}

          {error && (
            <p className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
          )}

          {result && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Provision Token</p>
                  <span className="text-[10px] text-muted-foreground">Expira {expiresLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-background/60 px-2 py-1 font-mono text-xs text-foreground">
                    {result.token}
                  </code>
                  <button
                    onClick={copyToken}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Copiar token"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={downloadProvisionFile} className="flex-1 gap-2">
                  <Download className="h-4 w-4" />
                  Descargar sensor-provision.env
                </Button>
                <Button variant="outline" onClick={generateToken} disabled={loading} className="px-3" title="Regenerar token">
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                <code className="font-mono">scp sensor-provision.env admin@&lt;vm-ip&gt;:/opt/sensor/</code>
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

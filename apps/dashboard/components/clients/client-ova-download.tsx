"use client"

import { useState } from "react"
import { Box, Check, Copy, Download, HardDrive, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { Client } from "@/lib/api"

type Props = {
  client: Client
}

type TokenResult = {
  token: string
  expiresAt: string
}

export function ClientOVADownload({ client }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TokenResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generateToken() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/sensor/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || "Failed to generate token")
      }
      const data: TokenResult = await res.json()
      setResult(data)
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
    const ingestUrl = (window as Window & { __NEXT_PUBLIC_API_URL__?: string }).__NEXT_PUBLIC_API_URL__ ?? ""
    const lines = [
      `# Sensor Provision File — ${client.name}`,
      `# Generated: ${new Date().toISOString()}`,
      `# Expires: ${new Date(result.expiresAt).toISOString()}`,
      `#`,
      `# Copy this file to your sensor VM and run:`,
      `#   sudo cp sensor-provision.env /opt/sensor/sensor-provision.env`,
      ``,
      `PROVISION_TOKEN=${result.token}`,
      `INGEST_API_URL=${ingestUrl || "http://YOUR_SERVER_IP:3000"}`,
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
    if (!val) {
      setResult(null)
      setError(null)
    }
  }

  const expiresLabel = result
    ? new Date(result.expiresAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
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
            OVA Sensor Package
          </DialogTitle>
          <DialogDescription>
            Generate a provisioning token for <span className="font-medium text-foreground">{client.name}</span>.
            The sensor VM uses it on first boot to auto-configure itself.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Steps */}
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-400/10 text-[11px] font-semibold text-violet-400">1</span>
              Generate a token below (valid 7 days)
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-400/10 text-[11px] font-semibold text-violet-400">2</span>
              Download the base OVA and import it in VirtualBox / VMware
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-400/10 text-[11px] font-semibold text-violet-400">3</span>
              Copy <span className="font-mono text-xs">sensor-provision.env</span> to the VM — it auto-configures on next boot
            </li>
          </ol>

          <div className="border-t border-border" />

          {!result && (
            <Button onClick={generateToken} disabled={loading} className="w-full gap-2">
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <HardDrive className="h-4 w-4" />
              )}
              {loading ? "Generating…" : "Generate Provisioning Token"}
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
                  <span className="text-[10px] text-muted-foreground">Expires {expiresLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-background/60 px-2 py-1 font-mono text-xs text-foreground">
                    {result.token}
                  </code>
                  <button
                    onClick={copyToken}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy token"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={downloadProvisionFile} className="flex-1 gap-2">
                  <Download className="h-4 w-4" />
                  Download sensor-provision.env
                </Button>
                <Button variant="outline" onClick={generateToken} disabled={loading} className="gap-2 px-3" title="Generate a new token">
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                SCP the file to the VM:{" "}
                <code className="font-mono">scp sensor-provision.env admin@&lt;vm-ip&gt;:/opt/sensor/</code>
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

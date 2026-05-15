"use client"

import { useState } from "react"
import { Download, HardDrive, Container, Plus, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type OvaConfig = { ingestUrl: string; ip: string; port: string; ovaUrl?: string | null }

export function AddSensorButton() {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState<OvaConfig | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [downloadingCompose, setDownloadingCompose] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen)
    if (isOpen && !config) {
      setLoadingConfig(true)
      setConfigError(null)
      fetch("/api/ova/config")
        .then((r) => r.json())
        .then((d: OvaConfig & { error?: string }) => {
          if (d.error) setConfigError(d.error)
          else setConfig(d)
        })
        .catch(() => setConfigError("Could not load server config"))
        .finally(() => setLoadingConfig(false))
    }
  }

  async function downloadCompose() {
    setDownloadingCompose(true)
    setComposeError(null)
    try {
      const res = await fetch("/api/sensor/compose")
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Failed to generate compose")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "docker-compose.sensor.yml"
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : "Download failed")
    } finally {
      setDownloadingCompose(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add sensor
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Deploy a sensor</DialogTitle>
        </DialogHeader>

        {loadingConfig && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Detecting server config…
          </div>
        )}

        {configError && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {configError}
          </div>
        )}

        {!loadingConfig && (
          <div className="grid grid-cols-2 gap-3">
            {/* OVA */}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-violet-400/20 p-2">
                  <HardDrive className="h-4 w-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">OVA</p>
                  <p className="text-xs text-muted-foreground">Virtual machine</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Import into VirtualBox or VMware. The sensor connects automatically on first boot.
              </p>

              {config && (
                <div className="rounded-lg bg-muted/50 px-2.5 py-2 text-xs font-mono text-muted-foreground truncate">
                  {config.ingestUrl}
                </div>
              )}

              <div className="mt-auto">
                {config?.ovaUrl ? (
                  <a href={config.ovaUrl} download>
                    <Button size="sm" className="w-full gap-1.5">
                      <Download className="h-3.5 w-3.5" />
                      Download OVA
                    </Button>
                  </a>
                ) : (
                  <Button size="sm" className="w-full" disabled variant="outline">
                    Not configured
                  </Button>
                )}
              </div>
            </div>

            {/* Docker Compose */}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-cyan-400/20 p-2">
                  <Container className="h-4 w-4 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Docker Compose</p>
                  <p className="text-xs text-muted-foreground">Any Linux VPS</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Clone the repo, drop the file in the root and run{" "}
                <code className="font-mono">docker compose -f docker-compose.sensor.yml up -d</code>.
                IP auto-detected.
              </p>

              {config && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono truncate">{config.ingestUrl}</span>
                </div>
              )}

              {composeError && (
                <p className="text-xs text-destructive">{composeError}</p>
              )}

              <div className="mt-auto">
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={downloadCompose}
                  disabled={downloadingCompose || !!configError}
                >
                  {downloadingCompose ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download compose
                </Button>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          The sensor registers itself in{" "}
          <span className="font-medium text-foreground">/sensors</span> within a minute of starting.
        </p>
      </DialogContent>
    </Dialog>
  )
}

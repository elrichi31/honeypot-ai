"use client"

import { useState } from "react"
import { Download, HardDrive, Terminal, Plus, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
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
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

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

  async function download(endpoint: string, filename: string) {
    setDownloading(true)
    setDownloadError(null)
    try {
      const res = await fetch(endpoint)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Download failed")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "Download failed")
    } finally {
      setDownloading(false)
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
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
                Import into VirtualBox or VMware. The sensor auto-provisions on first boot — no
                config needed.
              </p>

              {config && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono truncate">{config.ingestUrl}</span>
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

            {/* Installer script */}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-cyan-400/20 p-2">
                  <Terminal className="h-4 w-4 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Installer</p>
                  <p className="text-xs text-muted-foreground">Any Linux VPS</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Download the script, copy it to any Linux machine and run{" "}
                <code className="font-mono">bash install-sensor.sh</code>. Installs Docker,
                pulls images and starts all honeypots. IP auto-detected.
              </p>

              {config && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-mono truncate">{config.ingestUrl}</span>
                </div>
              )}

              {downloadError && <p className="text-xs text-destructive">{downloadError}</p>}

              <div className="mt-auto">
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => download("/api/sensor/install", "install-sensor.sh")}
                  disabled={downloading || !!configError}
                >
                  {downloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download installer
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

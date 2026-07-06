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
import { Surface } from "@/components/ui/surface"
import type { ServiceKey } from "@/app/api/sensor/install/route"
import { useT } from "@/components/locale-provider"

type OvaConfig = { ingestUrl: string; ip: string; port: string; ovaUrl?: string | null }

const SENSOR_OPTIONS: { key: ServiceKey; label: string; ports: string; group?: string }[] = [
  { key: "ssh",   label: "SSH (Cowrie)",  ports: ":22"             },
  { key: "http",  label: "HTTP",          ports: ":80 :8443"       },
  { key: "ftp",   label: "FTP",           ports: ":21"             },
  { key: "mysql", label: "MySQL",         ports: ":3306"           },
  { key: "port",  label: "Port scanner",  ports: ":1433 :6379 …"  },
  { key: "deception", label: "Deception (OpenCanary)", ports: "internal 10.0.1.0/24" },
  { key: "internal-canary", label: "Internal Canary", ports: "LAN · SSH + SMB + DB + HTTP", group: "internal" },
]

export function AddSensorButton() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState<OvaConfig | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ServiceKey[]>(["ssh", "http", "ftp", "mysql", "port"])
  const isInternalCanary = selected.includes("internal-canary")
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  function handleOpen(isOpen: boolean) {
    setOpen(isOpen)
    // Gated by `!config`: once the fetch resolves into `config`, re-opening
    // never re-triggers it, so there's no competing-request race to guard here.
    if (isOpen && !config) {
      setLoadingConfig(true)
      setConfigError(null)
      fetch("/api/ova/config")
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json() as Promise<OvaConfig & { error?: string }>
        })
        .then((d) => {
          if (d.error) setConfigError(d.error)
          else setConfig(d)
          setLoadingConfig(false)
        })
        .catch(() => {
          setConfigError(t("sensors.config.loadError"))
          setLoadingConfig(false)
        })
    }
  }

  function toggleService(key: ServiceKey) {
    setSelected((prev) => {
      // Internal canary is standalone — selecting it deselects everything else
      // and vice versa: selecting any other service deselects internal-canary.
      if (key === "internal-canary") {
        return prev.includes(key) ? ["ssh", "http", "ftp", "mysql", "port"] : ["internal-canary"]
      }
      const next = prev.filter((k) => k !== "internal-canary")
      const toggled = next.includes(key) ? next.filter((k) => k !== key) : [...next, key]
      // Deception needs cowrie as its entry point: turning it on forces ssh on.
      if (key === "deception" && toggled.includes("deception") && !toggled.includes("ssh")) {
        toggled.push("ssh")
      }
      return toggled
    })
  }

  async function downloadInstaller() {
    if (selected.length === 0) return
    setDownloading(true)
    setDownloadError(null)
    try {
      const params = new URLSearchParams({ services: selected.join(",") })
      const res = await fetch(`/api/sensor/install?${params}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Download failed")
      }
      const disposition = res.headers.get("Content-Disposition") ?? ""
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? "install-sensor.sh"
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
          {t("sensors.add.button")}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sensors.add.title")}</DialogTitle>
        </DialogHeader>

        {loadingConfig && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("sensors.add.detectingConfig")}
          </div>
        )}

        {configError && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            {configError}
          </div>
        )}

        {!loadingConfig && (
          <>
            {/* Sensor selector */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("sensors.add.selectSensors")}
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {SENSOR_OPTIONS.map(({ key, label, ports }) => {
                  const active = selected.includes(key)
                  return (
                    <button
                      key={key}
                      onClick={() => toggleService(key)}
                      className={[
                        "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors",
                        active
                          ? "border-cyan-400/40 bg-cyan-400/10 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-accent",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={[
                            "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                            active ? "border-cyan-400 bg-cyan-400" : "border-muted-foreground/40",
                          ].join(" ")}
                        >
                          {active && (
                            <svg className="h-2.5 w-2.5 text-black" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                      <span className="font-mono text-xs opacity-60">{ports}</span>
                    </button>
                  )
                })}
              </div>
              {selected.includes("deception") && (
                <p className="rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
                  {t("sensors.add.deceptionWarning")}
                </p>
              )}
              {isInternalCanary && (
                <p className="rounded-lg bg-violet-400/10 px-3 py-2 text-xs text-violet-300">
                  Internal Canary deploys inside the corporate LAN on a dedicated VM. Set <span className="font-mono">HTTPS_PROXY</span> if the VM has no direct internet access.
                </p>
              )}
            </div>

            {/* Deploy options */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              {/* OVA */}
              <Surface padded className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-violet-400/20 p-2">
                    <HardDrive className="h-4 w-4 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t("sensors.add.ova.title")}</p>
                    <p className="text-xs text-muted-foreground">{t("sensors.add.ova.subtitle")}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("sensors.add.ova.description")}
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
                        {t("sensors.add.ova.download")}
                      </Button>
                    </a>
                  ) : (
                    <Button size="sm" className="w-full" disabled variant="outline">
                      {t("sensors.add.ova.notConfigured")}
                    </Button>
                  )}
                </div>
              </Surface>

              {/* Installer script */}
              <Surface padded className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-cyan-400/20 p-2">
                    <Terminal className="h-4 w-4 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t("sensors.add.installer.title")}</p>
                    <p className="text-xs text-muted-foreground">{t("sensors.add.installer.subtitle")}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("sensors.add.installer.description", { cmd: "bash install-sensor.sh" })}
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
                    onClick={downloadInstaller}
                    disabled={downloading || !!configError || selected.length === 0}
                  >
                    {downloading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    {selected.length === 0 ? t("sensors.add.installer.selectFirst") : t("sensors.add.installer.download")}
                  </Button>
                </div>
              </Surface>
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          {t("sensors.add.footer", { path: "/sensors" })}
        </p>
      </DialogContent>
    </Dialog>
  )
}

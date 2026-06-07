"use client"

import { useState } from "react"
import { apiFetchAudited } from "@/lib/client-fetch"
import { Download, Globe, Network, Server, CheckCircle2, Terminal, ChevronRight, Loader2, Radar, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { Client, Sensor } from "@/lib/api"
import type { ServiceKey } from "@/app/api/sensor/install/route"

type CatalogEntry = {
  serviceKey: ServiceKey | null   // null = not in installer (e.g. dionaea)
  protocol: string
  name: string
  description: string
  sensorPrefix: string
  ports: string
  icon: React.ElementType
  iconColor: string
  iconBg: string
}

const CATALOG: CatalogEntry[] = [
  {
    serviceKey: "ssh",
    protocol: "ssh",
    name: "SSH Honeypot (Cowrie)",
    description: "Captures SSH brute-force attacks and interactive shell sessions.",
    sensorPrefix: "cowrie",
    ports: ":22 :2222",
    icon: Server,
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-400/10",
  },
  {
    serviceKey: "http",
    protocol: "http",
    name: "Web Honeypot",
    description: "Captures HTTP requests to fake web applications and login pages.",
    sensorPrefix: "web",
    ports: ":80 :8443",
    icon: Globe,
    iconColor: "text-green-400",
    iconBg: "bg-green-400/10",
  },
  {
    serviceKey: "ftp",
    protocol: "ftp",
    name: "FTP Honeypot",
    description: "Captures FTP credential attempts.",
    sensorPrefix: "ftp",
    ports: ":21",
    icon: Network,
    iconColor: "text-yellow-400",
    iconBg: "bg-yellow-400/10",
  },
  {
    serviceKey: "mysql",
    protocol: "mysql",
    name: "MySQL Honeypot",
    description: "Captures MySQL connection attempts.",
    sensorPrefix: "mysql",
    ports: ":3306",
    icon: Network,
    iconColor: "text-orange-400",
    iconBg: "bg-orange-400/10",
  },
  {
    serviceKey: "port",
    protocol: "port-scan",
    name: "Port Honeypot",
    description: "Captures probes on common service ports (RDP, Redis, Docker, MongoDB…).",
    sensorPrefix: "port",
    ports: ":1433 :6379 …",
    icon: Network,
    iconColor: "text-blue-400",
    iconBg: "bg-blue-400/10",
  },
  {
    serviceKey: "deception",
    protocol: "deception",
    name: "Deception Network (OpenCanary)",
    description: "Deploys 5 internal trap nodes on 10.0.1.0/24. Requires SSH (Cowrie) as the entry point.",
    sensorPrefix: "opencanary",
    ports: "interna 10.0.1.0/24",
    icon: Radar,
    iconColor: "text-fuchsia-400",
    iconBg: "bg-fuchsia-400/10",
  },
  {
    serviceKey: null,
    protocol: "dionaea",
    name: "Dionaea Multi-Protocol",
    description: "Captures SMB, FTP, MSSQL, MySQL, MQTT, and more. Downloads .env config.",
    sensorPrefix: "dionaea",
    ports: ":445 :1433 …",
    icon: Network,
    iconColor: "text-red-400",
    iconBg: "bg-red-400/10",
  },
]

// Entries with a serviceKey can be bundled into a single installer script; the
// rest (dionaea) only ship as a standalone .env and are downloaded one at a time.
const SCRIPT_ENTRIES = CATALOG.filter((e) => e.serviceKey)
const STANDALONE_ENTRIES = CATALOG.filter((e) => !e.serviceKey)

type Props = {
  client: Client
  assignedSensors: Sensor[]
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ClientSensorCatalog({ client, assignedSensors }: Props) {
  // Bundled .sh download: which script services are selected.
  const [selected, setSelected] = useState<ServiceKey[]>([])
  const [downloadingBundle, setDownloadingBundle] = useState(false)
  // Standalone .env download (dionaea): which protocol is currently downloading.
  const [downloadingEnv, setDownloadingEnv] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const assignedProtocols = new Set(assignedSensors.map((s) => s.protocol))

  function toggle(key: ServiceKey) {
    setError(null)
    setSelected((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      // Deception needs cowrie as its entry point: turning it on forces ssh on.
      if (key === "deception" && next.includes("deception") && !next.includes("ssh")) {
        next.push("ssh")
      }
      return next
    })
  }

  async function downloadBundle() {
    if (selected.length === 0) return
    setDownloadingBundle(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        services: selected.join(","),
        clientSlug: client.slug,
        clientName: client.name,
      })
      const res = await apiFetchAudited(`/api/sensor/install?${params}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? "Download failed")
      }
      const filename = `install-sensor-${client.slug}-${selected.join("-")}.sh`
      triggerDownload(await res.blob(), filename)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed")
    } finally {
      setDownloadingBundle(false)
    }
  }

  async function downloadEnv(entry: CatalogEntry) {
    setDownloadingEnv(entry.protocol)
    setError(null)
    try {
      const res = await apiFetchAudited(
        `/api/sensor-bundle?clientSlug=${encodeURIComponent(client.slug)}&sensorType=${encodeURIComponent(entry.protocol)}`,
      )
      if (!res.ok) throw new Error("Download failed")
      const code = client.code || client.slug.toUpperCase().slice(0, 8)
      triggerDownload(await res.blob(), `${entry.sensorPrefix}-01-${code}.env`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed")
    } finally {
      setDownloadingEnv(null)
    }
  }

  const installedCount = CATALOG.filter((e) => assignedProtocols.has(e.protocol)).length

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="w-full rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-cyan-400/40 hover:bg-card/80 group">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10">
              <Terminal className="h-5 w-5 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-foreground">Sensor Installers</h2>
                {installedCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    {installedCount} installed
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Download ready-to-run installers — telemetry and server config already embedded.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10">
              <Terminal className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <DialogTitle>Sensor Installers</DialogTitle>
              <DialogDescription className="mt-0.5">
                Select one or more sensors to bundle into a single{" "}
                <span className="font-mono">install-sensor-*.sh</span>, then run it on any Linux VPS.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Bundleable sensors — multi-select into one installer */}
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {SCRIPT_ENTRIES.map((entry) => {
              const Icon = entry.icon
              const installed = assignedProtocols.has(entry.protocol)
              const active = selected.includes(entry.serviceKey!)
              return (
                <button
                  key={entry.protocol}
                  type="button"
                  onClick={() => toggle(entry.serviceKey!)}
                  className={[
                    "flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors",
                    active
                      ? "border-cyan-400/60 bg-cyan-400/[0.06] ring-1 ring-inset ring-cyan-400/25"
                      : "border-border/70 bg-background/50 hover:border-border hover:bg-accent/60",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={[
                        "mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors",
                        active ? "border-cyan-400 bg-cyan-400" : "border-muted-foreground/40",
                      ].join(" ")}
                    >
                      {active && (
                        <svg className="h-2.5 w-2.5 text-black" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${entry.iconBg}`}>
                      <Icon className={`h-4 w-4 ${entry.iconColor}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-foreground text-sm">{entry.name}</p>
                        {installed && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Installed
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
                    </div>
                  </div>
                  <div className={[
                    "flex items-center justify-between rounded-md px-3 py-1.5 transition-colors",
                    active ? "bg-cyan-400/10" : "bg-muted/50",
                  ].join(" ")}>
                    <p className="font-mono text-xs text-muted-foreground">{entry.ports}</p>
                    <span className="text-[10px] text-cyan-400/70 font-mono">.sh</span>
                  </div>
                </button>
              )
            })}
          </div>

          {selected.includes("deception") && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                La red de deception requiere SSH (Cowrie) como entrada y despliega 5 nodos trampa
                internos en 10.0.1.0/24. Se incluye SSH automáticamente.
              </span>
            </p>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            onClick={downloadBundle}
            disabled={downloadingBundle || selected.length === 0}
            className="w-full gap-2"
          >
            {downloadingBundle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {selected.length === 0
              ? "Select sensors to bundle"
              : `Download installer (${selected.length} sensor${selected.length === 1 ? "" : "s"})`}
          </Button>
        </div>

        {/* Standalone sensors (dionaea) — downloaded individually as .env */}
        {STANDALONE_ENTRIES.length > 0 && (
          <div className="space-y-3 border-t border-border/60 pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Standalone sensors
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {STANDALONE_ENTRIES.map((entry) => {
                const Icon = entry.icon
                const installed = assignedProtocols.has(entry.protocol)
                const isDownloading = downloadingEnv === entry.protocol
                return (
                  <div
                    key={entry.protocol}
                    className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/50 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${entry.iconBg}`}>
                        <Icon className={`h-4 w-4 ${entry.iconColor}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-foreground text-sm">{entry.name}</p>
                          {installed && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              Installed
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5">
                      <p className="font-mono text-xs text-muted-foreground">{entry.ports}</p>
                      <span className="text-[10px] text-muted-foreground/60 font-mono">.env</span>
                    </div>
                    <Button
                      size="sm"
                      variant={installed ? "outline" : "default"}
                      onClick={() => downloadEnv(entry)}
                      disabled={isDownloading}
                      className="w-full gap-2"
                    >
                      {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      {isDownloading ? "Generating…" : installed ? "Re-download" : "Download .env"}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

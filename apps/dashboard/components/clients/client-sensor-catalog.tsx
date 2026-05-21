"use client"

import { useState } from "react"
import { Download, Globe, Network, Server, CheckCircle2, Terminal, ChevronRight } from "lucide-react"
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

type Props = {
  client: Client
  assignedSensors: Sensor[]
}

export function ClientSensorCatalog({ client, assignedSensors }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null)

  const assignedProtocols = new Set(assignedSensors.map((s) => s.protocol))

  async function downloadInstaller(entry: CatalogEntry) {
    setDownloading(entry.protocol)
    try {
      let res: Response
      if (entry.serviceKey) {
        const params = new URLSearchParams({
          services: entry.serviceKey,
          clientSlug: client.slug,
          clientName: client.name,
        })
        res = await fetch(`/api/sensor/install?${params}`)
      } else {
        // Fallback to .env bundle for dionaea
        res = await fetch(
          `/api/sensor-bundle?clientSlug=${encodeURIComponent(client.slug)}&sensorType=${encodeURIComponent(entry.protocol)}`,
        )
      }
      if (!res.ok) throw new Error("Download failed")

      const blob = await res.blob()
      const code = client.code || client.slug.toUpperCase().slice(0, 8)
      const filename = entry.serviceKey
        ? `install-sensor-${client.slug}-${entry.serviceKey}.sh`
        : `${entry.sensorPrefix}-01-${code}.env`

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent — button just stops spinning
    } finally {
      setDownloading(null)
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
                Run <span className="font-mono">bash install-sensor-*.sh</span> on any Linux VPS.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {CATALOG.map((entry) => {
            const Icon = entry.icon
            const installed = assignedProtocols.has(entry.protocol)
            const isDownloading = downloading === entry.protocol

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
                  {entry.serviceKey ? (
                    <span className="text-[10px] text-cyan-400/70 font-mono">.sh</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60 font-mono">.env</span>
                  )}
                </div>

                <Button
                  size="sm"
                  variant={installed ? "outline" : "default"}
                  onClick={() => downloadInstaller(entry)}
                  disabled={isDownloading}
                  className="w-full gap-2"
                >
                  <Download className="h-3.5 w-3.5" />
                  {isDownloading
                    ? "Generating…"
                    : installed
                      ? "Re-download installer"
                      : "Download installer"}
                </Button>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

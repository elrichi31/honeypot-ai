"use client"

import { useState } from "react"
import { Download, Globe, Network, Server, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Client, Sensor } from "@/lib/api"

type CatalogEntry = {
  protocol: string
  name: string
  description: string
  sensorPrefix: string
  icon: React.ElementType
  iconColor: string
  iconBg: string
}

const CATALOG: CatalogEntry[] = [
  {
    protocol: "ssh",
    name: "SSH Honeypot (Cowrie)",
    description: "Captures SSH brute-force attacks and interactive shell sessions.",
    sensorPrefix: "cowrie",
    icon: Server,
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-400/10",
  },
  {
    protocol: "dionaea",
    name: "Dionaea Multi-Protocol",
    description: "Captures SMB, FTP, MSSQL, MySQL, MQTT, and more.",
    sensorPrefix: "dionaea",
    icon: Network,
    iconColor: "text-red-400",
    iconBg: "bg-red-400/10",
  },
  {
    protocol: "http",
    name: "Web Honeypot",
    description: "Captures HTTP requests to fake web applications and login pages.",
    sensorPrefix: "web",
    icon: Globe,
    iconColor: "text-green-400",
    iconBg: "bg-green-400/10",
  },
  {
    protocol: "port-scan",
    name: "Port Honeypot",
    description: "Captures probes on common service ports (RDP, Redis, Docker, MongoDB…).",
    sensorPrefix: "port",
    icon: Network,
    iconColor: "text-blue-400",
    iconBg: "bg-blue-400/10",
  },
]

type Props = {
  client: Client
  assignedSensors: Sensor[]
}

export function ClientSensorCatalog({ client, assignedSensors }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null)

  const assignedProtocols = new Set(assignedSensors.map((s) => s.protocol))

  async function downloadBundle(entry: CatalogEntry) {
    setDownloading(entry.protocol)
    try {
      const res = await fetch(
        `/api/sensor-bundle?clientSlug=${encodeURIComponent(client.slug)}&sensorType=${encodeURIComponent(entry.protocol)}`,
      )
      if (!res.ok) throw new Error("Download failed")
      const blob = await res.blob()
      const code = client.code || client.slug.toUpperCase().slice(0, 8)
      const filename = `${entry.sensorPrefix}-01-${code}.env`
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

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-400/10">
          <Download className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Sensor Bundles</h2>
          <p className="text-sm text-muted-foreground">
            Download a pre-filled <span className="font-mono">.env</span> for each sensor type. Edit{" "}
            <span className="font-mono">INGEST_API_URL</span> before deploying.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CATALOG.map((entry) => {
          const Icon = entry.icon
          const installed = assignedProtocols.has(entry.protocol)
          const code = client.code || client.slug.toUpperCase().slice(0, 8)
          const suggestedId = `${entry.sensorPrefix}-01-${code}`

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

              <div className="rounded-md bg-muted/50 px-3 py-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Suggested ID</p>
                <p className="font-mono text-xs text-foreground">{suggestedId}</p>
              </div>

              <Button
                size="sm"
                variant={installed ? "outline" : "default"}
                onClick={() => downloadBundle(entry)}
                disabled={downloading === entry.protocol}
                className="w-full gap-2"
              >
                <Download className="h-3.5 w-3.5" />
                {downloading === entry.protocol ? "Generating…" : installed ? "Re-download config" : "Download config"}
              </Button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

import { Activity, AlertTriangle, CheckCircle2, Database, Globe, Network, Server, Wifi, WifiOff, XCircle } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { fetchSensors } from "@/lib/api"
import type { Sensor } from "@/lib/api"

const PROTOCOL_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  ssh:        { label: "SSH",       icon: Server,   color: "text-cyan-400",    bg: "bg-cyan-400/10" },
  ftp:        { label: "FTP",       icon: Server,   color: "text-yellow-400",  bg: "bg-yellow-400/10" },
  mysql:      { label: "MySQL",     icon: Database, color: "text-purple-400",  bg: "bg-purple-400/10" },
  "port-scan":{ label: "Port Scan", icon: Network,  color: "text-blue-400",    bg: "bg-blue-400/10" },
  http:       { label: "HTTP",      icon: Globe,    color: "text-green-400",   bg: "bg-green-400/10" },
}


function formatRelative(value: string | null | undefined) {
  if (!value || new Date(value).getTime() === 0) return "-"
  const diff = Date.now() - new Date(value).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

function SensorCard({ sensor }: { sensor: Sensor }) {
  const meta = PROTOCOL_META[sensor.protocol] ?? { label: sensor.protocol, icon: Server, color: "text-slate-400", bg: "bg-slate-400/10" }
  const Icon = meta.icon

  return (
    <div className={`rounded-xl border bg-card p-5 flex flex-col gap-4 transition-colors ${sensor.online ? "border-border" : "border-border/40 opacity-70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${meta.bg}`}>
            <Icon className={`h-5 w-5 ${meta.color}`} />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">{sensor.name}</p>
            <p className={`text-xs font-medium ${meta.color}`}>{meta.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {sensor.online ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-xs font-medium text-emerald-400">Online</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Offline</span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">IP</p>
          <p className="font-mono text-xs text-foreground">{sensor.ip || "-"}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Events</p>
          <p className="font-semibold text-foreground">{sensor.eventsTotal.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Sensor ID</p>
          <p className="font-mono text-[11px] text-muted-foreground truncate">{sensor.sensorId}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Last seen</p>
          <p className="text-xs text-foreground">{formatRelative(sensor.lastSeen)}</p>
        </div>
      </div>

      {sensor.ports.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sensor.ports.map(port => {
            const up = sensor.portStatus?.[port]
            const probeFailedWhileOnline = sensor.online && up === false
            return (
              <span
                key={port}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-mono font-medium ${
                  up === true
                    ? "bg-emerald-400/15 text-emerald-400"
                    : probeFailedWhileOnline
                    ? "bg-amber-400/15 text-amber-300"
                    : up === false
                    ? "bg-red-400/15 text-red-400"
                    : "bg-muted/60 text-muted-foreground"
                }`}
              >
                {up === true ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : probeFailedWhileOnline ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : up === false ? (
                  <XCircle className="h-3 w-3" />
                ) : null}
                :{port}
              </span>
            )
          })}
        </div>
      )}

      {sensor.version && (
        <div className="rounded-md bg-muted/40 px-3 py-1.5">
          <p className="text-[11px] font-mono text-muted-foreground">v{sensor.version}</p>
        </div>
      )}
    </div>
  )
}

export default async function SensorsPage() {
  let sensors: Sensor[] = []
  try {
    sensors = await fetchSensors()
  } catch {
    // show empty state
  }

  const online = sensors.filter(s => s.online).length
  const total = sensors.length

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Sensors</h1>
        <p className="text-sm text-muted-foreground">
          Honeypot sensors deployed across your infrastructure — heartbeat updated every 30 s.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
          <Wifi className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-medium text-foreground">{online} online</span>
          <span className="text-sm text-muted-foreground">/ {total} total</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
          <Activity className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-medium text-foreground">
            {sensors.reduce((sum, s) => sum + s.eventsTotal, 0).toLocaleString()}
          </span>
          <span className="text-sm text-muted-foreground">total events</span>
        </div>
      </div>

      {sensors.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
          <Server className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No sensors registered yet</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Sensors register automatically via heartbeat when the honeypot services start.
            Set <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">SENSOR_ID</code> and{" "}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">SENSOR_IP</code> env vars on each service.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sensors
            .sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || b.eventsTotal - a.eventsTotal)
            .map(sensor => (
              <SensorCard key={sensor.sensorId} sensor={sensor} />
            ))}
        </div>
      )}
    </PageShell>
  )
}

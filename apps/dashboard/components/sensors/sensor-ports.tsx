"use client"

import { AlertTriangle, CheckCircle2, Lock, XCircle } from "lucide-react"
import type { Sensor } from "@/lib/api"

function portTitle(port: number, up: boolean | undefined, probeFailedWhileOnline: boolean): string {
  if (up === true) return `Puerto ${port} accesible`
  if (probeFailedWhileOnline) return `Puerto ${port} no alcanzable desde el servidor (firewall o NAT)`
  if (up === false) return `Puerto ${port} offline`
  return `Puerto ${port} — comprobando accesibilidad…`
}

function portClassName(up: boolean | undefined, probeFailedWhileOnline: boolean): string {
  const base = "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium cursor-default"
  if (up === true) return `${base} bg-emerald-400/15 text-emerald-400`
  if (probeFailedWhileOnline) return `${base} bg-amber-400/15 text-amber-300`
  if (up === false) return `${base} bg-red-400/15 text-red-400`
  return `${base} bg-muted/60 text-muted-foreground`
}

function PortIcon({ up, probeFailedWhileOnline }: { up: boolean | undefined; probeFailedWhileOnline: boolean }) {
  if (up === true) return <CheckCircle2 className="h-2.5 w-2.5" />
  if (probeFailedWhileOnline) return <AlertTriangle className="h-2.5 w-2.5" />
  if (up === false) return <XCircle className="h-2.5 w-2.5" />
  return null
}

function ExternalPortBadge({ port, sensor }: { port: number; sensor: Sensor }) {
  const up = sensor.portStatus?.[port]
  const probeFailedWhileOnline = sensor.online && up === false
  return (
    <span
      key={port}
      title={portTitle(port, up, probeFailedWhileOnline)}
      className={portClassName(up, probeFailedWhileOnline)}
    >
      <PortIcon up={up} probeFailedWhileOnline={probeFailedWhileOnline} />
      :{port}
    </span>
  )
}

function InternalPortBadge({ port }: { port: number }) {
  return (
    <span
      title={`Puerto ${port} — red interna, no expuesto al exterior`}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium cursor-default bg-violet-400/10 text-violet-400"
    >
      <Lock className="h-2.5 w-2.5" />
      :{port}
    </span>
  )
}

function RemotePortBadge({ port }: { port: number }) {
  return (
    <span
      title={`Puerto ${port} — sensor remoto, no se sondea desde este servidor`}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium cursor-default bg-muted/60 text-muted-foreground"
    >
      :{port}
    </span>
  )
}

export function SensorPorts({ sensor, isInternal, isRemote = false }: { sensor: Sensor; isInternal: boolean; isRemote?: boolean }) {
  if (sensor.ports.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {isRemote
        ? sensor.ports.map((port) => <RemotePortBadge key={port} port={port} />)
        : isInternal
        ? sensor.ports.map((port) => <InternalPortBadge key={port} port={port} />)
        : sensor.ports.map((port) => <ExternalPortBadge key={port} port={port} sensor={sensor} />)}
    </div>
  )
}

"use client"

import { formatRelative } from "@/lib/sensor-display"
import type { Sensor } from "@/lib/api"

function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      {children}
    </div>
  )
}

function IpSection({
  sensor,
  isInternal,
  honeypotPublicIp,
}: {
  sensor: Sensor
  isInternal: boolean
  honeypotPublicIp?: string
}) {
  if (isInternal) {
    return (
      <div className="col-span-2 grid grid-cols-2 gap-2">
        <StatCell label="IP Interna">
          <p className="font-mono text-xs text-violet-400">{sensor.ip}</p>
        </StatCell>
        <StatCell label="IP Externa">
          <p className="font-mono text-xs text-foreground">{honeypotPublicIp || "-"}</p>
        </StatCell>
      </div>
    )
  }
  return (
    <div className="col-span-2 grid grid-cols-2 gap-2">
      <StatCell label="IP">
        <p className="font-mono text-xs text-foreground">{sensor.ip || "-"}</p>
      </StatCell>
    </div>
  )
}

export function SensorStats({
  sensor,
  isInternal,
  honeypotPublicIp,
  clientCode,
}: {
  sensor: Sensor
  isInternal: boolean
  honeypotPublicIp?: string
  clientCode?: string
}) {
  const sensorIdDisplay = clientCode ? `${sensor.sensorId}-${clientCode}` : sensor.sensorId
  return (
    <div className="grid grid-cols-2 gap-2">
      <IpSection sensor={sensor} isInternal={isInternal} honeypotPublicIp={honeypotPublicIp} />
      <StatCell label="Events">
        <p className="font-semibold text-sm text-foreground">{sensor.eventsTotal.toLocaleString()}</p>
      </StatCell>
      <StatCell label="Last seen">
        <p className="text-xs text-foreground">{formatRelative(sensor.lastSeen)}</p>
      </StatCell>
      <div className="col-span-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Sensor ID</p>
        <p className="font-mono text-[10px] text-muted-foreground truncate">{sensorIdDisplay}</p>
      </div>
    </div>
  )
}

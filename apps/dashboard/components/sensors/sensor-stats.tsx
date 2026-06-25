"use client"

import { formatRelative } from "@/lib/sensor-display"
import type { Sensor } from "@/lib/api"
import { useT } from "@/components/locale-provider"
import { useSensorLive } from "./sensor-live-context"

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
  const t = useT()
  if (isInternal) {
    return (
      <div className="col-span-2 grid grid-cols-2 gap-2">
        <StatCell label={t("sensors.stats.ipInternal")}>
          <p className="font-mono text-xs text-violet-400">{sensor.ip}</p>
        </StatCell>
        <StatCell label={t("sensors.stats.ipExternal")}>
          <p className="font-mono text-xs text-foreground">{honeypotPublicIp || "-"}</p>
        </StatCell>
      </div>
    )
  }
  return (
    <div className="col-span-2 grid grid-cols-2 gap-2">
      <StatCell label={t("sensors.stats.ip")}>
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
  const t = useT()
  const { getLastLiveAt } = useSensorLive()
  const sensorIdDisplay = clientCode ? `${sensor.sensorId}-${clientCode}` : sensor.sensorId
  const liveTs = getLastLiveAt(sensor.sensorId)
  const effectiveLastSeen =
    typeof liveTs === "number" && Number.isFinite(liveTs)
      ? new Date(Math.max(new Date(sensor.lastSeen).getTime() || 0, liveTs))
      : sensor.lastSeen
  return (
    <div className="grid grid-cols-2 gap-2">
      <IpSection sensor={sensor} isInternal={isInternal} honeypotPublicIp={honeypotPublicIp} />
      <StatCell label={t("sensors.stats.events")}>
        <p className="font-semibold text-sm text-foreground">{sensor.eventsTotal.toLocaleString()}</p>
      </StatCell>
      <StatCell label={t("sensors.stats.lastSeen")}>
        <p className="text-xs text-foreground">{formatRelative(effectiveLastSeen)}</p>
      </StatCell>
      <div className="col-span-2">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{t("sensors.stats.sensorId")}</p>
        <p className="font-mono text-[10px] text-muted-foreground truncate">{sensorIdDisplay}</p>
      </div>
    </div>
  )
}

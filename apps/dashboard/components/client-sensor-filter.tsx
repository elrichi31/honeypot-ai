"use client"

import { useSearchParams } from "next/navigation"
import { useNavTransitionOptional } from "@/lib/use-nav-transition"

export interface SensorLite {
  sensorId: string
  name: string
  protocol: string
  clientSlug: string | null
  clientName: string | null
}

export interface ClientLite {
  slug: string
  name: string
}

/**
 * Two linked dropdowns to scope web-attacks telemetry to a client and/or a
 * single sensor. Defaults to "all", so the global aggregated view stays the
 * default. Picking a client narrows the sensor list to that client's sensors;
 * picking a sensor sets `?sensorId=`. Both drive URL params and reset paging.
 */
export function ClientSensorFilter({
  clients,
  sensors,
  webOnly = true,
}: {
  clients: ClientLite[]
  sensors: SensorLite[]
  webOnly?: boolean
}) {
  const searchParams = useSearchParams()
  const { pushParams } = useNavTransitionOptional()
  const activeClient = searchParams.get("clientSlug") ?? ""
  const activeSensor = searchParams.get("sensorId") ?? ""

  // Only web sensors are relevant for web-attacks telemetry.
  const relevantSensors = webOnly
    ? sensors.filter((s) => s.protocol === "http" || s.protocol === "web")
    : sensors
  const sensorsForClient = activeClient
    ? relevantSensors.filter((s) => s.clientSlug === activeClient)
    : relevantSensors

  const onClient = (slug: string) => {
    if (!slug) pushParams({}, ["clientSlug", "sensorId", "page"])
    else pushParams({ clientSlug: slug }, ["sensorId", "page"])
  }
  const onSensor = (id: string) => {
    if (!id) pushParams({}, ["sensorId", "page"])
    else pushParams({ sensorId: id }, ["page"])
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={activeClient}
        onChange={(e) => onClient(e.target.value)}
        className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs font-medium text-foreground outline-none focus:border-cyan-400/50"
        title="Filter by client"
      >
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.slug} value={c.slug}>{c.name}</option>
        ))}
      </select>
      <select
        value={activeSensor}
        onChange={(e) => onSensor(e.target.value)}
        className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs font-medium text-foreground outline-none focus:border-cyan-400/50 disabled:opacity-40"
        title="Filter by sensor"
        disabled={sensorsForClient.length === 0}
      >
        <option value="">All web sensors</option>
        {sensorsForClient.map((s) => (
          <option key={s.sensorId} value={s.sensorId}>
            {s.name}{s.clientName && !activeClient ? ` · ${s.clientName}` : ""}
          </option>
        ))}
      </select>
    </div>
  )
}

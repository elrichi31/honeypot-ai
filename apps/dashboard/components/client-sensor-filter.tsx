"use client"

import { useSearchParams } from "next/navigation"
import { useNavTransitionOptional } from "@/lib/use-nav-transition"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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

// Radix Select forbids an empty-string item value, so "all" is the sentinel for
// "no filter" and is translated to a removed query param.
const ALL = "__all"

/**
 * Two linked dropdowns to scope web-attacks telemetry to a client and/or a
 * single sensor. Defaults to "all", so the global aggregated view stays the
 * default. Picking a client narrows the sensor list to that client's sensors;
 * picking a sensor sets `?sensorId=`. Both drive URL params and reset paging.
 * Uses the themed Radix Select so the open menu matches the dark dashboard.
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

  const onClient = (value: string) => {
    if (value === ALL) pushParams({}, ["clientSlug", "sensorId", "page"])
    else pushParams({ clientSlug: value }, ["sensorId", "page"])
  }
  const onSensor = (value: string) => {
    if (value === ALL) pushParams({}, ["sensorId", "page"])
    else pushParams({ sensorId: value }, ["page"])
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={activeClient || ALL} onValueChange={onClient}>
        <SelectTrigger size="sm" className="w-[160px] bg-muted/30" aria-label="Filter by client">
          <SelectValue placeholder="All clients" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All clients</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={activeSensor || ALL}
        onValueChange={onSensor}
        disabled={sensorsForClient.length === 0}
      >
        <SelectTrigger size="sm" className="w-[180px] bg-muted/30" aria-label="Filter by sensor">
          <SelectValue placeholder="All web sensors" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All web sensors</SelectItem>
          {sensorsForClient.map((s) => (
            <SelectItem key={s.sensorId} value={s.sensorId}>
              {s.name}{s.clientName && !activeClient ? ` · ${s.clientName}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

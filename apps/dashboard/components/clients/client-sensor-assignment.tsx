"use client"

import { useMemo, useState } from "react"
import { Link2, Server } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SensorCard } from "@/components/sensors/sensor-card"
import type { Client, Sensor } from "@/lib/api"

type Props = {
  client: Client
  initialAssignedSensors: Sensor[]
  initialUnassignedSensors: Sensor[]
}

export function ClientSensorAssignment({
  client,
  initialAssignedSensors,
  initialUnassignedSensors,
}: Props) {
  const [assignedSensors, setAssignedSensors] = useState(initialAssignedSensors)
  const [unassignedSensors, setUnassignedSensors] = useState(initialUnassignedSensors)
  const [assigningSensorId, setAssigningSensorId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const sortedAssigned = useMemo(
    () =>
      [...assignedSensors].sort(
        (a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || b.eventsTotal - a.eventsTotal,
      ),
    [assignedSensors],
  )

  const sortedUnassigned = useMemo(
    () => [...unassignedSensors].sort((a, b) => a.name.localeCompare(b.name)),
    [unassignedSensors],
  )

  async function assignSensor(sensor: Sensor) {
    setAssigningSensorId(sensor.sensorId)
    setMessage(null)

    try {
      const res = await fetch(`/api/sensors/${encodeURIComponent(sensor.sensorId)}/client`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id }),
      })

      if (!res.ok) throw new Error("Could not assign sensor")

      setUnassignedSensors((current) => current.filter((item) => item.sensorId !== sensor.sensorId))
      setAssignedSensors((current) => [
        ...current,
        {
          ...sensor,
          clientId: client.id,
          clientName: client.name,
          clientSlug: client.slug,
        },
      ])
      setMessage(`Sensor ${sensor.name} assigned to ${client.name}.`)
    } catch {
      setMessage("Could not assign the sensor.")
    } finally {
      setAssigningSensorId(null)
    }
  }

  return (
    <div className="space-y-8">
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/10">
            <Server className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Assigned Sensors</h2>
            <p className="text-sm text-muted-foreground">
              Sensors currently linked to this client.
            </p>
          </div>
        </div>

        {sortedAssigned.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
            <p className="text-sm font-medium text-foreground mb-1">No sensors assigned yet</p>
            <p className="text-sm text-muted-foreground">
              Use the unassigned sensor list below to attach sensors to this client.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sortedAssigned.map((sensor) => (
              <SensorCard key={sensor.sensorId} sensor={sensor} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400/10">
            <Link2 className="h-5 w-5 text-amber-300" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Unassigned Sensors</h2>
            <p className="text-sm text-muted-foreground">
              Click assign to attach available sensors to this client.
            </p>
          </div>
        </div>

        {sortedUnassigned.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">There are no unassigned sensors right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedUnassigned.map((sensor) => (
              <div
                key={sensor.sensorId}
                className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">{sensor.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {sensor.sensorId} | {sensor.protocol.toUpperCase()} | {sensor.ip || "no-ip"}
                  </p>
                </div>

                <Button
                  onClick={() => assignSensor(sensor)}
                  disabled={assigningSensorId === sensor.sensorId}
                  className="gap-2 self-start md:self-auto"
                >
                  <Link2 className="h-4 w-4" />
                  {assigningSensorId === sensor.sensorId ? "Assigning..." : "Assign"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

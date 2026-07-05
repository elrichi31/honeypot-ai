"use client"

import { apiFetch, assertOk } from "@/lib/client-fetch"

import { useMemo, useState } from "react"
import { Link2, Server, Unlink2, Ghost, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Surface } from "@/components/ui/surface"
import { SensorCard } from "@/components/sensors/sensor-card"
import type { Client, Sensor } from "@/lib/api"
import { useT } from "@/components/locale-provider"

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
  const t = useT()
  const [assignedSensors, setAssignedSensors] = useState(initialAssignedSensors)
  const [unassignedSensors, setUnassignedSensors] = useState(initialUnassignedSensors)
  const [pendingSensorId, setPendingSensorId] = useState<string | null>(null)
  const [assigningDeception, setAssigningDeception] = useState(false)
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

  // The 5 deception trap nodes always deploy together as a unit, so offer a
  // single action to attach the whole group at once.
  const unassignedDeception = useMemo(
    () => unassignedSensors.filter((s) => s.protocol === "deception"),
    [unassignedSensors],
  )

  // Assign one sensor. Returns the error message on failure, or null on success.
  // Caller owns the optimistic list updates so batch callers can update once.
  async function doAssign(sensor: Sensor): Promise<string | null> {
    try {
      await assertOk(await apiFetch(`/api/sensors/${encodeURIComponent(sensor.sensorId)}/client`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id }),
      }), "Could not assign sensor")
      return null
    } catch (err) {
      return err instanceof Error ? err.message : "Could not connect"
    }
  }

  function markAssigned(sensor: Sensor) {
    setUnassignedSensors((current) => current.filter((item) => item.sensorId !== sensor.sensorId))
    setAssignedSensors((current) => [
      ...current,
      { ...sensor, clientId: client.id, clientName: client.name, clientSlug: client.slug },
    ])
  }

  async function assignSensor(sensor: Sensor) {
    setPendingSensorId(sensor.sensorId)
    setMessage(null)
    const error = await doAssign(sensor)
    if (error) {
      setMessage(error)
    } else {
      markAssigned(sensor)
      setMessage(t("clients.assignment.sensor.assigned", { name: sensor.name, client: client.name }))
    }
    setPendingSensorId(null)
  }

  async function assignAllDeception() {
    setAssigningDeception(true)
    setMessage(null)
    let ok = 0
    let firstError: string | null = null
    for (const sensor of unassignedDeception) {
      const error = await doAssign(sensor)
      if (error) {
        if (!firstError) firstError = error
      } else {
        markAssigned(sensor)
        ok++
      }
    }
    setMessage(
      firstError
        ? t("clients.assignment.deception.result", { ok: String(ok), total: String(unassignedDeception.length), error: firstError })
        : t("clients.assignment.deception.resultAll", { ok: String(ok), client: client.name }),
    )
    setAssigningDeception(false)
  }

  async function unassignSensor(sensor: Sensor) {
    setPendingSensorId(sensor.sensorId)
    setMessage(null)

    try {
      await assertOk(await apiFetch(`/api/sensors/${encodeURIComponent(sensor.sensorId)}/client`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: null }),
      }), t("clients.assignment.sensor.unassignError"))

      setAssignedSensors((current) => current.filter((item) => item.sensorId !== sensor.sensorId))
      setUnassignedSensors((current) => [
        ...current,
        {
          ...sensor,
          clientId: null,
          clientName: null,
          clientSlug: null,
        },
      ])
      setMessage(t("clients.assignment.sensor.unassigned", { name: sensor.name, client: client.name }))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("clients.assignment.sensor.unassignError"))
    } finally {
      setPendingSensorId(null)
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
            <h2 className="text-lg font-semibold text-foreground">{t("clients.assignment.assigned.title")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("clients.assignment.assigned.subtitle")}
            </p>
          </div>
        </div>

        {sortedAssigned.length === 0 ? (
          <Surface className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-foreground mb-1">{t("clients.assignment.assigned.empty.title")}</p>
            <p className="text-sm text-muted-foreground">
              {t("clients.assignment.assigned.empty.desc")}
            </p>
          </Surface>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sortedAssigned.map((sensor) => (
              <div key={sensor.sensorId} className="space-y-3">
                <SensorCard sensor={sensor} clientCode={client.code || undefined} />
                <Button
                  variant="outline"
                  onClick={() => unassignSensor(sensor)}
                  disabled={pendingSensorId === sensor.sensorId}
                  className="w-full gap-2 border-border bg-card text-foreground hover:bg-muted"
                >
                  <Unlink2 className="h-4 w-4" />
                  {pendingSensorId === sensor.sensorId ? t("clients.assignment.unassigning") : t("clients.assignment.unassign")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-400/10">
              <Link2 className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{t("clients.assignment.unassigned.title")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("clients.assignment.unassigned.subtitle")}
              </p>
            </div>
          </div>
          {unassignedDeception.length > 0 && (
            <Button
              onClick={assignAllDeception}
              disabled={assigningDeception}
              className="gap-2 bg-purple-500 text-white hover:bg-purple-500/90"
            >
              {assigningDeception ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ghost className="h-4 w-4" />}
              {assigningDeception
                ? t("clients.assignment.deception.assigning")
                : t("clients.assignment.deception.assign", { n: String(unassignedDeception.length) })}
            </Button>
          )}
        </div>

        {sortedUnassigned.length === 0 ? (
          <Surface className="px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("clients.assignment.unassigned.empty")}</p>
          </Surface>
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
                  disabled={pendingSensorId === sensor.sensorId}
                  className="gap-2 self-start md:self-auto"
                >
                  <Link2 className="h-4 w-4" />
                  {pendingSensorId === sensor.sensorId ? t("clients.assignment.assigning") : t("clients.assignment.assign")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

import Link from "next/link"
import { Activity, Server, Wifi } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { SensorCard } from "@/components/sensors/sensor-card"
import { fetchSensors } from "@/lib/api"
import type { Sensor } from "@/lib/api"

function groupSensorsByClient(sensors: Sensor[]) {
  const groups = new Map<string, { label: string; slug: string | null; sensors: Sensor[] }>()

  for (const sensor of sensors) {
    const key = sensor.clientId ?? "__unassigned__"
    const current = groups.get(key)
    if (current) {
      current.sensors.push(sensor)
      continue
    }

    groups.set(key, {
      label: sensor.clientName ?? "Unassigned",
      slug: sensor.clientSlug,
      sensors: [sensor],
    })
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.slug === null) return 1
    if (b.slug === null) return -1
    return a.label.localeCompare(b.label)
  })
}

export default async function SensorsPage() {
  let sensors: Sensor[] = []

  try {
    sensors = await fetchSensors()
  } catch {
    sensors = []
  }

  const online = sensors.filter((sensor) => sensor.online).length
  const total = sensors.length
  const groups = groupSensorsByClient(
    [...sensors].sort(
      (a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || b.eventsTotal - a.eventsTotal,
    ),
  )

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Sensors</h1>
        <p className="text-sm text-muted-foreground">
          Honeypot sensors grouped by client, with heartbeat updates every 30 seconds.
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
            {sensors.reduce((sum, sensor) => sum + sensor.eventsTotal, 0).toLocaleString()}
          </span>
          <span className="text-sm text-muted-foreground">total events</span>
        </div>
      </div>

      {sensors.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
          <Server className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No sensors registered yet</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Sensors register automatically when the services start. You can later group them under
            a client from the clients page.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.slug ?? "unassigned"} className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {group.slug ? (
                      <Link href={`/clients/${group.slug}`} className="hover:underline">
                        {group.label}
                      </Link>
                    ) : (
                      group.label
                    )}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {group.sensors.length} sensor{group.sensors.length === 1 ? "" : "s"}
                  </p>
                </div>
                {group.slug ? (
                  <Link
                    href={`/clients/${group.slug}`}
                    className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
                  >
                    Open client
                  </Link>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.sensors.map((sensor) => (
                  <SensorCard key={sensor.sensorId} sensor={sensor} clientCode={sensor.clientCode} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  )
}

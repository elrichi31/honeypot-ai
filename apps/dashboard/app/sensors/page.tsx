export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"
import { Activity, Server, Wifi, Waypoints } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { SensorCard } from "@/components/sensors/sensor-card"
import { DeceptionNetworkCard } from "@/components/sensors/deception-network-card"
import { SensorsLiveWrapper } from "@/components/sensors/sensors-live-wrapper"
import { SensorLayerFilter } from "@/components/sensors/sensor-layer-filter"
import { fetchSensors } from "@/lib/api"
import { readConfig } from "@/lib/server-config"
import { getServerT } from "@/lib/i18n/server"
import type { Sensor } from "@/lib/api"

function groupSensorsByClient(sensors: Sensor[]) {
  const groups = new Map<string, { label: string; slug: string | null; isApplication: boolean; sensors: Sensor[] }>()

  for (const sensor of sensors) {
    const key = sensor.clientId ?? "__application__"
    const current = groups.get(key)
    if (current) {
      current.sensors.push(sensor)
      continue
    }

    groups.set(key, {
      label: sensor.clientName ?? sensor.applicationName ?? "",
      slug: sensor.clientSlug,
      isApplication: sensor.ownerType === "application",
      sensors: [sensor],
    })
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.isApplication) return 1
    if (b.isApplication) return -1
    return a.label.localeCompare(b.label)
  })
}

export const metadata: Metadata = {
  title: "Sensors — HoneyTrap",
}

export default async function SensorsPage({
  searchParams,
}: {
  searchParams: Promise<{ layer?: string }>
}) {
  const t = await getServerT()
  const { layer } = await searchParams
  let sensors: Sensor[] = []

  try {
    sensors = await fetchSensors()
  } catch {
    sensors = []
  }

  // Filter by layer: external sensors have protocol !== 'deception',
  // internal/deception sensors have protocol === 'deception'.
  const filteredSensors =
    layer === "external" ? sensors.filter((s) => s.protocol !== "deception")
    : layer === "internal" ? sensors.filter((s) => s.protocol === "deception")
    : sensors

  const config = readConfig()
  let honeypotPublicIp = config.honeypotIp ?? process.env.HONEYPOT_IP ?? ""

  // Derive public IP from the first external (non-private) sensor if not configured
  if (!honeypotPublicIp) {
    const externalSensor = sensors.find((s) => {
      const ip = s.ip?.startsWith("::ffff:") ? s.ip.slice(7) : s.ip
      if (!ip || ip === "-" || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false
      const [a, b] = ip.split(".").map(Number)
      return !(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))
    })
    honeypotPublicIp = externalSensor?.ip ?? ""
  }

  const online = filteredSensors.filter((sensor) => sensor.online).length
  const total = sensors.length
  const groups = groupSensorsByClient(
    [...filteredSensors].sort(
      (a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || b.eventsTotal - a.eventsTotal,
    ),
  )

  return (
    <PageShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("sensors.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("sensors.subtitle")}
          </p>
        </div>
        <Link
          href="/network"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/40"
        >
          <Waypoints className="h-4 w-4" />
          {t("sensors.networkMap")}
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Surface className="flex items-center gap-2 px-4 py-3">
          <Wifi className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-medium text-foreground">{t("sensors.online", { n: online })}</span>
          <span className="text-sm text-muted-foreground">{t("sensors.total", { n: total })}</span>
        </Surface>
        <Surface className="flex items-center gap-2 px-4 py-3">
          <Activity className="h-4 w-4 text-cyan-400" />
          <span className="text-sm font-medium text-foreground">
            {sensors.reduce((sum, sensor) => sum + sensor.eventsTotal, 0).toLocaleString()}
          </span>
          <span className="text-sm text-muted-foreground">{t("sensors.totalEvents")}</span>
        </Surface>
        <SensorLayerFilter />
      </div>

      {filteredSensors.length === 0 && sensors.length === 0 ? (
        <Surface className="px-6 py-16 text-center">
          <Server className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">{t("sensors.empty.title")}</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {t("sensors.empty.description")}
          </p>
        </Surface>
      ) : (
        <SensorsLiveWrapper>
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.slug ?? "application"} className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {group.slug ? (
                      <Link href={`/clients/${group.slug}`} className="hover:underline">
                        {group.label}
                      </Link>
                    ) : group.isApplication ? (
                      <span className="text-muted-foreground">{group.label || t("sensors.application")}</span>
                    ) : (
                      t("sensors.unassigned")
                    )}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {group.sensors.length === 1
                      ? t("sensors.count", { n: group.sensors.length })
                      : t("sensors.countPlural", { n: group.sensors.length })}
                  </p>
                </div>
                {group.slug ? (
                  <Link
                    href={`/clients/${group.slug}`}
                    className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
                  >
                    {t("sensors.openClient")}
                  </Link>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(() => {
                  // The OpenCanary trap nodes are collapsed into one "Deception
                  // Network" card per group; the rest render as normal sensor cards.
                  const deception = group.sensors.filter((s) => s.protocol === "deception")
                  const rest = group.sensors.filter((s) => s.protocol !== "deception")
                  return (
                    <>
                      {deception.length > 0 && (
                        <DeceptionNetworkCard sensors={deception} clientSlug={group.slug} />
                      )}
                      {rest.map((sensor) => (
                        <SensorCard key={sensor.sensorId} sensor={sensor} clientCode={sensor.clientCode} honeypotPublicIp={honeypotPublicIp} />
                      ))}
                    </>
                  )
                })()}
              </div>
            </section>
          ))}
        </div>
        </SensorsLiveWrapper>
      )}
    </PageShell>
  )
}

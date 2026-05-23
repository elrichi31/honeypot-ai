import { PageShell } from "@/components/page-shell"
import { NetworkTopology } from "@/components/network/network-topology"
import { fetchSensors } from "@/lib/api"
import type { Sensor } from "@/lib/api"

export default async function NetworkPage() {
  let sensors: Sensor[] = []
  try {
    sensors = await fetchSensors()
  } catch {
    sensors = []
  }

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Network Map</h1>
        <p className="text-sm text-muted-foreground">
          Topología de sensores por cliente — sensores expuestos a Internet vs red interna.
        </p>
      </div>

      <NetworkTopology sensors={sensors} />
    </PageShell>
  )
}

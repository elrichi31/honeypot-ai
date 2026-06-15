export const dynamic = "force-dynamic"

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
    <PageShell wide>
      <div className="flex flex-col" style={{ height: "calc(100dvh - 72px)" }}>
        <div className="mb-4 shrink-0">
          <h1 className="text-2xl font-semibold text-foreground">Network Map</h1>
          <p className="text-sm text-muted-foreground">
            Sensor topology by client — Internet-facing sensors vs internal network.
          </p>
        </div>

        <div className="min-h-0 flex-1">
          <NetworkTopology sensors={sensors} />
        </div>
      </div>
    </PageShell>
  )
}

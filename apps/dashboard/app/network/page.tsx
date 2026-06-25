export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { NetworkTopology } from "@/components/network/network-topology"
import { fetchSensors } from "@/lib/api"
import type { Sensor } from "@/lib/api"

export const metadata: Metadata = {
  title: "Network Topology — HoneyTrap",
}

export default async function NetworkPage() {
  let sensors: Sensor[] = []
  try {
    sensors = await fetchSensors()
  } catch {
    sensors = []
  }

  return (
    // Bleed out of the parent <main>'s p-6 padding on all sides
    <div className="-m-6 flex flex-col" style={{ height: "calc(100dvh)" }}>
      <NetworkTopology sensors={sensors} />
    </div>
  )
}

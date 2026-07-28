"use client"

import dynamic from "next/dynamic"
import { Surface } from "@/components/ui/surface"

// recharts touches window on import — same ssr:false split as
// container-stats.tsx, for the same reason.
const Chart = dynamic(() => import("./trends-chart"), {
  ssr: false,
  loading: () => <Surface className="h-[360px] animate-pulse" />,
})

export function TrendsExplorer() {
  return <Chart />
}

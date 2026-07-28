"use client"

import dynamic from "next/dynamic"
import { Surface } from "@/components/ui/surface"

const Chart = dynamic(() => import("./comparison-chart"), {
  ssr: false,
  loading: () => <Surface className="h-[400px] animate-pulse" />,
})

export function ComparisonExplorer() {
  return <Chart />
}

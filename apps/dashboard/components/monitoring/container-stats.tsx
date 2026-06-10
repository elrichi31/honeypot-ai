"use client"

import dynamic from "next/dynamic"
import { Surface } from "@/components/ui/surface"

const Chart = dynamic(() => import("./container-stats-chart"), {
  ssr: false,
  loading: () => <Surface className="h-[480px] animate-pulse" />,
})

export function ContainerStats() {
  return <Chart />
}

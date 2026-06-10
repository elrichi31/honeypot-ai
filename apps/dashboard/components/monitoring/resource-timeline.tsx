"use client"

import dynamic from "next/dynamic"
import { Surface } from "@/components/ui/surface"

const Chart = dynamic(() => import("./resource-timeline-chart"), {
  ssr: false,
  loading: () => <Surface className="h-[380px] animate-pulse" />,
})

export function ResourceTimeline() {
  return <Chart />
}

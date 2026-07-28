"use client"

import dynamic from "next/dynamic"
import { Surface } from "@/components/ui/surface"

const Chart = dynamic(() => import("./suricata-trends-chart"), {
  ssr: false,
  loading: () => <Surface className="h-[360px] animate-pulse" />,
})

export function SuricataTrendsExplorer() {
  return <Chart />
}

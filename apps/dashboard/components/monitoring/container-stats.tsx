"use client"

import dynamic from "next/dynamic"

const Chart = dynamic(() => import("./container-stats-chart"), {
  ssr: false,
  loading: () => <div className="rounded-xl border border-border bg-card h-[480px] animate-pulse" />,
})

export function ContainerStats() {
  return <Chart />
}

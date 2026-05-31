"use client"

import dynamic from "next/dynamic"

const Chart = dynamic(() => import("./resource-timeline-chart"), {
  ssr: false,
  loading: () => <div className="rounded-xl border border-border bg-card h-[380px] animate-pulse" />,
})

export function ResourceTimeline() {
  return <Chart />
}

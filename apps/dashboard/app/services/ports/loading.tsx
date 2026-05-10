import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Port Scans"
      title="Loading port-scan telemetry"
      description="Analyzing exposed ports, scan waves, and suspicious connection bursts."
      variant="detail"
    />
  )
}

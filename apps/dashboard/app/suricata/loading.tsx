import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Loading"
      title="Loading Suricata alerts"
      description="Fetching IDS alerts and network threat signatures."
      variant="overview"
    />
  )
}

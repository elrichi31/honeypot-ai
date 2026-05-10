import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Services"
      title="Loading protocol activity"
      description="Aggregating honeypot service hits, ports, and cross-protocol signals."
      variant="overview"
    />
  )
}

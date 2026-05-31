import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Loading"
      title="Loading API defense"
      description="Fetching blocked IPs, attack events and defense statistics."
      variant="overview"
    />
  )
}

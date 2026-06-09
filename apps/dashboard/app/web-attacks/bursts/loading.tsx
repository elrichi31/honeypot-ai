import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Web Bursts"
      title="Detecting attack bursts"
      description="Grouping hits into time-contiguous campaigns per attacker."
      variant="overview"
    />
  )
}

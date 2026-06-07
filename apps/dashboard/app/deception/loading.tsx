import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Loading"
      title="Loading deception network"
      description="Fetching trap node activity and lateral-movement kill-chains."
      variant="overview"
    />
  )
}

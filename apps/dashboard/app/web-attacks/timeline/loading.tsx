import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Web Timeline"
      title="Loading attack timeline"
      description="Preparing burst analysis, temporal trends, and HTTP attack spikes."
      variant="overview"
    />
  )
}

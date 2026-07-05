import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Reports"
      title="Loading reports"
      description="Preparing the client list and report generation options."
      variant="overview"
    />
  )
}

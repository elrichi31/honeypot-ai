import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Loading"
      title="Loading audit log"
      description="Fetching audit trail and administrative actions."
      variant="overview"
    />
  )
}

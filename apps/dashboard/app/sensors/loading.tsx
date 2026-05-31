import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Loading"
      title="Loading sensors"
      description="Fetching sensor status and container health."
      variant="overview"
    />
  )
}

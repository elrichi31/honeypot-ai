import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Loading"
      title="Loading monitoring"
      description="Fetching server resources, cache stats and container health."
      variant="overview"
    />
  )
}

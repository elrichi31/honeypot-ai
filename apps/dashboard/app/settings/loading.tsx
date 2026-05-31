import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Loading"
      title="Loading settings"
      description="Fetching dashboard configuration and preferences."
      variant="overview"
    />
  )
}

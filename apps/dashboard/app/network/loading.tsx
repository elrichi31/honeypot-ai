import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Loading"
      title="Loading network topology"
      description="Fetching sensor network map and connection data."
      variant="overview"
    />
  )
}

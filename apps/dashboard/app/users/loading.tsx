import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Loading"
      title="Loading users"
      description="Fetching user accounts and role assignments."
      variant="overview"
    />
  )
}

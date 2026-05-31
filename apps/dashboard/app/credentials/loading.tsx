import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Loading"
      title="Loading credentials"
      description="Fetching captured usernames and passwords from attack sessions."
      variant="overview"
    />
  )
}

import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Alerts"
      title="Loading alerts"
      description="Pulling correlated alerts, sensor offline warnings, and unread counts."
      variant="overview"
    />
  )
}

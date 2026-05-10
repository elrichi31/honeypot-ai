import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Sessions"
      title="Loading SSH sessions"
      description="Pulling authentication attempts, command activity, and session summaries."
      variant="overview"
    />
  )
}

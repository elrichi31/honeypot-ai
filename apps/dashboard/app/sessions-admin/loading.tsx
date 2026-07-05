import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Admin Sessions"
      title="Loading active sessions"
      description="Pulling logged-in users, session metadata, and revoke controls."
      variant="overview"
    />
  )
}

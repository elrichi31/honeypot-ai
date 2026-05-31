import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Loading"
      title="Loading commands"
      description="Fetching attacker commands and session activity."
      variant="overview"
    />
  )
}

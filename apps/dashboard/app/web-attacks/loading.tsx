import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Web Attacks"
      title="Loading HTTP attack telemetry"
      description="Preparing request patterns, attacker clusters, and traffic summaries."
      variant="overview"
    />
  )
}

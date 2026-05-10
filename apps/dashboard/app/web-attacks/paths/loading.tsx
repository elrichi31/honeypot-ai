import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Web Paths"
      title="Loading targeted paths"
      description="Ranking attacked endpoints, probes, and suspicious request paths."
      variant="overview"
    />
  )
}

import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Web Geo"
      title="Loading geographic attack view"
      description="Mapping hostile traffic sources and regional concentration patterns."
      variant="overview"
    />
  )
}

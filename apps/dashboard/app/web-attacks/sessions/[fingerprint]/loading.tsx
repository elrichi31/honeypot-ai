import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Web Session"
      title="Loading session detail"
      description="Grouping requests, enriching the source IP, and scoring threat activity."
      variant="detail"
    />
  )
}

import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Client Detail"
      title="Loading client workspace"
      description="Preparing assigned sensors, unassigned inventory, and client metrics."
      variant="detail"
    />
  )
}

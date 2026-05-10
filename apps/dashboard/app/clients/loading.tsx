import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Clients"
      title="Loading client inventory"
      description="Fetching tenants, sensor mappings, and customer deployment status."
      variant="overview"
    />
  )
}

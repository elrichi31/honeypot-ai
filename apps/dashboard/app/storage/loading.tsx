import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Loading"
      title="Loading storage"
      description="Fetching database sizes and retention settings."
      variant="overview"
    />
  )
}

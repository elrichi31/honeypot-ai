import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="MySQL"
      title="Loading MySQL honeypot activity"
      description="Collecting database probes, auth attempts, and command behavior."
      variant="detail"
    />
  )
}

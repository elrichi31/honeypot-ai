import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Loading"
      title="Loading IoCs"
      description="Aggregating malicious IPs and malware hashes for export."
      variant="overview"
    />
  )
}

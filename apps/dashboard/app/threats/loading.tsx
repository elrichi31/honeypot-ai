import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Threats"
      title="Loading threat intelligence"
      description="Scoring hostile IPs, correlating signals, and preparing analyst context."
      variant="overview"
    />
  )
}

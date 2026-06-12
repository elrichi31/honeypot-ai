import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Web Sessions"
      title="Correlating attacker sessions"
      description="Grouping requests by fingerprint and detecting recon → exploit chains."
      variant="overview"
    />
  )
}

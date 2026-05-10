import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Threat Detail"
      title="Loading attacker profile"
      description="Assembling risk breakdowns, command categories, and service correlation."
      variant="detail"
    />
  )
}

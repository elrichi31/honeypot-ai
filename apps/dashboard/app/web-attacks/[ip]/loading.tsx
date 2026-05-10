import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Web Attacker"
      title="Loading attacker detail"
      description="Collecting path history, user agents, risk score, and request timeline."
      variant="detail"
    />
  )
}

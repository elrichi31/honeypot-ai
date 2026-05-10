import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="Session Replay"
      title="Loading session replay"
      description="Rebuilding the timeline, credentials, commands, and enrichment data."
      variant="detail"
    />
  )
}

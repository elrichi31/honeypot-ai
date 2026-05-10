import { RouteLoadingShell } from "@/components/route-loading-shell"

export default function Loading() {
  return (
    <RouteLoadingShell
      label="FTP"
      title="Loading FTP honeypot activity"
      description="Preparing FTP connection attempts, credentials, and service interactions."
      variant="detail"
    />
  )
}

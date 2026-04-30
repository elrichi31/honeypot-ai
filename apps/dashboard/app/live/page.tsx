import { PageShell } from "@/components/page-shell"
import { LiveAttackMap } from "@/components/live-attack-map"

export default function LivePage() {
  return (
    <PageShell>
      <div className="flex flex-col gap-4 h-[calc(100vh-3rem)]">
        <div>
          <h1 className="text-xl font-semibold">Live Attack Map</h1>
          <p className="text-sm text-muted-foreground">Real-time SSH, HTTP, FTP, MySQL, and port-scan events as they arrive</p>
        </div>
        <div className="flex-1 min-h-0">
          <LiveAttackMap />
        </div>
      </div>
    </PageShell>
  )
}

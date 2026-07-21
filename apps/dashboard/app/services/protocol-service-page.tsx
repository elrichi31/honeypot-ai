import { fetchProtocolHits, fetchProtocolInsights } from "@/lib/api"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { PageShell } from "@/components/page-shell"
import { SectionError } from "@/components/section-error"
import { ProtocolDetailPage } from "./protocol-detail-page"
import type { ProtocolKind } from "./protocol-detail-page"

/**
 * Shared server wrapper for the per-protocol service pages (FTP, MySQL, MSSQL,
 * SMB, MQTT, Port scan). Fetches the protocol's insights + hits, and on failure
 * renders a clear retryable error instead of letting the page crash to the
 * global error boundary.
 */
export async function ProtocolServicePage({ protocol }: { protocol: ProtocolKind }) {
  const { sensorIds } = await effectiveSensorScope()
  try {
    const [insights, hitsPage] = await Promise.all([
      fetchProtocolInsights(protocol, sensorIds),
      fetchProtocolHits({ protocol, limit: 50 }, sensorIds),
    ])
    return <ProtocolDetailPage protocol={protocol} insights={insights} hits={hitsPage.data} />
  } catch {
    return (
      <PageShell>
        <SectionError
          title="Could not load this service"
          message="The server took too long or did not respond. This is usually temporary — retry in a few seconds."
        />
      </PageShell>
    )
  }
}

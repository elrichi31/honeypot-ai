import { fetchProtocolHits, fetchProtocolInsights } from "@/lib/api"
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
  try {
    const [insights, hitsPage] = await Promise.all([
      fetchProtocolInsights(protocol),
      fetchProtocolHits({ protocol, limit: 50 }),
    ])
    return <ProtocolDetailPage protocol={protocol} insights={insights} hits={hitsPage.data} />
  } catch {
    return (
      <PageShell>
        <SectionError
          title="No se pudo cargar este servicio"
          message="El servidor tardó demasiado o no respondió. Suele ser temporal — reintenta en unos segundos."
        />
      </PageShell>
    )
  }
}

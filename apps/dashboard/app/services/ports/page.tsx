import { fetchProtocolHits, fetchProtocolInsights } from "@/lib/api"
import { ProtocolDetailPage } from "../protocol-detail-page"

export default async function PortScanServicePage() {
  const [insights, hitsPage] = await Promise.all([
    fetchProtocolInsights("port-scan"),
    fetchProtocolHits({ protocol: "port-scan", limit: 50 }),
  ])

  return <ProtocolDetailPage protocol="port-scan" insights={insights} hits={hitsPage.data} />
}

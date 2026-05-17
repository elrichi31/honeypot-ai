import { fetchProtocolHits, fetchProtocolInsights } from "@/lib/api"
import { ProtocolDetailPage } from "../protocol-detail-page"

export default async function MqttServicePage() {
  const [insights, hitsPage] = await Promise.all([
    fetchProtocolInsights("mqtt"),
    fetchProtocolHits({ protocol: "mqtt", limit: 50 }),
  ])

  return <ProtocolDetailPage protocol="mqtt" insights={insights} hits={hitsPage.data} />
}

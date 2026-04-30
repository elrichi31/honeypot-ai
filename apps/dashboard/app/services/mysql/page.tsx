import { fetchProtocolHits, fetchProtocolInsights } from "@/lib/api"
import { ProtocolDetailPage } from "../protocol-detail-page"

export default async function MysqlServicePage() {
  const [insights, hitsPage] = await Promise.all([
    fetchProtocolInsights("mysql"),
    fetchProtocolHits({ protocol: "mysql", limit: 50 }),
  ])

  return <ProtocolDetailPage protocol="mysql" insights={insights} hits={hitsPage.data} />
}

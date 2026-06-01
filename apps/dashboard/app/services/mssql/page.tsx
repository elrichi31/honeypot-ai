export const dynamic = "force-dynamic"

import { fetchProtocolHits, fetchProtocolInsights } from "@/lib/api"
import { ProtocolDetailPage } from "../protocol-detail-page"

export default async function MssqlServicePage() {
  const [insights, hitsPage] = await Promise.all([
    fetchProtocolInsights("mssql"),
    fetchProtocolHits({ protocol: "mssql", limit: 50 }),
  ])

  return <ProtocolDetailPage protocol="mssql" insights={insights} hits={hitsPage.data} />
}

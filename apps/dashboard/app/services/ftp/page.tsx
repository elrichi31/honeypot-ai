import { fetchProtocolHits, fetchProtocolInsights } from "@/lib/api"
import { ProtocolDetailPage } from "../protocol-detail-page"

export default async function FtpServicePage() {
  const [insights, hitsPage] = await Promise.all([
    fetchProtocolInsights("ftp"),
    fetchProtocolHits({ protocol: "ftp", limit: 50 }),
  ])

  return <ProtocolDetailPage protocol="ftp" insights={insights} hits={hitsPage.data} />
}

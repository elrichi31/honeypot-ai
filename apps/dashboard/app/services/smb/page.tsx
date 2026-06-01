export const dynamic = "force-dynamic"

import { fetchProtocolHits, fetchProtocolInsights } from "@/lib/api"
import { ProtocolDetailPage } from "../protocol-detail-page"

export default async function SmbServicePage() {
  const [insights, hitsPage] = await Promise.all([
    fetchProtocolInsights("smb"),
    fetchProtocolHits({ protocol: "smb", limit: 50 }),
  ])

  return <ProtocolDetailPage protocol="smb" insights={insights} hits={hitsPage.data} />
}

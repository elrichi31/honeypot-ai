export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { PageShell } from "@/components/page-shell"
import { ComparisonExplorer } from "@/components/analytics/comparison-explorer"
import { requireRole } from "@/lib/roles"
import { getServerT } from "@/lib/i18n/server"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Sensor/Client Comparison — HoneyTrap",
}

// Superadmin-only: ingest-api's /analytics/comparison requires the
// control-plane token + a superadmin/global actor (see
// app/api/analytics/comparison/route.ts) — gate the page the same way so a
// non-superadmin gets redirected instead of an empty/403'd chart.
export default async function AnalyticsComparisonPage() {
  const auth = await requireRole("superadmin")
  if (!auth.ok) redirect("/")

  const t = await getServerT()

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("analytics.comparison.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("analytics.comparison.description")}</p>
      </div>
      <ComparisonExplorer />
    </PageShell>
  )
}

export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { KeyRound, Hourglass } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { Badge } from "@/components/ui/badge"
import { TrendsExplorer } from "@/components/analytics/trends-explorer"
import { requireRole } from "@/lib/roles"
import { getServerT } from "@/lib/i18n/server"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Data Analytics — HoneyTrap",
}

export default async function AnalyticsPage() {
  const auth = await requireRole("viewer")
  if (!auth.ok) redirect("/login")

  const t = await getServerT()

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("analytics.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("analytics.description")}</p>
      </div>

      <div className="space-y-4">
        <TrendsExplorer />

        {/* docs/plans/ANALYTICS_MODULE.md Fase B — not built yet. */}
        <Surface padded className="flex flex-col gap-3 md:max-w-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
            </div>
            <Badge variant="muted">
              <Hourglass className="h-3 w-3" />
              {t("analytics.comingSoon")}
            </Badge>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{t("analytics.credentials.title")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("analytics.credentials.description")}</p>
          </div>
        </Surface>
      </div>
    </PageShell>
  )
}

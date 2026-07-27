export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { TrendingUp, KeyRound, Hourglass } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { Badge } from "@/components/ui/badge"
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

  // docs/plans/ANALYTICS_MODULE.md Fase A/B — the two prioritized modules.
  // Placeholder cards until the ClickHouse-backed endpoints exist; this page
  // is just the sidebar entry point landing somewhere real instead of a 404.
  const upcoming = [
    { icon: TrendingUp, titleKey: "analytics.trends.title", descriptionKey: "analytics.trends.description" },
    { icon: KeyRound, titleKey: "analytics.credentials.title", descriptionKey: "analytics.credentials.description" },
  ] as const

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("analytics.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("analytics.description")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {upcoming.map(({ icon: Icon, titleKey, descriptionKey }) => (
          <Surface key={titleKey} padded className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <Badge variant="muted">
                <Hourglass className="h-3 w-3" />
                {t("analytics.comingSoon")}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{t(titleKey)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t(descriptionKey)}</p>
            </div>
          </Surface>
        ))}
      </div>

      <Surface variant="dashed" className="mt-4 flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-sm font-medium text-foreground">{t("analytics.emptyState.title")}</p>
        <p className="text-xs text-muted-foreground">{t("analytics.emptyState.description")}</p>
      </Surface>
    </PageShell>
  )
}

export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"
import { KeyRound, FileCode, GitCompare, ArrowRight } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { TrendsExplorer } from "@/components/analytics/trends-explorer"
import { requireRole } from "@/lib/roles"
import { getServerT } from "@/lib/i18n/server"
import { redirect } from "next/navigation"
import type { TranslationKey } from "@/lib/i18n/dictionaries"

export const metadata: Metadata = {
  title: "Data Analytics — HoneyTrap",
}

export default async function AnalyticsPage() {
  const auth = await requireRole("viewer")
  if (!auth.ok) redirect("/login")

  const t = await getServerT()

  const links: { href: string; icon: typeof KeyRound; titleKey: TranslationKey; descriptionKey: TranslationKey }[] = [
    { href: "/analytics/credentials", icon: KeyRound, titleKey: "analytics.credentials.title", descriptionKey: "analytics.credentials.pageDescription" },
    { href: "/analytics/suricata-trends", icon: FileCode, titleKey: "analytics.suricataTrends.title", descriptionKey: "analytics.suricataTrends.description" },
    ...(auth.isSuperadmin
      ? [{ href: "/analytics/comparison", icon: GitCompare, titleKey: "analytics.comparison.title" as TranslationKey, descriptionKey: "analytics.comparison.description" as TranslationKey }]
      : []),
  ]

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("analytics.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("analytics.description")}</p>
      </div>

      <div className="space-y-4">
        <TrendsExplorer />

        <div className="grid gap-4 md:grid-cols-3">
          {links.map(({ href, icon: Icon, titleKey, descriptionKey }) => (
            <Link key={href} href={href} className="group">
              <Surface padded className="flex h-full flex-col gap-3 transition-colors group-hover:border-border/80 group-hover:bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/40">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{t(titleKey)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t(descriptionKey)}</p>
                </div>
              </Surface>
            </Link>
          ))}
        </div>
      </div>
    </PageShell>
  )
}

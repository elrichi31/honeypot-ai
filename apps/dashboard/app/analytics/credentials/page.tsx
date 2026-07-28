export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { PageShell } from "@/components/page-shell"
import { CredentialsExplorerWrapper } from "@/components/analytics/credentials-explorer-wrapper"
import { requireRole } from "@/lib/roles"
import { getServerT } from "@/lib/i18n/server"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Credential Intelligence — HoneyTrap",
}

export default async function AnalyticsCredentialsPage() {
  const auth = await requireRole("viewer")
  if (!auth.ok) redirect("/login")

  const t = await getServerT()

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("analytics.credentials.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("analytics.credentials.pageDescription")}</p>
      </div>
      <CredentialsExplorerWrapper />
    </PageShell>
  )
}

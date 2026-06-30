export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { PageShell } from "@/components/page-shell"
import { ReportDownload } from "@/components/report-download"
import { requireRole } from "@/lib/roles"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { fetchClients } from "@/lib/api"
import type { Client } from "@/lib/api"
import { getServerT } from "@/lib/i18n/server"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Reports — HoneyTrap",
}

export default async function ReportsPage() {
  const auth = await requireRole("viewer")
  if (!auth.ok) redirect("/login")

  const t = await getServerT()
  const scope = await effectiveSensorScope()

  let clients: Client[] = []
  if (auth.isSuperadmin) {
    try {
      clients = await fetchClients()
    } catch {
      clients = []
    }
  }

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("reports.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("reports.description")}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <ReportDownload
          isSuperadmin={auth.isSuperadmin}
          clients={clients}
          scopedClientId={scope.clientId}
        />
      </div>
    </PageShell>
  )
}

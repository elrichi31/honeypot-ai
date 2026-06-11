import { ShieldAlert } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { DefenseStats } from "@/components/defense/defense-stats"
import { DefenseEventsTable } from "@/components/defense/defense-events-table"
import { BlockedIpsTable } from "@/components/defense/blocked-ips-table"
import { DefenseAllowlist } from "@/components/defense/defense-allowlist"
import { getServerT } from "@/lib/i18n/server"

export default async function ApiDefensePage() {
  const t = await getServerT()
  return (
    <PageShell>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <ShieldAlert className="h-5 w-5 text-red-400" />
          <h1 className="text-2xl font-semibold text-foreground">{t("defense.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("defense.subtitle")}
        </p>
      </div>

      <div className="mb-6"><DefenseStats /></div>
      <div className="mb-6"><DefenseEventsTable /></div>
      <div className="mb-6"><BlockedIpsTable /></div>
      <DefenseAllowlist />
    </PageShell>
  )
}

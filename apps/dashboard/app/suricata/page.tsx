import type { Metadata } from "next"
import { forbidCliente } from "@/lib/page-guards"
import { Shield } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { apiFetch, getApiUrl } from "@/lib/api/client"
import { getServerT } from "@/lib/i18n/server"
import { SuricataClient } from "./suricata-client"
import type { Stats } from "./types"

export const metadata: Metadata = {
  title: "Suricata IDS — HoneyTrap",
}

async function fetchInitialStats(): Promise<Stats | null> {
  try {
    return await apiFetch<Stats>(`${getApiUrl()}/suricata/stats?range=24h`, undefined, 10000)
  } catch {
    return null
  }
}

export default async function SuricataPage() {
  await forbidCliente()
  const [t, initialStats] = await Promise.all([getServerT(), fetchInitialStats()])

  return (
    <PageShell>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Shield className="h-5 w-5 text-blue-400" />
            <h1 className="text-2xl font-semibold text-foreground">{t("suricata.title")}</h1>
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">Suricata</span>
          </div>
          <p className="text-sm text-muted-foreground">{t("suricata.subtitle")}</p>
        </div>
      </div>
      <SuricataClient initialStats={initialStats} />
    </PageShell>
  )
}

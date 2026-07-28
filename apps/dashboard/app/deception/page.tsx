export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { Ghost } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { SectionError } from "@/components/section-error"
import { Surface } from "@/components/ui/surface"
import { fetchDeceptionNetworks } from "@/lib/api"
import { getServerT } from "@/lib/i18n/server"
import { ClientDeceptionCard } from "@/components/deception/client-deception-card"

export const metadata: Metadata = {
  title: "Deception Networks — HoneyTrap",
}

export default async function DeceptionPage() {
  const t = await getServerT()

  let networks
  try {
    networks = await fetchDeceptionNetworks()
  } catch {
    return (
      <PageShell>
        <SectionError title={t("deception.error.title")} message={t("deception.error.desc")} />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-3">
          <Ghost className="h-5 w-5 text-purple-400" />
          <h1 className="text-2xl font-semibold text-foreground">{t("deception.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{t("deception.subtitle")}</p>
      </div>

      {networks.length === 0 ? (
        <Surface className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
          <Ghost className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">{t("deception.networks.empty.title")}</p>
          <p className="max-w-md text-[13px] text-muted-foreground">{t("deception.networks.empty.desc")}</p>
        </Surface>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {networks.map((network) => (
            <ClientDeceptionCard key={network.clientId} network={network} />
          ))}
        </div>
      )}
    </PageShell>
  )
}

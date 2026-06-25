import type { Metadata } from "next"
import { PageShell } from "@/components/page-shell"
import { CredentialsView } from "@/components/credentials-view"
import { SectionError } from "@/components/section-error"
import { fetchCredentialsAnalytics, fetchClients, fetchSensors } from "@/lib/api"
import { ClientSensorFilter } from "@/components/client-sensor-filter"
import { getServerT } from "@/lib/i18n/server"
import { Surface } from "@/components/ui/surface"

const PAGE_SIZE_OPTIONS = new Set(["20", "30", "50", "100"])

export const metadata: Metadata = {
  title: "Credentials — HoneyTrap",
}

export default async function CredentialsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    mainTab?: string
    rankingType?: string
    outcome?: string
    frequency?: string
    search?: string
    sortBy?: string
    sortDir?: string
    clientSlug?: string
    sensorId?: string
  }>
}) {
  const t = await getServerT()
  const params = await searchParams
  const page = Number(params.page ?? "1")
  const pageSize = PAGE_SIZE_OPTIONS.has(params.pageSize ?? "") ? Number(params.pageSize) : 20
  const mainTab =
    params.mainTab === "patterns" || params.mainTab === "recent" ? params.mainTab : "rankings"
  const rankingType =
    params.rankingType === "passwords" || params.rankingType === "usernames"
      ? params.rankingType
      : "pairs"
  const outcome =
    params.outcome === "success" || params.outcome === "failed" ? params.outcome : "all"
  const frequency =
    params.frequency === "all" || params.frequency === "single" ? params.frequency : "reused"
  const sortDir = params.sortDir === "asc" ? "asc" : "desc"
  const clientSlug = params.clientSlug?.trim() || undefined
  const sensorId = params.sensorId?.trim() || undefined

  let analytics
  let clients: Awaited<ReturnType<typeof fetchClients>> = []
  let sensors: Awaited<ReturnType<typeof fetchSensors>> = []
  try {
    ;[analytics, clients, sensors] = await Promise.all([
      fetchCredentialsAnalytics({
        limit: 20,
        recentLimit: 20,
        page,
        pageSize,
        mainTab,
        rankingType,
        outcome,
        frequency,
        search: params.search?.trim() || undefined,
        sortBy: params.sortBy || undefined,
        sortDir,
        clientSlug,
        sensorId,
      }),
      fetchClients().catch(() => []),
      fetchSensors().catch(() => []),
    ])
  } catch {
    return (
      <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">{t("cred.title")}</h1>
        </div>
        <SectionError />
      </PageShell>
    )
  }

  return (
    <PageShell>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">{t("cred.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("cred.subtitle")}
          </p>
        </div>

        <Surface padded className="mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">{t("cred.filterLabel")}</span>
            <ClientSensorFilter
              clients={clients.map((c) => ({ slug: c.slug, name: c.name }))}
              sensors={sensors.map((s) => ({ sensorId: s.sensorId, name: s.name, protocol: s.protocol, clientSlug: s.clientSlug, clientName: s.clientName }))}
              webOnly={false}
            />
          </div>
        </Surface>

        <CredentialsView analytics={analytics} />
  </PageShell>
  )
}

import { PageShell } from "@/components/page-shell"
import { SessionsTable } from "@/components/sessions-table"
import { ErrorState } from "@/components/ui/data-states"
import { fetchSessionScanGroupsPage, fetchSessionsPage, fetchClients, fetchSensors } from "@/lib/api"
import { lookupIp } from "@/lib/geo"
import { ClientSensorFilter } from "@/components/client-sensor-filter"

const PAGE_SIZE_OPTIONS = new Set(["20", "30", "50", "100"])

const VALID_ACTORS = new Set(["all", "bot", "human", "unknown"])

const VALID_SORT_DIR = new Set(["asc", "desc"])

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    q?: string
    tab?: string
    actor?: string
    sortDir?: string
    clientSlug?: string
    sensorId?: string
  }>
}) {
  const params = await searchParams
  const page = Number(params.page ?? "1")
  const pageSize = PAGE_SIZE_OPTIONS.has(params.pageSize ?? "") ? Number(params.pageSize) : 20
  const tab = params.tab === "scans" ? "scans" : "sessions"
  const q = params.q?.trim() || undefined
  const actor = VALID_ACTORS.has(params.actor ?? "") ? params.actor as "all" | "bot" | "human" | "unknown" : undefined
  const sortDir = VALID_SORT_DIR.has(params.sortDir ?? "") ? (params.sortDir as "asc" | "desc") : "desc"
  const clientSlug = params.clientSlug?.trim() || undefined
  const sensorId = params.sensorId?.trim() || undefined

  let sessionPage: Awaited<ReturnType<typeof fetchSessionsPage>> | null = null
  let clients: Awaited<ReturnType<typeof fetchClients>> = []
  let sensors: Awaited<ReturnType<typeof fetchSensors>> = []
  try {
    ;[sessionPage, clients, sensors] = await Promise.all([
      tab === "scans"
        ? fetchSessionScanGroupsPage({ page, pageSize, q, clientSlug, sensorId })
        : fetchSessionsPage({ page, pageSize, q, outcome: "compromised", actor, sortDir, clientSlug, sensorId }),
      fetchClients().catch(() => []),
      fetchSensors().catch(() => []),
    ])
  } catch {
    return (
      <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Sessions</h1>
        </div>
        <ErrorState description="Could not fetch session data from the API." />
      </PageShell>
    )
  }
  const sessions = sessionPage.items

  const geoCache = new Map<string, { country: string; countryName: string } | null>()
  const geo = (ip: string) => {
    if (!geoCache.has(ip)) geoCache.set(ip, lookupIp(ip))
    return geoCache.get(ip)!
  }

  const sessionsList = sessions.map((session) => {
    const location = geo(session.srcIp)

    return {
      id: session.id,
      srcIp: session.srcIp,
      country: location?.country ?? null,
      countryName: location?.countryName ?? null,
      startTime: session.startedAt,
      endTime: session.endedAt ?? undefined,
      duration: session.durationSec,
      username: session.username ?? undefined,
      password: session.password ?? undefined,
      loginSuccess: session.loginSuccess ?? null,
      eventCount: session.eventCount,
      authAttemptCount: session.authAttemptCount,
      commandCount: session.commandCount,
      hassh: session.hassh ?? undefined,
      clientVersion: session.clientVersion ?? undefined,
      sessionType: session.sessionType ?? 'unknown',
      threatTags: session.threatTags ?? [],
    }
  })

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          {tab === "scans"
            ? `${sessionPage.summary.scanGroups.toLocaleString('en-US')} IPs with grouped scans · paginated view`
            : `${sessionPage.summary.compromised.toLocaleString('en-US')} compromised sessions · paginated view`}
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">Filtrar:</span>
          <ClientSensorFilter
            clients={clients.map((c) => ({ slug: c.slug, name: c.name }))}
            sensors={sensors.map((s) => ({ sensorId: s.sensorId, name: s.name, protocol: s.protocol, clientSlug: s.clientSlug, clientName: s.clientName }))}
            webOnly={false}
          />
        </div>
      </div>

      <SessionsTable
        sessions={sessionsList}
        showAll
        tab={tab}
        searchQuery={q ?? ""}
        actor={actor ?? "all"}
        summary={sessionPage.summary}
        pagination={sessionPage.pagination}
        clientSlug={clientSlug}
        sensorId={sensorId}
      />
    </PageShell>
  )
}

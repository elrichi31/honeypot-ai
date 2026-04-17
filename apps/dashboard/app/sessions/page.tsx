import { PageShell } from "@/components/page-shell"
import { SessionsTable } from "@/components/sessions-table"
import { fetchSessionsPage } from "@/lib/api"
import { lookupIp } from "@/lib/geo"

const PAGE_SIZE_OPTIONS = new Set(["50", "100", "200"])

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    q?: string
    tab?: string
  }>
}) {
  const params = await searchParams
  const page = Number(params.page ?? "1")
  const pageSize = PAGE_SIZE_OPTIONS.has(params.pageSize ?? "") ? Number(params.pageSize) : 50
  const tab = params.tab === "scans" ? "scans" : "sessions"
  const q = params.q?.trim() || undefined

  const sessionPage = await fetchSessionsPage({
    page,
    pageSize,
    q,
    outcome: tab === "scans" ? "blocked" : "compromised",
  })
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
    }
  })

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          {sessionPage.summary.total.toLocaleString()} sesiones registradas · vista paginada y filtrable
        </p>
      </div>

      <SessionsTable
        sessions={sessionsList}
        showAll
        tab={tab}
        searchQuery={q ?? ""}
        summary={sessionPage.summary}
        pagination={sessionPage.pagination}
      />
    </PageShell>
  )
}

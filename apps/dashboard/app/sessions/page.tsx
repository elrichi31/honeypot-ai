import { AppSidebar } from "@/components/app-sidebar"
import { SessionsTable } from "@/components/sessions-table"
import { fetchSessions } from "@/lib/api"
import { lookupIp } from "@/lib/geo"

export default async function SessionsPage() {
  const sessions = await fetchSessions({ limit: 500 })

  // Cache geo lookups (many sessions share the same IP)
  const geoCache = new Map<string, { country: string; countryName: string } | null>()
  const geo = (ip: string) => {
    if (!geoCache.has(ip)) geoCache.set(ip, lookupIp(ip))
    return geoCache.get(ip)!
  }

  const sessionsList = sessions.map((s) => {
    const location = geo(s.srcIp)
    const durationSec =
      s.endedAt
        ? Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)
        : null

    return {
      id: s.id,
      srcIp: s.srcIp,
      country: location?.country ?? null,
      countryName: location?.countryName ?? null,
      startTime: s.startedAt,
      endTime: s.endedAt ?? undefined,
      duration: durationSec,
      username: s.username ?? undefined,
      password: s.password ?? undefined,
      loginSuccess: s.loginSuccess ?? null,
      eventCount: s._count.events,
      hassh: s.hassh ?? undefined,
      clientVersion: s.clientVersion ?? undefined,
    }
  })

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="ml-60 flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Sessions</h1>
          <p className="text-sm text-muted-foreground">
            {sessions.length} sessions recorded · click a row to expand the event timeline
          </p>
        </div>
        <SessionsTable sessions={sessionsList} showAll />
      </main>
    </div>
  )
}

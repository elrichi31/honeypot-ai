import type { Metadata } from "next"
import { PageShell } from "@/components/page-shell"
import { CampaignsView } from "@/components/campaigns-view"
import { SectionError } from "@/components/section-error"
import { fetchSessions, fetchSessionCommands } from "@/lib/api"
import { effectiveSensorScope } from "@/lib/tenant-scope"

const RANGE_TO_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "all": 0,
}

function rangeToDateParams(range: string): { startDate?: string; endDate?: string } {
  const days = RANGE_TO_DAYS[range]
  if (days === undefined || days === 0) return {}
  const start = new Date()
  start.setDate(start.getDate() - days)
  return { startDate: start.toISOString() }
}

export const metadata: Metadata = {
  title: "Attack Campaigns — HoneyTrap",
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp = await searchParams
  const range = sp.range && RANGE_TO_DAYS[sp.range] !== undefined ? sp.range : "30d"
  const dateParams = rangeToDateParams(range)

  const { sensorIds } = await effectiveSensorScope()

  let sessions, commandsMap
  try {
    [sessions, commandsMap] = await Promise.all([
      fetchSessions({ limit: 2000, ...dateParams }, sensorIds),
      fetchSessionCommands(),
    ])
  } catch {
    return (
      <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Campaigns</h1>
        </div>
        <SectionError />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Campaigns</h1>
        <p className="text-sm text-muted-foreground">
          Detect repeat attackers and behavioral clusters across sessions
        </p>
      </div>
      <CampaignsView sessions={sessions} commandsMap={commandsMap} range={range} />
    </PageShell>
  )
}

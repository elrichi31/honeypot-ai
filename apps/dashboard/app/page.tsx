import { Suspense } from "react"
import { PageShell } from "@/components/page-shell"
import { DashboardInsightsView } from "@/components/dashboard-insights"
import { ActivityChart } from "@/components/activity-chart"
import { GlobeMap } from "@/components/globe-map"
import { AttackHeatmap } from "@/components/attack-heatmap"
import { fetchDashboardInsights, fetchOverviewStats, fetchGeoSummary } from "@/lib/api"
import { lookupIp, geolocateIps } from "@/lib/geo"
import { readConfig } from "@/lib/server-config"
import type { TimeRange } from "@/lib/types"

interface CountrySuccessRow {
  country: string
  countryName: string
  sessions: number
  successes: number
  uniqueIps: number
  successRate: number
}

interface CampaignGeoRow {
  bucketStart: string
  username: string | null
  password: string | null
  attempts: number
  successCount: number
  uniqueIps: number
  ips: string[]
  countries: string[]
  countryCount: number
  successRate: number
}

function getDateRange(range: TimeRange): { startDate: string; endDate: string } {
  const now = new Date()
  const end = now.toISOString()
  const start = new Date(now)

  if (range === "week") {
    start.setDate(start.getDate() - 6)
  } else if (range === "month") {
    start.setDate(start.getDate() - 29)
  } else {
    start.setHours(start.getHours() - 23)
  }

  return { startDate: start.toISOString(), endDate: end }
}

function buildCountrySuccess(
  candidates: Awaited<ReturnType<typeof fetchDashboardInsights>>["countrySuccessCandidates"],
): CountrySuccessRow[] {
  const geoCache = new Map<string, ReturnType<typeof lookupIp>>()
  const countryMap = new Map<
    string,
    { countryName: string; sessions: number; successes: number; uniqueIps: Set<string> }
  >()

  const geo = (ip: string) => {
    if (!geoCache.has(ip)) geoCache.set(ip, lookupIp(ip))
    return geoCache.get(ip) ?? null
  }

  for (const candidate of candidates) {
    const location = geo(candidate.srcIp)
    if (!location?.country) continue

    if (!countryMap.has(location.country)) {
      countryMap.set(location.country, {
        countryName: location.countryName,
        sessions: 0,
        successes: 0,
        uniqueIps: new Set<string>(),
      })
    }

    const entry = countryMap.get(location.country)!
    entry.sessions += candidate.sessions
    entry.successes += candidate.successes
    entry.uniqueIps.add(candidate.srcIp)
  }

  return Array.from(countryMap.entries())
    .map(([country, entry]) => ({
      country,
      countryName: entry.countryName,
      sessions: entry.sessions,
      successes: entry.successes,
      uniqueIps: entry.uniqueIps.size,
      successRate: entry.sessions > 0 ? Number(((entry.successes / entry.sessions) * 100).toFixed(1)) : 0,
    }))
    .filter((row) => row.sessions >= 20 && row.uniqueIps >= 2)
    .sort((a, b) => b.successRate - a.successRate || b.successes - a.successes)
    .slice(0, 12)
}

function buildCampaignGeo(
  campaigns: Awaited<ReturnType<typeof fetchDashboardInsights>>["credentialCampaigns"],
): CampaignGeoRow[] {
  const geoCache = new Map<string, ReturnType<typeof lookupIp>>()
  const geo = (ip: string) => {
    if (!geoCache.has(ip)) geoCache.set(ip, lookupIp(ip))
    return geoCache.get(ip) ?? null
  }

  return campaigns
    .map((campaign) => {
      const countries = Array.from(
        new Set(
          campaign.ips
            .map((ip) => geo(ip)?.country)
            .filter((country): country is string => Boolean(country)),
        ),
      )

      return {
        ...campaign,
        countries,
        countryCount: countries.length,
        successRate: campaign.attempts > 0 ? Number(((campaign.successCount / campaign.attempts) * 100).toFixed(1)) : 0,
      }
    })
    .sort((a, b) => b.uniqueIps - a.uniqueIps || b.countryCount - a.countryCount || b.attempts - a.attempts)
    .slice(0, 12)
}

function percent(part: number, whole: number) {
  if (!whole) return "0"
  return ((part / whole) * 100).toFixed(1)
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const params = await searchParams
  const range: TimeRange =
    params.range === "week" || params.range === "month" ? params.range : "week"

  const config = readConfig()
  const timezone = config.timezone ?? process.env.DASHBOARD_TIMEZONE ?? "UTC"
  const { startDate, endDate } = getDateRange(range)

  const [insights, overviewStats, geoData] = await Promise.all([
    fetchDashboardInsights(),
    fetchOverviewStats({ startDate, endDate, range, timezone }),
    fetchGeoSummary(),
  ])

  const countryAttacks = geolocateIps(geoData)
  const countrySuccess = buildCountrySuccess(insights.countrySuccessCandidates)
  const campaignGeo = buildCampaignGeo(insights.credentialCampaigns)

  const compromiseRate = percent(insights.funnel.loginSuccess, insights.funnel.authAttempts)

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Análisis de profundidad · campañas · comportamiento post-login
        </p>
      </div>

      {/* Top-level KPI strip */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sesiones totales</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {insights.window.totalSessions.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {insights.window.uniqueIps.toLocaleString('en-US')} IPs únicas observadas
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tasa de compromiso</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{compromiseRate}%</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {insights.funnel.loginSuccess.toLocaleString('en-US')} logins exitosos
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Alta amenaza</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {insights.funnel.highSignalCompromise.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sesiones con backdoor, miner, malware drop
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Post-login profundo</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {insights.successfulDepth.interactiveSessions.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sesiones con 20+ comandos · máx {insights.successfulDepth.maxCommands}
          </p>
        </div>
      </div>

      {/* All high-signal analytics */}
      <DashboardInsightsView
        insights={insights}
        countrySuccess={countrySuccess}
        campaignGeo={campaignGeo}
      />

      {/* Activity timeline */}
      <div className="mt-6">
        <Suspense fallback={<div className="h-[284px] rounded-xl border border-border bg-card" />}>
          <ActivityChart stats={overviewStats} range={range} />
        </Suspense>
      </div>

      {/* Globe map */}
      <div className="mt-6">
        <GlobeMap countryAttacks={countryAttacks} />
      </div>

      {/* Attack heatmap */}
      <div className="relative mt-6">
        <AttackHeatmap days={90} />
      </div>
    </PageShell>
  )
}

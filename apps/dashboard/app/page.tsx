export const dynamic = "force-dynamic"

import { Suspense } from "react"
import Link from "next/link"
import { Terminal, Radar } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { DashboardInsightsView } from "@/components/dashboard-insights"
import { CrossSensorActivityChart } from "@/components/cross-sensor-activity-chart"
import { ProtocolDistributionChart } from "@/components/protocol-distribution-chart"
import { GlobeMap } from "@/components/globe-map"
import { AttackHeatmap } from "@/components/attack-heatmap"
import { SensorActivityGrid } from "@/components/sensor-activity-grid"
import { SectionError } from "@/components/section-error"
import {
  fetchDashboardInsights,
  fetchGeoSummary,
  fetchHoneypotOverview,
  fetchCrossSensorTimeline,
} from "@/lib/api"
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

const SECTION_PLACEHOLDER = "h-[500px] rounded-xl border border-border bg-card animate-pulse"

// Each section below fetches its own slice and catches its own errors, so a slow
// or failing endpoint degrades only that card — the rest of the dashboard still
// renders. Wrapped in <Suspense> at the page level, they also stream in
// independently instead of blocking the whole page on the slowest fetch.

async function OverviewSection() {
  let overview
  try {
    overview = await fetchHoneypotOverview()
  } catch {
    return <SectionError title="No se pudieron cargar las métricas" />
  }

  const activeSources = overview.totals.activeSources
  const totalEvents = overview.totals.events

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total events</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{totalEvents.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeSources} sensor{activeSources !== 1 ? "s" : ""} reporting
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">SSH sessions</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{overview.ssh.sessions.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {overview.ssh.uniqueIps.toLocaleString("en-US")} IPs · {overview.ssh.successfulLogins.toLocaleString("en-US")} compromised
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Web attacks</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{overview.web.hits.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {overview.web.uniqueIps.toLocaleString("en-US")} IPs
            {overview.web.topAttackType ? ` · top: ${overview.web.topAttackType}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Active sources</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{activeSources.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-muted-foreground">Sensors reporting in the window</p>
        </div>
      </div>

      <SensorActivityGrid overview={overview} />

      <div className="mb-6">
        <ProtocolDistributionChart overview={overview} />
      </div>
    </>
  )
}

async function CrossTimelineSection({ timezone }: { timezone: string }) {
  let crossTimeline
  try {
    crossTimeline = await fetchCrossSensorTimeline({ range: "day", timezone })
  } catch {
    return <SectionError title="No se pudo cargar la actividad cross-sensor" />
  }
  return <CrossSensorActivityChart timeline={crossTimeline} range="day" />
}

async function GlobeSection() {
  let geoData
  try {
    geoData = await fetchGeoSummary()
  } catch {
    return <SectionError title="No se pudo cargar el mapa de ataques" />
  }
  return <GlobeMap countryAttacks={geolocateIps(geoData)} />
}

async function InsightsSection() {
  let insights
  try {
    insights = await fetchDashboardInsights()
  } catch {
    return <SectionError title="No se pudo cargar el análisis SSH" />
  }
  return (
    <DashboardInsightsView
      insights={insights}
      countrySuccess={buildCountrySuccess(insights.countrySuccessCandidates)}
      campaignGeo={buildCampaignGeo(insights.credentialCampaigns)}
    />
  )
}

export default function DashboardPage() {
  const config = readConfig()
  const timezone = config.timezone ?? process.env.DASHBOARD_TIMEZONE ?? "UTC"

  return (
    <PageShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Honeypot activity across all sensors</p>
        </div>
        <Link
          href="/live"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/40"
        >
          <Radar className="h-4 w-4 text-cyan-400" />
          Live Map
        </Link>
      </div>

      {/* KPIs + per-sensor grid + protocol distribution */}
      <Suspense fallback={<div className={SECTION_PLACEHOLDER} />}>
        <OverviewSection />
      </Suspense>

      {/* Cross-sensor activity timeline */}
      <div className="mb-6">
        <Suspense fallback={<div className="h-[500px] rounded-xl border border-border bg-card animate-pulse" />}>
          <CrossTimelineSection timezone={timezone} />
        </Suspense>
      </div>

      {/* Globe map */}
      <div className="mb-6">
        <Suspense fallback={<div className="h-[400px] rounded-xl border border-border bg-card animate-pulse" />}>
          <GlobeSection />
        </Suspense>
      </div>

      {/* SSH deep analysis */}
      <div className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            SSH Analysis
          </h2>
        </div>
        <Suspense fallback={<div className={SECTION_PLACEHOLDER} />}>
          <InsightsSection />
        </Suspense>
      </div>

      {/* Attack heatmap (self-contained, client-fetched) */}
      <div className="relative mt-6">
        <AttackHeatmap days={90} />
      </div>
    </PageShell>
  )
}

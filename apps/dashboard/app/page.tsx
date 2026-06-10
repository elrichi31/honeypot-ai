export const dynamic = "force-dynamic"

import { Suspense } from "react"
import Link from "next/link"
import { Terminal, Radar } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { DashboardInsightsView } from "@/components/dashboard-insights"
import { CrossSensorActivityChart } from "@/components/cross-sensor-activity-chart"
import { ProtocolDistributionChart } from "@/components/protocol-distribution-chart"
import { GlobeMap } from "@/components/globe-map"
import { AttackHeatmap } from "@/components/attack-heatmap"
import { SensorActivityGrid } from "@/components/sensor-activity-grid"
import { SectionError } from "@/components/section-error"
import { SectionLoading } from "@/components/section-loading"
import {
  fetchDashboardInsights,
  fetchGeoSummary,
  fetchHoneypotOverview,
  fetchCrossSensorTimeline,
} from "@/lib/api"
import { lookupIp, geolocateIps } from "@/lib/geo"
import { readConfig } from "@/lib/server-config"
import { getServerT } from "@/lib/i18n/server"

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

// Each section below fetches its own slice and catches its own errors, so a slow
// or failing endpoint degrades only that card — the rest of the dashboard still
// renders. Wrapped in <Suspense> at the page level, they also stream in
// independently instead of blocking the whole page on the slowest fetch.

async function OverviewSection() {
  const t = await getServerT()
  let overview
  try {
    overview = await fetchHoneypotOverview()
  } catch {
    return <SectionError title={t("dash.error.metrics")} />
  }

  const activeSources = overview.totals.activeSources
  const totalEvents = overview.totals.events

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Surface padded>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("dash.kpi.totalEvents")}</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{totalEvents.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("dash.kpi.sensorsReporting", { n: activeSources })}
          </p>
        </Surface>
        <Surface padded>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("dash.kpi.sshSessions")}</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{overview.ssh.sessions.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("dash.kpi.sshDetail", {
              ips: overview.ssh.uniqueIps.toLocaleString("en-US"),
              n: overview.ssh.successfulLogins.toLocaleString("en-US"),
            })}
          </p>
        </Surface>
        <Surface padded>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("dash.kpi.webAttacks")}</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{overview.web.hits.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("dash.kpi.webIps", { ips: overview.web.uniqueIps.toLocaleString("en-US") })}
            {overview.web.topAttackType ? t("dash.kpi.webTopSuffix", { type: overview.web.topAttackType }) : ""}
          </p>
        </Surface>
        <Surface padded>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("dash.kpi.activeSources")}</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{activeSources.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("dash.kpi.sensorsInWindow")}</p>
        </Surface>
      </div>

      <SensorActivityGrid overview={overview} />

      <div className="mb-6">
        <ProtocolDistributionChart overview={overview} />
      </div>
    </>
  )
}

async function CrossTimelineSection({ timezone }: { timezone: string }) {
  const t = await getServerT()
  let crossTimeline
  try {
    crossTimeline = await fetchCrossSensorTimeline({ range: "day", timezone })
  } catch {
    return <SectionError title={t("dash.error.crossSensor")} />
  }
  return <CrossSensorActivityChart timeline={crossTimeline} range="day" />
}

async function GlobeSection() {
  const t = await getServerT()
  let geoData
  try {
    geoData = await fetchGeoSummary()
  } catch {
    return <SectionError title={t("dash.error.map")} />
  }
  return <GlobeMap countryAttacks={geolocateIps(geoData)} />
}

async function InsightsSection() {
  const t = await getServerT()
  let insights
  try {
    insights = await fetchDashboardInsights()
  } catch {
    return <SectionError title={t("dash.error.sshAnalysis")} />
  }
  return (
    <DashboardInsightsView
      insights={insights}
      countrySuccess={buildCountrySuccess(insights.countrySuccessCandidates)}
      campaignGeo={buildCampaignGeo(insights.credentialCampaigns)}
    />
  )
}

export default async function DashboardPage() {
  const t = await getServerT()
  const config = readConfig()
  const timezone = config.timezone ?? process.env.DASHBOARD_TIMEZONE ?? "UTC"

  return (
    <PageShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("dash.header.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("dash.header.subtitle")}</p>
        </div>
        <Link
          href="/live"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/40"
        >
          <Radar className="h-4 w-4 text-cyan-400" />
          {t("dash.header.liveMap")}
        </Link>
      </div>

      {/* KPIs + per-sensor grid + protocol distribution */}
      <Suspense fallback={<SectionLoading label={t("dash.loading.metrics")} />}>
        <OverviewSection />
      </Suspense>

      {/* Cross-sensor activity timeline */}
      <div className="mb-6">
        <Suspense fallback={<SectionLoading label={t("dash.loading.activity")} />}>
          <CrossTimelineSection timezone={timezone} />
        </Suspense>
      </div>

      {/* Globe map */}
      <div className="mb-6">
        <Suspense fallback={<SectionLoading height="h-[400px]" label={t("dash.loading.map")} />}>
          <GlobeSection />
        </Suspense>
      </div>

      {/* SSH deep analysis */}
      <div className="mb-6">
        <div className="mb-4 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {t("dash.section.sshAnalysis")}
          </h2>
        </div>
        <Suspense fallback={<SectionLoading label={t("dash.loading.sshAnalysis")} />}>
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

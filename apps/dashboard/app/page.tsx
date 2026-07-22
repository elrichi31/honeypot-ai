export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { Terminal, Radar } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { DashboardInsightsView } from "@/components/dashboard-insights"
import { KpiCard } from "@/components/kpi-card"
import { MitreMatrixView } from "@/components/insights/mitre-matrix"
import { GlobeMap } from "@/components/globe-map"
import { AttackHeatmap } from "@/components/attack-heatmap"
import { SensorActivityGrid } from "@/components/sensor-activity-grid"
import { ServiceHighlights } from "@/components/service-highlights"
import { SectionError } from "@/components/section-error"
import { SectionLoading } from "@/components/section-loading"
import {
  fetchDashboardInsights,
  fetchGeoSummary,
  fetchHoneypotOverview,
  fetchCrossSensorTimeline,
  fetchKpiTrends,
  fetchMitreMatrix,
  fetchNovelty,
  fetchBotRatio,
  fetchProtocolStats,
  fetchProtocolInsights,
} from "@/lib/api"
import type { KpiTrends } from "@/lib/api"
import { lookupIp, geolocateIps } from "@/lib/geo"
import { readConfig } from "@/lib/server-config"
import { getServerT } from "@/lib/i18n/server"
import { fetchAttackerIntel } from "@/lib/attacker-intel"
import { effectiveSensorScope } from "@/lib/tenant-scope"
import { NoveltyStatsView } from "@/components/insights/novelty-stats"
import { AttackerIntelView } from "@/components/insights/attacker-intel"
import nextDynamic from "next/dynamic"

// Code-split the recharts-heavy client components. No `ssr: false` here: that is
// disallowed in Server Components in Next 16, and these are already client
// components ("use client") rendered inside <Suspense> sections.
const CrossSensorActivityChart = nextDynamic(
  () => import("@/components/cross-sensor-activity-chart").then(m => ({ default: m.CrossSensorActivityChart })),
)
const ProtocolDistributionChart = nextDynamic(
  () => import("@/components/protocol-distribution-chart").then(m => ({ default: m.ProtocolDistributionChart })),
)
const BotRatioView = nextDynamic(
  () => import("@/components/insights/bot-ratio").then(m => ({ default: m.BotRatioView })),
)

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
  const { sensorIds } = await effectiveSensorScope()
  let overview
  try {
    overview = await fetchHoneypotOverview(sensorIds)
  } catch (err) {
    console.error("[dashboard] OverviewSection failed:", err)
    return <SectionError title={t("dash.error.metrics")} />
  }

  // Trends are a 24h-vs-prev-24h enrichment layer. If the endpoint fails the
  // KPIs still render with the 90d overview totals and null deltas (no spark).
  const empty = { current: 0, previous: 0, deltaPct: null, spark: [] as number[] }
  let trends: KpiTrends = { events: empty, sshSessions: empty, webHits: empty, uniqueIps: empty }
  try {
    trends = await fetchKpiTrends(sensorIds)
  } catch (err) {
    // degrade silently in the UI — deltas show "—" — but still log so a real
    // bug (not just a timeout) doesn't go unnoticed.
    console.error("[dashboard] OverviewSection kpi-trends failed:", err)
  }

  const activeSources = overview.totals.activeSources
  const totalEvents = overview.totals.events

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t("dash.kpi.totalEvents")}
          value={totalEvents}
          detail={t("dash.kpi.sensorsReporting", { n: activeSources })}
          deltaPct={trends.events.deltaPct}
          previous={trends.events.previous}
          spark={trends.events.spark}
        />
        <KpiCard
          label={t("dash.kpi.sshSessions")}
          value={overview.ssh.sessions}
          detail={t("dash.kpi.sshDetail", {
            ips: overview.ssh.uniqueIps.toLocaleString("en-US"),
            n: overview.ssh.successfulLogins.toLocaleString("en-US"),
          })}
          deltaPct={trends.sshSessions.deltaPct}
          previous={trends.sshSessions.previous}
          spark={trends.sshSessions.spark}
        />
        <KpiCard
          label={t("dash.kpi.webAttacks")}
          value={overview.web.hits}
          detail={
            t("dash.kpi.webIps", { ips: overview.web.uniqueIps.toLocaleString("en-US") }) +
            (overview.web.topAttackType ? t("dash.kpi.webTopSuffix", { type: overview.web.topAttackType }) : "")
          }
          deltaPct={trends.webHits.deltaPct}
          previous={trends.webHits.previous}
          spark={trends.webHits.spark}
        />
        <KpiCard
          label={t("dash.kpi.activeSources")}
          value={activeSources}
          detail={t("dash.kpi.sensorsInWindow")}
          deltaPct={null}
          spark={[]}
        />
      </div>

      <SensorActivityGrid overview={overview} trends={trends} />

      <div className="mb-6">
        <ProtocolDistributionChart overview={overview} />
      </div>
    </>
  )
}

async function CrossTimelineSection({ timezone }: { timezone: string }) {
  const t = await getServerT()
  const { sensorIds } = await effectiveSensorScope()
  let crossTimeline
  try {
    crossTimeline = await fetchCrossSensorTimeline({ range: "day", timezone, sensorIds })
  } catch (err) {
    console.error("[dashboard] CrossTimelineSection failed:", err)
    return <SectionError title={t("dash.error.crossSensor")} />
  }
  return <CrossSensorActivityChart timeline={crossTimeline} range="day" />
}

async function GlobeSection() {
  const t = await getServerT()
  const { sensorIds } = await effectiveSensorScope()
  let geoData
  try {
    geoData = await fetchGeoSummary(sensorIds)
  } catch (err) {
    console.error("[dashboard] GlobeSection failed:", err)
    return <SectionError title={t("dash.error.map")} />
  }
  return <GlobeMap countryAttacks={geolocateIps(geoData)} />
}

async function MitreSection() {
  const t = await getServerT()
  const { sensorIds } = await effectiveSensorScope()
  let matrix
  try {
    matrix = await fetchMitreMatrix(sensorIds)
  } catch (err) {
    console.error("[dashboard] MitreSection failed:", err)
    return <SectionError title={t("dash.error.mitre")} />
  }
  return <MitreMatrixView matrix={matrix} />
}

async function InsightsSection() {
  const t = await getServerT()
  const { sensorIds } = await effectiveSensorScope()
  let insights
  try {
    insights = await fetchDashboardInsights(sensorIds)
  } catch (err) {
    console.error("[dashboard] InsightsSection failed:", err)
    return <SectionError title={t("dash.error.sshAnalysis")} />
  }
  // Every card in this section is SSH-derived (credential campaigns, command
  // paths, session depth). Clients without an SSH honeypot would just see empty
  // shells, so hide the whole block — header included — when there's no SSH.
  if (insights.window.totalSessions === 0) return null
  return (
    <div className="mb-6">
      <div className="mb-4 flex items-center gap-2">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {t("dash.section.sshAnalysis")}
        </h2>
      </div>
      <DashboardInsightsView
        insights={insights}
        countrySuccess={buildCountrySuccess(insights.countrySuccessCandidates)}
        campaignGeo={buildCampaignGeo(insights.credentialCampaigns)}
      />
    </div>
  )
}

async function ServiceHighlightsSection() {
  const t = await getServerT()
  const { sensorIds } = await effectiveSensorScope()
  try {
    const stats = await fetchProtocolStats(sensorIds)
    const top = stats.filter((s) => s.count > 0).sort((a, b) => b.count - a.count).slice(0, 4)
    if (top.length === 0) return null

    // Per-protocol catch: a single slow/failing /insights endpoint drops that
    // one card instead of throwing out of the whole section (an uncaught throw
    // here bubbles to the route error boundary and blanks the entire page).
    const services = (
      await Promise.all(
        top.map(async (stat) => {
          try {
            return { stat, insights: await fetchProtocolInsights(stat.protocol, sensorIds) }
          } catch (err) {
            console.error(`[dashboard] ServiceHighlights insights failed for ${stat.protocol}:`, err)
            return null
          }
        }),
      )
    ).filter((s): s is NonNullable<typeof s> => s !== null)

    if (services.length === 0) return null
    return <ServiceHighlights services={services} />
  } catch (err) {
    console.error("[dashboard] ServiceHighlightsSection failed:", err)
    return <SectionError title={t("dash.error.services")} />
  }
}

async function NoveltySection() {
  const t = await getServerT()
  const { sensorIds } = await effectiveSensorScope()
  try {
    const novelty = await fetchNovelty(24, sensorIds)
    return <NoveltyStatsView novelty={novelty} />
  } catch (err) {
    console.error("[dashboard] NoveltySection failed:", err)
    return <SectionError title={t("dash.error.novelty")} />
  }
}

async function AttackerIntelSection() {
  const t = await getServerT()
  const { sensorIds } = await effectiveSensorScope()
  try {
    const geoData = await fetchGeoSummary(sensorIds)
    const activeIps = geoData.map((r) => r.srcIp).filter(Boolean)
    const intel = await fetchAttackerIntel(activeIps)
    return <AttackerIntelView intel={intel} />
  } catch (err) {
    console.error("[dashboard] AttackerIntelSection failed:", err)
    return <SectionError title={t("dash.error.attackerIntel")} />
  }
}

async function BotRatioSection() {
  const t = await getServerT()
  const { sensorIds } = await effectiveSensorScope()
  try {
    const ratio = await fetchBotRatio(sensorIds)
    return <BotRatioView ratio={ratio} />
  } catch (err) {
    console.error("[dashboard] BotRatioSection failed:", err)
    return <SectionError title={t("dash.error.botRatio")} />
  }
}

export const metadata: Metadata = {
  title: "Overview — HoneyTrap",
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

      {/* Per-sensor highlights for non-SSH honeypots (FTP, MySQL, SMB, …) */}
      <Suspense fallback={<SectionLoading label={t("dash.loading.services")} />}>
        <ServiceHighlightsSection />
      </Suspense>

      {/* SSH deep analysis — header + content self-gate when there's no SSH */}
      <Suspense fallback={<SectionLoading label={t("dash.loading.sshAnalysis")} />}>
        <InsightsSection />
      </Suspense>

      {/* Threat Intelligence — novelty, attacker infrastructure, bot/human */}
      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Suspense fallback={<SectionLoading label={t("dash.loading.novelty")} />}>
          <NoveltySection />
        </Suspense>
        <Suspense fallback={<SectionLoading label={t("dash.loading.attackerIntel")} />}>
          <AttackerIntelSection />
        </Suspense>
        <Suspense fallback={<SectionLoading label={t("dash.loading.botRatio")} />}>
          <BotRatioSection />
        </Suspense>
      </div>

      {/* MITRE ATT&CK technique matrix */}
      <div className="mb-6">
        <Suspense fallback={<SectionLoading label={t("dash.loading.mitre")} />}>
          <MitreSection />
        </Suspense>
      </div>

      {/* Attack heatmap (self-contained, client-fetched) */}
      <div className="relative mt-6">
        <AttackHeatmap days={90} />
      </div>
    </PageShell>
  )
}

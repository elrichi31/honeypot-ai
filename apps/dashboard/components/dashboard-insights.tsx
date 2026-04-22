"use client"

import Link from "next/link"
import {
  ArrowRight,
  Crosshair,
  Fingerprint,
  Globe2,
  Layers3,
  Route,
  Workflow,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { TooltipProps } from "recharts"
import type { DashboardInsights } from "@/lib/api"

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

interface Props {
  insights: DashboardInsights
  countrySuccess: CountrySuccessRow[]
  campaignGeo: CampaignGeoRow[]
}

const DEPTH_BUCKET_ORDER = ["0", "1-3", "4-10", "11-20", "21+"]
const FUNNEL_COLORS = ["#60a5fa", "#38bdf8", "#34d399", "#f59e0b", "#ef4444"]

function percent(part: number, whole: number) {
  if (!whole) return 0
  return Number(((part / whole) * 100).toFixed(1))
}

function formatCredential(username: string | null, password: string | null) {
  const user = username?.trim() || "?"
  const pass = password?.trim() || "?"
  return `${user}:${pass}`
}

function formatDateLabel(value: string | null) {
  if (!value) return "n/a"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function truncateSequence(sequence: string, max = 96) {
  if (sequence.length <= max) return sequence
  return `${sequence.slice(0, max - 1)}...`
}

function countryFlag(code: string) {
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
}

function CountryRateTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null

  const row = payload[0]?.payload as CountrySuccessRow | undefined
  if (!row) return null

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-2xl">
      <p className="text-sm font-medium text-foreground">
        {countryFlag(row.country)} {row.countryName}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {row.sessions} sessions · {row.uniqueIps} IPs
      </p>
      <p className="mt-2 text-sm font-semibold text-emerald-400">
        {row.successRate}% success
      </p>
    </div>
  )
}

export function DashboardInsightsView({ insights, countrySuccess, campaignGeo }: Props) {
  const funnelStages = [
    {
      label: "Connections",
      count: insights.funnel.connections,
      conversion: 100,
    },
    {
      label: "Tried auth",
      count: insights.funnel.authAttempts,
      conversion: percent(insights.funnel.authAttempts, insights.funnel.connections),
    },
    {
      label: "Successful login",
      count: insights.funnel.loginSuccess,
      conversion: percent(insights.funnel.loginSuccess, insights.funnel.authAttempts),
    },
    {
      label: "Executed commands",
      count: insights.funnel.commands,
      conversion: percent(insights.funnel.commands, insights.funnel.loginSuccess),
    },
    {
      label: "High-signal compromise",
      count: insights.funnel.highSignalCompromise,
      conversion: percent(insights.funnel.highSignalCompromise, insights.funnel.commands),
    },
  ]

  const countryChartData = countrySuccess.map((row) => ({
    ...row,
    label: `${row.country} · ${row.countryName}`,
  }))

  const depthBuckets = DEPTH_BUCKET_ORDER.map((bucket) => ({
    bucket,
    sessions: insights.successfulDepth.buckets.find((entry) => entry.bucket === bucket)?.sessions ?? 0,
  }))

  const countryChartHeight = Math.max(360, countryChartData.length * 44)

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-sky-400" />
              <h2 className="font-semibold text-foreground">Attack Depth Funnel</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Shows how much raw noise actually becomes meaningful intrusion activity
            </p>
          </div>
          <Link
            href="/sessions?tab=sessions&actor=all"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Explore sessions <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid gap-3 xl:grid-cols-5">
          {funnelStages.map((stage, index) => (
            <div key={stage.label} className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{stage.label}</span>
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: FUNNEL_COLORS[index] }}
                />
              </div>
              <p className="mt-3 text-3xl font-semibold text-foreground">
                {stage.count.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {index === 0 ? "baseline" : `${stage.conversion}% from previous stage`}
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(3, percent(stage.count, insights.funnel.connections))}%`,
                    backgroundColor: FUNNEL_COLORS[index],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-2">
            <Globe2 className="h-4 w-4 text-emerald-400" />
            <div>
              <h2 className="font-semibold text-foreground">Success Rate by Country</h2>
              <p className="text-sm text-muted-foreground">
                Filtered to countries with at least 20 sessions and 2 distinct IPs
              </p>
            </div>
          </div>

          <div style={{ height: `${countryChartHeight}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={countryChartData}
                layout="vertical"
                barCategoryGap={10}
                margin={{ left: 8, right: 20, top: 4, bottom: 4 }}
              >
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="country"
                  tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip cursor={{ fill: "hsl(var(--secondary) / 0.3)" }} content={<CountryRateTooltip />} />
                <Bar dataKey="successRate" radius={[0, 8, 8, 0]} barSize={30}>
                  {countryChartData.map((row, index) => (
                    <Cell
                      key={row.country}
                      fill={index < 3 ? "#22c55e" : index < 7 ? "#38bdf8" : "#f59e0b"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-amber-400" />
            <div>
              <h2 className="font-semibold text-foreground">Successful Session Depth</h2>
              <p className="text-sm text-muted-foreground">
                Most successful logins stay extremely shallow, which is useful signal on its own
              </p>
            </div>
          </div>

          <div className="mb-5 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={depthBuckets}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="bucket"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  width={36}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--secondary) / 0.3)" }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                  }}
                />
                <Bar dataKey="sessions" radius={[8, 8, 0, 0]} fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <p className="text-xs text-muted-foreground">Average commands</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{insights.successfulDepth.averageCommands}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <p className="text-xs text-muted-foreground">Maximum depth</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{insights.successfulDepth.maxCommands}</p>
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <p className="text-xs text-muted-foreground">20+ commands</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {insights.successfulDepth.interactiveSessions}
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-violet-400" />
            <div>
              <h2 className="font-semibold text-foreground">Credential Campaigns</h2>
              <p className="text-sm text-muted-foreground">
                6-hour windows where the same credential pair appears across multiple IPs
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <div className="max-h-[540px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/95 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 text-left">Credential</th>
                    <th className="px-4 py-3 text-left">Window</th>
                    <th className="px-4 py-3 text-left">Spread</th>
                    <th className="px-4 py-3 text-left">Attempts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {campaignGeo.map((campaign) => (
                    <tr key={`${campaign.bucketStart}-${campaign.username ?? ""}-${campaign.password ?? ""}`}>
                      <td className="px-4 py-3 align-top">
                        <code className="font-mono text-foreground">
                          {formatCredential(campaign.username, campaign.password)}
                        </code>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {campaign.successRate}% success within window
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground">
                        {formatDateLabel(campaign.bucketStart)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-foreground">
                          {campaign.uniqueIps} IPs · {campaign.countryCount} countries
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {campaign.countries.length > 0 ? campaign.countries.join(", ") : "No public geo"}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold text-foreground">{campaign.attempts}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {campaign.successCount} successful
                        </p>
                      </td>
                    </tr>
                  ))}
                  {campaignGeo.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No coordinated credential windows crossed the current threshold.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-rose-400" />
            <div>
              <h2 className="font-semibold text-foreground">Recurring IPs</h2>
              <p className="text-sm text-muted-foreground">
                Persistent sources that return after failure and rotate credentials aggressively
              </p>
            </div>
          </div>

          <div className="max-h-[540px] space-y-3 overflow-auto pr-1">
            {insights.recurringIps.map((row) => (
              <div key={row.srcIp} className="rounded-xl border border-border bg-background/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link
                      href={`/sessions?q=${encodeURIComponent(row.srcIp)}`}
                      className="font-mono text-sm text-foreground transition-colors hover:text-primary"
                    >
                      {row.srcIp}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.clientVersion ?? "Unknown client"} · first seen {formatDateLabel(row.firstSeen)}
                    </p>
                  </div>
                  <div className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                    {row.totalSessions} sessions
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Failures</p>
                    <p className="mt-1 font-semibold text-foreground">{row.failedSessions}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Successes</p>
                    <p className="mt-1 font-semibold text-foreground">{row.successfulSessions}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Credential pairs</p>
                    <p className="mt-1 font-semibold text-foreground">{row.credentialCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Return delay</p>
                    <p className="mt-1 font-semibold text-foreground">
                      {row.returnAfterMinutes === null ? "n/a" : `${row.returnAfterMinutes} min`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-5 flex items-center gap-2">
          <Route className="h-4 w-4 text-cyan-400" />
          <div>
            <h2 className="font-semibold text-foreground">Post-Login Command Paths</h2>
            <p className="text-sm text-muted-foreground">
              Secuencias de comandos más frecuentes en sesiones exitosas
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {insights.commandPatterns.map((pattern, index) => (
            <div key={`${pattern.sequence}-${index}`} className="rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Patrón #{index + 1}
                  </p>
                  <code className="mt-2 block truncate font-mono text-sm text-foreground" title={pattern.sequence}>
                    {truncateSequence(pattern.sequence)}
                  </code>
                </div>
                <div className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                  {pattern.sessions}
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {pattern.uniqueIps} IPs origen
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

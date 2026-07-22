import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { TrendingUp, TrendingDown } from "lucide-react"
import type { HoneypotOverview, KpiTrends, MetricTrend } from "@/lib/api"
import { getServerT } from "@/lib/i18n/server"
import { getProtocolConfig } from "./protocol-config"

function relativeTime(ts: string | null) {
  if (!ts) return null
  try { return formatDistanceToNow(new Date(ts), { addSuffix: true }) }
  catch { return null }
}

function DeltaBadge({ trend }: { trend: MetricTrend | undefined }) {
  if (!trend) return null
  const { deltaPct, current, previous } = trend
  if (deltaPct === null) {
    if (current > 0 && previous === 0) {
      return (
        <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
          <TrendingUp className="h-2.5 w-2.5" />new
        </span>
      )
    }
    return null
  }
  const up = deltaPct >= 0
  const Icon = up ? TrendingUp : TrendingDown
  const tone = up ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>
      <Icon className="h-2.5 w-2.5" />
      {up ? "+" : ""}{deltaPct}%
    </span>
  )
}

interface SensorItem {
  key: string
  count: number
  uniqueIps: number
  lastSeen: string | null
  subtitle: string | null
}

interface Props {
  overview: HoneypotOverview
  trends?: KpiTrends
}

export async function SensorActivityGrid({ overview, trends }: Props) {
  const t = await getServerT()
  const items: SensorItem[] = []

  if (overview.ssh.sessions > 0) {
    items.push({
      key: "ssh",
      count: overview.ssh.sessions,
      uniqueIps: overview.ssh.uniqueIps,
      lastSeen: overview.ssh.lastSeen,
      subtitle: overview.ssh.successfulLogins > 0
        ? t("dash.sensors.compromised", { n: overview.ssh.successfulLogins.toLocaleString("en-US") })
        : null,
    })
  }

  if (overview.web.hits > 0) {
    items.push({
      key: "http",
      count: overview.web.hits,
      uniqueIps: overview.web.uniqueIps,
      lastSeen: overview.web.lastSeen,
      subtitle: overview.web.topAttackType ? t("dash.sensors.topType", { type: overview.web.topAttackType }) : null,
    })
  }

  const usedKeys = new Set(items.map((i) => i.key))

  for (const p of overview.protocols) {
    if (p.count > 0 && !usedKeys.has(p.protocol)) {
      items.push({
        key: p.protocol,
        count: p.count,
        uniqueIps: p.uniqueIps,
        lastSeen: p.lastSeen,
        subtitle: p.authAttempts > 0
          ? t("dash.sensors.authAttempts", { n: p.authAttempts.toLocaleString("en-US") })
          : null,
      })
    }
  }

  if (items.length === 0) return null

  return (
    <div className="mb-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {t("dash.sensors.activityBySensor")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => {
          const cfg = getProtocolConfig(item.key)
          const Icon = cfg.icon
          const when = relativeTime(item.lastSeen)

          // Map sensor key to the right trend bucket
          const trend: MetricTrend | undefined =
            item.key === "ssh"  ? trends?.sshSessions :
            item.key === "http" ? trends?.webHits :
            trends?.protocols?.[item.key]

          return (
            <Link
              key={item.key}
              href={cfg.href}
              className={`group rounded-xl border ${cfg.border} bg-card p-4 transition-colors hover:bg-muted/30`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`rounded-lg p-2 ${cfg.bg}`}>
                  <Icon className={`h-4 w-4 ${cfg.color}`} />
                </div>
                <div className="flex items-center gap-1.5">
                  <DeltaBadge trend={trend} />
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-2xl font-semibold text-foreground">
                {item.count.toLocaleString("en-US")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("dash.sensors.uniqueIps", { n: item.uniqueIps.toLocaleString("en-US") })}
              </p>
              {(item.subtitle || when) && (
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground/70">
                  {item.subtitle && <span className="truncate">{item.subtitle}</span>}
                  {when && <span suppressHydrationWarning className="ml-auto shrink-0">{when}</span>}
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

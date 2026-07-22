import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import type { ProtocolStat, ProtocolInsights } from "@/lib/api"
import { getServerT } from "@/lib/i18n/server"
import { buildServiceFacets, type FacetKey } from "@/lib/service-facets"
import { getProtocolConfig } from "./protocol-config"

interface Props {
  services: { stat: ProtocolStat; insights: ProtocolInsights }[]
}

function relativeTime(ts: string | null) {
  if (!ts) return null
  try { return formatDistanceToNow(new Date(ts), { addSuffix: true }) }
  catch { return null }
}

export async function ServiceHighlights({ services }: Props) {
  const t = await getServerT()
  if (services.length === 0) return null

  const facetLabel: Record<FacetKey, string> = {
    credentials: t("dash.services.facet.credentials"),
    usernames: t("dash.services.facet.usernames"),
    commands: t("dash.services.facet.commands"),
    databases: t("dash.services.facet.databases"),
    shares: t("dash.services.facet.shares"),
    services: t("dash.services.facet.services"),
    ports: t("dash.services.facet.ports"),
  }

  return (
    <div className="mb-6">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {t("dash.services.title")}
      </p>
      <p className="mb-3 text-sm text-muted-foreground">{t("dash.services.subtitle")}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {services.map(({ stat, insights }) => {
          const cfg = getProtocolConfig(stat.protocol)
          const Icon = cfg.icon
          const when = relativeTime(stat.lastSeen)
          const facets = buildServiceFacets(insights, (k) => facetLabel[k])

          return (
            <Link
              key={stat.protocol}
              href={cfg.href}
              className={`group flex flex-col rounded-xl border ${cfg.border} bg-card p-4 transition-colors hover:bg-muted/30`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className={`rounded-lg p-2 ${cfg.bg}`}>
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{cfg.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("dash.sensors.uniqueIps", { n: insights.totals.uniqueIps.toLocaleString("en-US") })}
                    </p>
                  </div>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${cfg.bg} ${cfg.color}`}>
                  {stat.count.toLocaleString("en-US")}
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {facets.map((facet) => (
                  <div key={facet.label}>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {facet.label}
                    </p>
                    <ul className="space-y-0.5">
                      {facet.items.map((item, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-mono text-foreground/90">{item.label}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {item.count.toLocaleString("en-US")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {when && (
                <p suppressHydrationWarning className="mt-3 text-[11px] text-muted-foreground/70">
                  {when}
                </p>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

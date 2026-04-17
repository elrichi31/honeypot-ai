import { notFound } from "next/navigation"
import { PageShell } from "@/components/page-shell"
import Link from "next/link"
import { format, formatDistanceToNow } from "date-fns"
import { ArrowLeft, Globe, Clock, MousePointerClick, Shield } from "lucide-react"
import { fetchWebHitsByIp, fetchWebHits, fetchThreat } from "@/lib/api"
import { lookupIp } from "@/lib/geo"
import { RiskBadge } from "@/components/risk-badge"
import { countryFlag } from "@/lib/formatting"
import { ATTACK_COLORS, ATTACK_LABELS_LONG as ATTACK_LABELS } from "@/lib/attack-types"

function StatCard({ icon: Icon, label, value, color = "text-muted-foreground", bg = "bg-secondary" }: {
  icon: React.ElementType; label: string; value: string | number; color?: string; bg?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold text-foreground">{value}</p>
      </div>
    </div>
  )
}

export default async function WebAttackerDetailPage({
  params,
}: {
  params: Promise<{ ip: string }>
}) {
  const { ip } = await params
  const srcIp = decodeURIComponent(ip)

  const [allAttackers, { hits }] = await Promise.all([
    fetchWebHitsByIp(),
    fetchWebHits({ srcIp, limit: 500 }),
  ])

  const attacker = allAttackers.find((a) => a.srcIp === srcIp)
  if (!attacker) notFound()

  let threat = null
  try { threat = await fetchThreat(srcIp) } catch {}

  const location = lookupIp(srcIp)

  // Breakdown por tipo de ataque
  const byType = hits.reduce<Record<string, number>>((acc, h) => {
    acc[h.attackType] = (acc[h.attackType] ?? 0) + 1
    return acc
  }, {})

  // Paths únicos más frecuentes
  const pathCount = hits.reduce<Record<string, number>>((acc, h) => {
    acc[h.path] = (acc[h.path] ?? 0) + 1
    return acc
  }, {})
  const topPaths = Object.entries(pathCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)

  const uniqueUAs = [...new Set(attacker.userAgents)]

  return (
    <PageShell>
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/web-attacks"
            className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a Web Attacks
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                {location?.country && (
                  <span className="text-3xl">{countryFlag(location.country)}</span>
                )}
                <h1 className="font-mono text-2xl font-semibold text-foreground">{srcIp}</h1>
              </div>
              {location?.countryName && (
                <p className="mt-0.5 text-sm text-muted-foreground">{location.countryName}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Primer hit {formatDistanceToNow(new Date(attacker.firstSeen), { addSuffix: true })} ·{" "}
                Último {formatDistanceToNow(new Date(attacker.lastSeen), { addSuffix: true })}
              </p>
            </div>
            <div className="flex flex-wrap justify-end items-center gap-1.5">
              {threat && <RiskBadge level={threat.risk.level} score={threat.risk.score} ip={srcIp} />}
              {attacker.attackTypes.map((t) => (
                <span
                  key={t}
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${ATTACK_COLORS[t] ?? ATTACK_COLORS.recon}`}
                >
                  {ATTACK_LABELS[t] ?? t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={MousePointerClick} label="Total hits" value={attacker.totalHits.toLocaleString()} color="text-warning" bg="bg-warning/20" />
          <StatCard icon={Shield} label="Tipos de ataque" value={attacker.attackTypes.length} />
          <StatCard icon={Globe} label="Paths únicos" value={Object.keys(pathCount).length} />
          <StatCard icon={Clock} label="Duración campaña" value={(() => {
            const ms = new Date(attacker.lastSeen).getTime() - new Date(attacker.firstSeen).getTime()
            const h = Math.floor(ms / 3_600_000)
            const m = Math.floor((ms % 3_600_000) / 60_000)
            return h > 0 ? `${h}h ${m}m` : `${m}m`
          })()} />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          {/* Left column */}
          <div className="space-y-6 xl:col-span-1">
            {/* Attack type breakdown */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">Breakdown por tipo</h3>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-border">
                {Object.entries(byType)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between px-4 py-2.5">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ATTACK_COLORS[type] ?? ATTACK_COLORS.recon}`}>
                        {ATTACK_LABELS[type] ?? type}
                      </span>
                      <span className="font-mono text-sm font-semibold text-foreground">{count}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* User agents */}
            {uniqueUAs.length > 0 && (
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border p-4">
                  <h3 className="font-semibold text-foreground">User Agents</h3>
                  <p className="text-xs text-muted-foreground">{uniqueUAs.length} detectados</p>
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-border">
                  {uniqueUAs.map((ua, i) => (
                    <p key={i} className="px-4 py-2.5 font-mono text-xs text-muted-foreground break-all">
                      {ua}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Top paths */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">Paths más atacados</h3>
              </div>
              <div className="max-h-52 overflow-y-auto divide-y divide-border">
                {topPaths.map(([path, count]) => (
                  <div key={path} className="flex items-center justify-between gap-2 px-4 py-2">
                    <p className="min-w-0 truncate font-mono text-xs text-foreground" title={path}>{path}</p>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">×{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column: hit timeline */}
          <div className="xl:col-span-2">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold text-foreground">Timeline de requests</h3>
                <p className="text-xs text-muted-foreground">{hits.length} requests · orden cronológico inverso</p>
              </div>
              <div className="overflow-y-auto max-h-[620px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-card">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Hora</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Método</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Path</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {hits.map((hit) => {
                    const fullPath = hit.query ? `${hit.path}?${hit.query}` : hit.path
                    return (
                      <tr key={hit.id} className="hover:bg-muted/10 transition-colors">
                        <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted-foreground">
                          {format(new Date(hit.timestamp), "HH:mm:ss")}
                          <span className="ml-1 text-[10px] text-muted-foreground/50">
                            {format(new Date(hit.timestamp), "dd/MM")}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{hit.method}</span>
                        </td>
                        <td className="max-w-xs px-4 py-2">
                          <p className="truncate font-mono text-xs text-foreground" title={fullPath}>{fullPath}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium ${ATTACK_COLORS[hit.attackType] ?? ATTACK_COLORS.recon}`}>
                            {ATTACK_LABELS[hit.attackType] ?? hit.attackType}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </div>
  </PageShell>
  )
}

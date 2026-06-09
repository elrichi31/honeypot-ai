import Link from "next/link"
import { format } from "date-fns"
import { Zap, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import { fetchWebBursts } from "@/lib/api"
import { PageShell } from "@/components/page-shell"
import { ErrorState } from "@/components/ui/data-states"
import { WebAttacksNav } from "@/components/web-attacks-nav"
import { AttackTypeFilter } from "@/components/attack-type-filter"
import { TimeRangeFilter } from "@/components/time-range-filter"
import { TablePagination } from "@/components/table-pagination"
import { lookupIp } from "@/lib/geo"
import { countryFlag } from "@/lib/formatting"
import { ATTACK_COLORS, ATTACK_LABELS } from "@/lib/attack-types"

const VALID_ATTACK_TYPES = new Set(["sqli", "xss", "lfi", "rfi", "cmdi", "log4shell", "ssti", "xxe", "deserialization", "scanner", "info_disclosure", "recon"])
const VALID_RANGES = new Set(["24h", "7d", "30d", "all"])
const GAP_OPTIONS = [5, 15, 30, 60]
const VALID_SORT_BY = new Set(["startedAt", "hits", "durationSec", "intensity"])
type BurstSortBy = "startedAt" | "hits" | "durationSec" | "intensity"

function fmtDuration(sec: number): string {
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
  if (sec >= 60) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${sec}s`
}

/** Color the intensity figure: red = aggressive automated scan, dimmer = slow/manual. */
function intensityClass(perMin: number): string {
  if (perMin >= 60) return "text-red-400"
  if (perMin >= 10) return "text-orange-400"
  if (perMin >= 2) return "text-yellow-400"
  return "text-muted-foreground"
}

/** Sortable header that preserves the active filters (type / range / gap). */
function SortableBurstTh({
  label, column, align, sortBy, sortDir, baseParams,
}: {
  label: string; column: BurstSortBy; align?: "right"
  sortBy: string; sortDir: string; baseParams: URLSearchParams
}) {
  const isActive = sortBy === column
  const nextDir = isActive && sortDir === "desc" ? "asc" : "desc"
  const params = new URLSearchParams(baseParams)
  params.set("sort", column)
  params.set("dir", nextDir)
  const Icon = isActive ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th className={`px-4 py-3 font-medium text-muted-foreground ${align === "right" ? "text-right" : "text-left"}`}>
      <Link
        href={`/web-attacks/bursts?${params}`}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <Icon className={`h-3 w-3 ${isActive ? "" : "opacity-40"}`} />
      </Link>
    </th>
  )
}

export default async function WebBurstsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string; range?: string; gap?: string; sort?: string; dir?: string }>
}) {
  const params = await searchParams
  const page = Number(params.page ?? "1")
  const attackType = VALID_ATTACK_TYPES.has(params.type ?? "") ? params.type : undefined
  const range = VALID_RANGES.has(params.range ?? "") ? params.range : undefined
  const gapMinutes = GAP_OPTIONS.includes(Number(params.gap)) ? Number(params.gap) : 15
  const sortBy = (VALID_SORT_BY.has(params.sort ?? "") ? params.sort : "startedAt") as BurstSortBy
  const sortDir = (params.dir === "asc" ? "asc" : "desc") as "asc" | "desc"

  let burstsPage: Awaited<ReturnType<typeof fetchWebBursts>>
  try {
    burstsPage = await fetchWebBursts({ page, pageSize: 50, attackType, range, gapMinutes, sortBy, sortDir })
  } catch {
    return (
      <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Web Attacks · Bursts</h1>
        </div>
        <WebAttacksNav active="bursts" />
        <ErrorState description="Could not fetch burst data from the API." />
      </PageShell>
    )
  }

  const geoMap: Record<string, { country: string; countryName: string } | null> = {}
  for (const b of burstsPage.items) geoMap[b.srcIp] = lookupIp(b.srcIp)

  // Filters shared across sort links and the gap selector (everything except the
  // varying control itself), so changing sort keeps the filters and vice versa.
  const baseParams = new URLSearchParams()
  if (attackType) baseParams.set("type", attackType)
  if (range) baseParams.set("range", range)
  if (gapMinutes !== 15) baseParams.set("gap", String(gapMinutes))

  const gapHref = (g: number) => {
    const sp = new URLSearchParams(baseParams)
    if (g !== 15) sp.set("gap", String(g))
    else sp.delete("gap")
    if (sortBy !== "startedAt") sp.set("sort", sortBy)
    if (sortDir !== "desc") sp.set("dir", sortDir)
    const qs = sp.toString()
    return `/web-attacks/bursts${qs ? `?${qs}` : ""}`
  }

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Web Attacks · Bursts</h1>
        <p className="text-sm text-muted-foreground">
          {burstsPage.pagination.total.toLocaleString("en-US")} bursts · hits grouped into time-contiguous campaigns
        </p>
      </div>

      <WebAttacksNav active="bursts" />

      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <AttackTypeFilter types={[...VALID_ATTACK_TYPES]} />
          <TimeRangeFilter />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Gap:</span>
            <div className="inline-flex rounded-lg border border-border bg-muted/20 p-0.5">
              {GAP_OPTIONS.map((g) => (
                <Link
                  key={g}
                  href={gapHref(g)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    gapMinutes === g ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {g}m
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-[620px] max-h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Zap className="h-4 w-4 text-warning" />
          <div>
            <h2 className="font-semibold text-foreground">Attack bursts</h2>
            <p className="text-xs text-muted-foreground">Each row is a run of hits from one IP with no gap &gt; {gapMinutes} min</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-[920px] w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Attacker IP</th>
                <SortableBurstTh label="Started" column="startedAt" sortBy={sortBy} sortDir={sortDir} baseParams={baseParams} />
                <SortableBurstTh label="Duration" column="durationSec" sortBy={sortBy} sortDir={sortDir} baseParams={baseParams} />
                <SortableBurstTh label="Hits" column="hits" align="right" sortBy={sortBy} sortDir={sortDir} baseParams={baseParams} />
                <SortableBurstTh label="Intensity" column="intensity" align="right" sortBy={sortBy} sortDir={sortDir} baseParams={baseParams} />
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Attack types</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {burstsPage.items.map((b, i) => {
                const location = geoMap[b.srcIp]
                return (
                  <tr key={`${b.srcIp}-${b.startedAt}-${i}`} className="hover:bg-muted/10 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link href={`/web-attacks/${encodeURIComponent(b.srcIp)}`} className="flex items-center gap-2 hover:text-foreground">
                        {location?.country && <span title={location.countryName}>{countryFlag(location.country)}</span>}
                        <span className="font-mono text-sm text-foreground">{b.srcIp}</span>
                        {b.canaryHits > 0 && (
                          <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/15 px-1.5 py-0 text-[10px] font-semibold text-red-400">🎯</span>
                        )}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                      {format(new Date(b.startedAt), "dd/MM HH:mm:ss")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                      {fmtDuration(b.durationSec)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm font-semibold text-foreground">
                      {b.hits.toLocaleString("en-US")}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-mono text-sm font-semibold ${intensityClass(b.intensityPerMin)}`}>
                      {b.intensityPerMin}/min
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {b.attackTypes.map((t) => (
                          <span key={t} className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium ${ATTACK_COLORS[t] ?? ATTACK_COLORS.recon}`}>
                            {ATTACK_LABELS[t] ?? t}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {burstsPage.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No bursts in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TablePagination pagination={burstsPage.pagination} />
      </div>
    </PageShell>
  )
}

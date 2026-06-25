import type { Metadata } from "next"
import Link from "next/link"
import { Fingerprint, Target, GitBranch, AlertTriangle } from "lucide-react"
import { fetchWebSessions } from "@/lib/api"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { ErrorState } from "@/components/ui/data-states"
import { WebAttacksNav } from "@/components/web-attacks-nav"
import { TimeRangeFilter } from "@/components/time-range-filter"
import { TablePagination } from "@/components/table-pagination"
import { lookupIp } from "@/lib/geo"
import { Flag } from "@/components/ui/flag"
import { AttackTypeBadge } from "@/components/attack-type-badge"
import { readConfig } from "@/lib/server-config"
import { formatInTimezone } from "@/lib/timezone"
import type { WebSession } from "@/lib/api"

const VALID_RANGES = new Set(["24h", "7d", "30d", "all"])

export const metadata: Metadata = {
  title: "Web Attack Sessions — HoneyTrap",
}

export default async function WebSessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const sp       = await searchParams
  const page     = Math.max(1, parseInt(sp.page ?? "1", 10))
  const range    = VALID_RANGES.has(sp.range ?? "") ? sp.range : undefined
  const onlyChains = sp.chains === "1"
  const { timezone: tz } = await readConfig()
  const timezone = tz ?? "UTC"

  let sessionsPage: Awaited<ReturnType<typeof fetchWebSessions>>
  let error = false
  try {
    sessionsPage = await fetchWebSessions({ page, pageSize: 50, range, onlyChains })
  } catch {
    error = true
    sessionsPage = { items: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } }
  }

  const baseParams = new URLSearchParams()
  if (range)      baseParams.set("range", range)
  if (onlyChains) baseParams.set("chains", "1")

  const chainToggleParams = new URLSearchParams(baseParams)
  if (onlyChains) chainToggleParams.delete("chains")
  else chainToggleParams.set("chains", "1")

  return (
    <PageShell>
      <div className="mb-4 flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">Web Attacks</h1>
        <p className="text-sm text-muted-foreground">
          Attacker sessions grouped by passive fingerprint — detects VPN hoppers and recon→exploit chains.
        </p>
      </div>

      <WebAttacksNav active="sessions" />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TimeRangeFilter />
        <Link
          href={`/web-attacks/sessions?${chainToggleParams.toString()}`}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            onlyChains
              ? "border-orange-500/50 bg-orange-500/15 text-orange-400"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          <GitBranch className="h-3.5 w-3.5" />
          Chain attacks only
        </Link>
      </div>

      {error && <ErrorState description="Could not fetch session data from the API." />}

      <Surface>
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">Attacker Sessions</h2>
              <p className="text-xs text-muted-foreground">
                {sessionsPage.pagination.total.toLocaleString("en-US")} unique fingerprints
                {onlyChains ? " · chain attacks only" : ""}
              </p>
            </div>
            <Fingerprint className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>

        <div className="overflow-x-clip">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Fingerprint</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">IPs</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Hits</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Chains</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Canary</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Attack types</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Top paths</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sessionsPage.items.map((s: WebSession) => (
                <SessionRow key={s.clientFingerprint} session={s} timezone={timezone} />
              ))}
              {sessionsPage.items.length === 0 && !error && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {onlyChains
                      ? "No chain attacks found. Try removing the chain filter."
                      : range
                        ? `No web hits in the selected time range. Try a wider range or "All time".`
                        : "No web hits yet. Sessions appear once the web honeypot receives traffic."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {sessionsPage.pagination.totalPages > 1 && (
          <div className="border-t border-border p-4">
            <TablePagination pagination={sessionsPage.pagination} />
          </div>
        )}
      </Surface>
    </PageShell>
  )
}

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]+:[0-9a-fA-F:]+$/
function isIpFallback(fp: string): boolean {
  return IP_RE.test(fp)
}

function SessionRow({ session: s, timezone }: { session: WebSession; timezone: string }) {
  const isChain   = s.chainHits > 0
  const isCanary  = s.canaryHits > 0
  const isMultiIp = s.isMultiIp

  return (
    <tr className={`transition-colors hover:bg-muted/20 ${isCanary ? "bg-red-500/5" : isChain ? "bg-orange-500/5" : ""}`}>
      {/* Fingerprint */}
      <td className="px-4 py-3">
        <Link href={`/web-attacks/sessions/${encodeURIComponent(s.clientFingerprint)}`} className="group block">
          <div className="flex items-center gap-2">
            {isCanary && <Target className="h-3.5 w-3.5 shrink-0 text-red-400" />}
            {isChain && !isCanary && <GitBranch className="h-3.5 w-3.5 shrink-0 text-orange-400" />}
            {isMultiIp && !isCanary && !isChain && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-yellow-400" />}
            <span className="font-mono text-xs text-blue-400 group-hover:underline">{s.clientFingerprint}</span>
            {isIpFallback(s.clientFingerprint) && (
              <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">IP</span>
            )}
          </div>
          {isMultiIp && (
            <p className="mt-0.5 text-xs text-yellow-400">Multi-IP · possible VPN hopper</p>
          )}
        </Link>
      </td>

      {/* IPs */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          {s.srcIps.slice(0, 3).map((ip) => {
            const loc = lookupIp(ip)
            return (
              <Link
                key={ip}
                href={`/web-attacks/${encodeURIComponent(ip)}`}
                className="inline-flex items-center gap-1 font-mono text-xs text-blue-400 hover:underline"
              >
                {loc?.country && <Flag code={loc.country} />}
                {ip}
              </Link>
            )
          })}
          {s.srcIps.length > 3 && (
            <span className="text-xs text-muted-foreground">+{s.srcIps.length - 3} more</span>
          )}
        </div>
      </td>

      {/* Hits */}
      <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-foreground">
        {s.totalHits.toLocaleString("en-US")}
      </td>

      {/* Chain hits */}
      <td className="px-4 py-3 text-right">
        {s.chainHits > 0 ? (
          <span className="font-mono text-sm font-semibold text-orange-400">{s.chainHits}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Canary hits */}
      <td className="px-4 py-3 text-right">
        {s.canaryHits > 0 ? (
          <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-red-400">
            <Target className="h-3 w-3" /> {s.canaryHits}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Attack types */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {s.attackTypes.slice(0, 4).map((t) => (
            <AttackTypeBadge key={t} type={t} />
          ))}
          {s.attackTypes.length > 4 && (
            <span className="text-xs text-muted-foreground">+{s.attackTypes.length - 4}</span>
          )}
        </div>
      </td>

      {/* Top paths */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          {s.topPaths.slice(0, 3).map((p) => (
            <span key={p} className="max-w-[180px] truncate font-mono text-xs text-muted-foreground" title={p}>
              {p}
            </span>
          ))}
        </div>
      </td>

      {/* Last seen */}
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
        {formatInTimezone(new Date(s.lastSeen), timezone, {
          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
        })}
      </td>
    </tr>
  )
}

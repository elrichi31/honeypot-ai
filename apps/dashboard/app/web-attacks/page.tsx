import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"
import Link from "next/link"
import { fetchWebHitsByIpPage, fetchWebHitsStats } from "@/lib/api"
import { PageShell } from "@/components/page-shell"
import { ErrorState } from "@/components/ui/data-states"
import { SearchInput } from "@/components/ui/search-input"
import { lookupIp } from "@/lib/geo"
import { AttackersTable } from "./attackers-table"
import { WebAttacksNav } from "@/components/web-attacks-nav"
import { AttackTypeFilter } from "@/components/attack-type-filter"
import { TablePagination } from "@/components/table-pagination"

function SortableWebTh({
  label, column, sortBy, sortDir, q, type, pageSize,
}: {
  label: string; column: string; sortBy: string; sortDir: string; q?: string; type?: string; pageSize: number
}) {
  const isActive = sortBy === column
  const nextDir = isActive && sortDir === "desc" ? "asc" : "desc"
  const params = new URLSearchParams({ sortBy: column, sortDir: nextDir, pageSize: String(pageSize) })
  if (q) params.set("q", q)
  if (type) params.set("type", type)
  return (
    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
      <Link href={`/web-attacks?${params}`} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
        {label}
        {isActive ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </Link>
    </th>
  )
}

const PAGE_SIZE_OPTIONS = new Set(["50", "100", "200"])

const VALID_WEB_SORT_BY = new Set(["totalHits", "lastSeen", "firstSeen"])
const VALID_SORT_DIR = new Set(["asc", "desc"])
const VALID_ATTACK_TYPES = new Set(["sqli", "xss", "lfi", "rfi", "cmdi", "scanner", "info_disclosure", "recon"])

export default async function WebAttacksPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    q?: string
    type?: string
    sortBy?: string
    sortDir?: string
  }>
}) {
  const params = await searchParams
  const page = Number(params.page ?? "1")
  const pageSize = PAGE_SIZE_OPTIONS.has(params.pageSize ?? "") ? Number(params.pageSize) : 50
  const q = params.q?.trim() || undefined
  const attackType = VALID_ATTACK_TYPES.has(params.type ?? "") ? params.type : undefined
  const sortBy = VALID_WEB_SORT_BY.has(params.sortBy ?? "") ? (params.sortBy as "totalHits" | "lastSeen" | "firstSeen") : "totalHits"
  const sortDir = VALID_SORT_DIR.has(params.sortDir ?? "") ? (params.sortDir as "asc" | "desc") : "desc"

  let attackersPage: Awaited<ReturnType<typeof fetchWebHitsByIpPage>>
  let stats: Awaited<ReturnType<typeof fetchWebHitsStats>>
  try {
    ;[attackersPage, stats] = await Promise.all([
      fetchWebHitsByIpPage({ page, pageSize, q, attackType, sortBy, sortDir }),
      fetchWebHitsStats(),
    ])
  } catch {
    return (
      <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Web Attacks</h1>
        </div>
        <ErrorState description="Could not fetch web attack data from the API." />
      </PageShell>
    )
  }

  const geoMap: Record<string, { country: string; countryName: string } | null> = {}
  for (const attacker of attackersPage.items) {
    geoMap[attacker.srcIp] = lookupIp(attacker.srcIp)
  }

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Web Attacks</h1>
        <p className="text-sm text-muted-foreground">
          {stats.total.toLocaleString('en-US')} requests captured · {attackersPage.pagination.total.toLocaleString('en-US')} attackers visible
        </p>
      </div>

      <WebAttacksNav active="attackers" />

      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput defaultValue={q ?? ""} placeholder="Search attacker IP..." />
          <span className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
            {attackersPage.items.length} rows on this page
          </span>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total hits</p>
          <p className="mt-1 text-2xl font-semibold">{stats.total.toLocaleString('en-US')}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Visible attackers</p>
          <p className="mt-1 text-2xl font-semibold">{attackersPage.pagination.total}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-sm text-muted-foreground">Filter by attack type</p>
          <AttackTypeFilter
            types={stats.byAttackType.map((a) => a.attackType)}
            counts={Object.fromEntries(stats.byAttackType.map((a) => [a.attackType, a.count]))}
          />
        </div>
      </div>

      <div className="flex min-h-[620px] max-h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold text-foreground">Attackers</h2>
          <p className="text-xs text-muted-foreground">HTTP IPs sorted by activity and hit volume</p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-[1080px] w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Attacker IP</th>
                <SortableWebTh label="Hits" column="totalHits" sortBy={sortBy} sortDir={sortDir} q={q} type={attackType} pageSize={pageSize} />
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Attack types</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Top paths</th>
                <SortableWebTh label="First hit" column="firstSeen" sortBy={sortBy} sortDir={sortDir} q={q} type={attackType} pageSize={pageSize} />
                <SortableWebTh label="Last hit" column="lastSeen" sortBy={sortBy} sortDir={sortDir} q={q} type={attackType} pageSize={pageSize} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <AttackersTable attackers={attackersPage.items} geo={geoMap} />
            </tbody>
          </table>
        </div>

        <TablePagination pagination={attackersPage.pagination} />
      </div>
    </PageShell>
  )
}

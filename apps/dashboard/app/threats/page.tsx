import { ShieldAlert } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { SearchInput } from "@/components/ui/search-input"
import { fetchThreatsPage } from "@/lib/api"
import { ThreatsTable } from "./threats-table"

const PAGE_SIZE_OPTIONS = new Set(["20", "30", "50", "100"])

const VALID_THREAT_SORT_BY = new Set(["score", "sessions", "webHits", "protocols"])
const VALID_SORT_DIR = new Set(["asc", "desc"])
const VALID_LEVELS = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"])

export default async function ThreatsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    q?: string
    sortBy?: string
    sortDir?: string
    level?: string
    crossProtocol?: string
  }>
}) {
  const params = await searchParams
  const page = Number(params.page ?? "1")
  const pageSize = PAGE_SIZE_OPTIONS.has(params.pageSize ?? "") ? Number(params.pageSize) : 20
  const q = params.q?.trim() || undefined
  const sortBy = VALID_THREAT_SORT_BY.has(params.sortBy ?? "") ? (params.sortBy as "score" | "sessions" | "webHits" | "protocols") : "score"
  const sortDir = VALID_SORT_DIR.has(params.sortDir ?? "") ? (params.sortDir as "asc" | "desc") : "desc"
  const level = VALID_LEVELS.has(params.level ?? "") ? (params.level as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO") : undefined
  const crossProtocol = params.crossProtocol === "true" ? true : undefined

  let pageData
  try {
    pageData = await fetchThreatsPage({ page, pageSize, q, sortBy, sortDir, level, crossProtocol })
  } catch {
    pageData = {
      items: [],
      summary: { total: 0, critical: 0, high: 0, crossProtocol: 0 },
      pagination: {
        page: 1,
        pageSize,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    }
  }

  return (
    <PageShell>
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          <h1 className="text-2xl font-semibold text-foreground">Threat Intelligence</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Cross-protocol correlation · risk scoring by IP · {pageData.summary.total.toLocaleString('en-US')} attackers visible
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput defaultValue={q ?? ""} placeholder="Search IP..." />
          <span className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
            {pageData.items.length} rows on this page
          </span>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total IPs</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-foreground">{pageData.summary.total}</p>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-xs text-red-400">CRITICAL</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-red-400">{pageData.summary.critical}</p>
        </div>
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
          <p className="text-xs text-orange-400">HIGH</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-orange-400">{pageData.summary.high}</p>
        </div>
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
          <p className="text-xs text-purple-400">Cross-protocol</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-purple-400">{pageData.summary.crossProtocol}</p>
        </div>
      </div>

      <ThreatsTable
        threats={pageData.items}
        pagination={pageData.pagination}
        sortBy={sortBy}
        sortDir={sortDir}
        level={level}
        crossProtocol={crossProtocol === true}
      />
    </PageShell>
  )
}

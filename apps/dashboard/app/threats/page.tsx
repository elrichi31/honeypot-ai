import { ShieldAlert } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { fetchThreatsPage } from "@/lib/api"
import { ThreatsTable } from "./threats-table"
import { TablePagination } from "@/components/table-pagination"

const PAGE_SIZE_OPTIONS = new Set(["50", "100", "200"])

export default async function ThreatsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    q?: string
  }>
}) {
  const params = await searchParams
  const page = Number(params.page ?? "1")
  const pageSize = PAGE_SIZE_OPTIONS.has(params.pageSize ?? "") ? Number(params.pageSize) : 50
  const q = params.q?.trim() || undefined

  let pageData
  try {
    pageData = await fetchThreatsPage({ page, pageSize, q })
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
          Correlación cross-protocol · risk scoring por IP · {pageData.summary.total} atacantes visibles
        </p>
      </div>

      <form className="mb-6 flex flex-wrap gap-2">
        <input type="hidden" name="pageSize" value={String(pageData.pagination.pageSize)} />
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar IP..."
          className="h-10 min-w-72 rounded-md border border-border bg-background px-3 text-sm text-foreground"
        />
        <button
          type="submit"
          className="h-10 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Buscar
        </button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total IPs</p>
          <p className="mt-1 text-2xl font-semibold font-mono text-foreground">{pageData.summary.total}</p>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-xs text-red-400">CRITICAL</p>
          <p className="mt-1 text-2xl font-semibold font-mono text-red-400">{pageData.summary.critical}</p>
        </div>
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
          <p className="text-xs text-orange-400">HIGH</p>
          <p className="mt-1 text-2xl font-semibold font-mono text-orange-400">{pageData.summary.high}</p>
        </div>
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
          <p className="text-xs text-purple-400">Cross-protocol</p>
          <p className="mt-1 text-2xl font-semibold font-mono text-purple-400">{pageData.summary.crossProtocol}</p>
        </div>
      </div>

      <ThreatsTable threats={pageData.items} />
      <div className="rounded-xl border border-border bg-card">
        <TablePagination pagination={pageData.pagination} />
      </div>
    </PageShell>
  )
}

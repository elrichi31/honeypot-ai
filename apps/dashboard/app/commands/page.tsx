import { PageShell } from "@/components/page-shell"
import { CommandsView } from "@/components/commands-view"
import { fetchEventsPage } from "@/lib/api"

const PAGE_SIZE_OPTIONS = new Set(["50", "100", "200"])

export default async function CommandsPage({
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

  const eventsPage = await fetchEventsPage({
    page,
    pageSize,
    q,
    type: "command.input",
  })

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Commands</h1>
        <p className="text-sm text-muted-foreground">
          {eventsPage.pagination.total.toLocaleString('en-US')} comandos coinciden con la búsqueda actual
        </p>
      </div>

      <CommandsView
        events={eventsPage.items}
        searchQuery={q ?? ""}
        pagination={eventsPage.pagination}
      />
    </PageShell>
  )
}

import { PageShell } from "@/components/page-shell"
import { CredentialsView } from "@/components/credentials-view"
import { SectionError } from "@/components/section-error"
import { fetchCredentialsAnalytics } from "@/lib/api"

const PAGE_SIZE_OPTIONS = new Set(["20", "30", "50", "100"])

export default async function CredentialsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    mainTab?: string
    rankingType?: string
    outcome?: string
    frequency?: string
    search?: string
    sortBy?: string
    sortDir?: string
  }>
}) {
  const params = await searchParams
  const page = Number(params.page ?? "1")
  const pageSize = PAGE_SIZE_OPTIONS.has(params.pageSize ?? "") ? Number(params.pageSize) : 20
  const mainTab =
    params.mainTab === "patterns" || params.mainTab === "recent" ? params.mainTab : "rankings"
  const rankingType =
    params.rankingType === "passwords" || params.rankingType === "usernames"
      ? params.rankingType
      : "pairs"
  const outcome =
    params.outcome === "success" || params.outcome === "failed" ? params.outcome : "all"
  const frequency =
    params.frequency === "all" || params.frequency === "single" ? params.frequency : "reused"
  const sortDir = params.sortDir === "asc" ? "asc" : "desc"

  let analytics
  try {
    analytics = await fetchCredentialsAnalytics({
      limit: 20,
      recentLimit: 20,
      page,
      pageSize,
      mainTab,
      rankingType,
      outcome,
      frequency,
      search: params.search?.trim() || undefined,
      sortBy: params.sortBy || undefined,
      sortDir,
    })
  } catch {
    return (
      <PageShell>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Credentials</h1>
        </div>
        <SectionError />
      </PageShell>
    )
  }

  return (
    <PageShell>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Credentials</h1>
          <p className="text-sm text-muted-foreground">
            Login attempts, repeated credentials, and attacker auth patterns
          </p>
        </div>

        <CredentialsView analytics={analytics} />
  </PageShell>
  )
}

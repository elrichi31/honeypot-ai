export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { ClipboardList } from "lucide-react"
import { PageShell } from "@/components/page-shell"
import { Surface } from "@/components/ui/surface"
import { SectionError } from "@/components/section-error"
import { requireRole } from "@/lib/roles"
import { getAuditLog, type AuditLogResult } from "@/lib/audit"
import { parsePage } from "@/lib/utils"
import { AuditTable } from "./audit-table"

const VALID_ACTIONS = new Set(["CREATE", "UPDATE", "DELETE", "DOWNLOAD", "LOGIN", "LOGOUT"])
const VALID_RESOURCES = new Set(["USER", "CLIENT", "SENSOR", "TOKEN", "MALWARE", "SETTINGS", "SESSION"])
const PAGE_SIZE_OPTIONS = new Set(["20", "30", "50", "100"])
const DEFAULT_PAGE_SIZE = 50

function parseFilter(raw: string | undefined, allowed: Set<string>): string | undefined {
  const upper = (raw ?? "").toUpperCase()
  return allowed.has(upper) ? upper : undefined
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; action?: string; resource?: string }>
}) {
  const auth = await requireRole("analyst")
  if (!auth.ok) redirect("/login")

  const params = await searchParams
  const page = parsePage(params.page)
  const pageSize = PAGE_SIZE_OPTIONS.has(params.pageSize ?? "") ? Number(params.pageSize) : DEFAULT_PAGE_SIZE
  const action = parseFilter(params.action, VALID_ACTIONS)
  const resource = parseFilter(params.resource, VALID_RESOURCES)

  let result: AuditLogResult | null = null
  try {
    result = await getAuditLog({ page, pageSize, action, resource })
  } catch {
    result = null
  }

  const header = (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Record of all actions performed on the platform.
        </p>
      </div>
      {result && (
        <Surface className="flex items-center gap-2 px-4 py-3">
          <ClipboardList className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-medium text-foreground">{result.pagination.total.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground">event{result.pagination.total !== 1 ? "s" : ""}</span>
        </Surface>
      )}
    </div>
  )

  // A failed read must not look like "no records" — show a retryable error.
  if (!result) {
    return (
      <PageShell>
        {header}
        <SectionError title="Couldn't load the audit log" message="Please try again in a moment." />
      </PageShell>
    )
  }

  return (
    <PageShell>
      {header}
      <AuditTable
        entries={result.entries}
        pagination={result.pagination}
        action={action ?? ""}
        resource={resource ?? ""}
      />
    </PageShell>
  )
}

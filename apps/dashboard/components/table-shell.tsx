import type { ReactNode } from "react"
import { TablePagination } from "@/components/table-pagination"
import { NavLoadingOverlay } from "@/components/table-loading-overlay"
import type { PaginationMeta } from "@/lib/api"

export function TableShell({
  title,
  description,
  titleEnd,
  toolbar,
  pagination,
  pageSizeOptions,
  children,
}: {
  title: string
  description?: string
  titleEnd?: ReactNode
  toolbar?: ReactNode
  pagination?: PaginationMeta
  pageSizeOptions?: number[]
  children: ReactNode
}) {
  const hasExtras = titleEnd || toolbar

  return (
    <div className="relative flex min-h-[620px] max-h-[calc(100vh-11rem)] flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className={hasExtras ? "space-y-4 border-b border-border p-4" : "border-b border-border p-4"}>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {titleEnd && <div className="flex flex-wrap items-center gap-2">{titleEnd}</div>}
        </div>
        {toolbar}
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <NavLoadingOverlay />
        {children}
      </div>

      {pagination && (
        <TablePagination pagination={pagination} pageSizeOptions={pageSizeOptions} />
      )}
    </div>
  )
}

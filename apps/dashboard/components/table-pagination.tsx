"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { PaginationMeta } from "@/lib/api"
import { Button } from "@/components/ui/button"

const DEFAULT_PAGE_SIZES = [50, 100, 200]

export function TablePagination({
  pagination,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
}: {
  pagination: PaginationMeta
  pageSizeOptions?: number[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const start = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1
  const end = pagination.total === 0
    ? 0
    : Math.min(pagination.page * pagination.pageSize, pagination.total)

  function updateParams(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString())

    for (const [key, value] of Object.entries(updates)) {
      next.set(key, value)
    }

    router.push(`${pathname}?${next.toString()}`)
  }

  function goToPage(page: number) {
    updateParams({ page: String(page) })
  }

  function onPageSizeChange(value: string) {
    updateParams({
      pageSize: value,
      page: "1",
    })
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="text-muted-foreground">
        Mostrando {start}-{end} de {pagination.total.toLocaleString('en-US')}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-muted-foreground">
          <span>Por p&aacute;gina</span>
          <select
            value={String(pagination.pageSize)}
            onChange={(event) => onPageSizeChange(event.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-foreground"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(pagination.page - 1)}
            disabled={!pagination.hasPreviousPage}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <span className="min-w-20 text-center text-muted-foreground">
            P&aacute;gina {pagination.page} / {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(pagination.page + 1)}
            disabled={!pagination.hasNextPage}
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

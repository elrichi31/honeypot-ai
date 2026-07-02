"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import type { PaginationMeta } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { useNavTransitionOptional } from "@/lib/use-nav-transition"
import { useT } from "@/components/locale-provider"

const DEFAULT_PAGE_SIZES = [20, 30, 50, 100]

export function TablePagination({
  pagination,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
}: {
  pagination: PaginationMeta
  pageSizeOptions?: number[]
}) {
  const { pushParams, isPending } = useNavTransitionOptional()
  const t = useT()

  const start = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1
  const end = pagination.total === 0
    ? 0
    : Math.min(pagination.page * pagination.pageSize, pagination.total)

  function updateParams(updates: Record<string, string>) {
    pushParams(updates)
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
        {t("common.pagination.showing", { start, end, total: pagination.total.toLocaleString('en-US') })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-muted-foreground">
          <span>{t("common.pagination.perPage")}</span>
          <select
            value={String(pagination.pageSize)}
            onChange={(event) => onPageSizeChange(event.target.value)}
            disabled={isPending}
            className="h-9 rounded-md border border-border bg-background px-2 text-foreground disabled:opacity-50"
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
            disabled={!pagination.hasPreviousPage || isPending}
          >
            <ChevronLeft className="h-4 w-4" />
            {t("common.pagination.previous")}
          </Button>
          <span className="min-w-20 text-center text-muted-foreground">
            {t("common.pagination.pageOf", { page: pagination.page, totalPages: pagination.totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(pagination.page + 1)}
            disabled={!pagination.hasNextPage || isPending}
          >
            {t("common.pagination.next")}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

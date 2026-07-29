"use client"

import { useState } from "react"
import type { PaginationMeta } from "@/lib/api"

export function useLocalPagination<T>(items: T[], pageSize: number) {
  const [requestedPage, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(requestedPage, totalPages)
  const start = (page - 1) * pageSize

  const pagination: PaginationMeta = {
    page,
    pageSize,
    total: items.length,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }

  return {
    pageItems: items.slice(start, start + pageSize),
    pagination,
    setPage,
  }
}

import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 5000;

export const basePaginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

type PaginationParams = z.infer<typeof basePaginationSchema>;

export function getPagination(params: PaginationParams) {
  const pageSize = Math.min(params.pageSize ?? params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = params.offset ?? ((params.page ?? 1) - 1) * pageSize;
  const page = params.page ?? Math.floor(offset / pageSize) + 1;
  return { page, pageSize, offset };
}

export function buildPaginationResponse(total: number, page: number, pageSize: number) {
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

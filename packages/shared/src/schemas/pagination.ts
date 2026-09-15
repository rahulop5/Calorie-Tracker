import { z } from 'zod';
import { LIMITS } from '../constants/limits';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIMITS.pageSizeMax)
    .default(LIMITS.pageSizeDefault),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const pageMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  hasNext: z.boolean(),
});
export type PageMeta = z.infer<typeof pageMetaSchema>;

export function buildPageMeta(total: number, query: PaginationQuery): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages,
    hasNext: query.page < totalPages,
  };
}

export function toSkipTake(query: PaginationQuery): { skip: number; take: number } {
  return {
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

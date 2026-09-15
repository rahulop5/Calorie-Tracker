import { describe, expect, it } from 'vitest';
import {
  buildPageMeta,
  paginationQuerySchema,
  toSkipTake,
} from '../src/schemas/pagination';

describe('paginationQuerySchema', () => {
  it('defaults to the first page', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('accepts query string numbers', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('rejects a page size above the maximum', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false);
  });

  it('rejects a page below one', () => {
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});

describe('buildPageMeta', () => {
  const query = { page: 1, pageSize: 20 };

  it('describes a partly filled last page', () => {
    expect(buildPageMeta(137, query)).toEqual({
      page: 1,
      pageSize: 20,
      total: 137,
      totalPages: 7,
      hasNext: true,
    });
  });

  it('reports no next page on the last one', () => {
    expect(buildPageMeta(137, { ...query, page: 7 }).hasNext).toBe(false);
  });

  it('reports one page when there is nothing to show', () => {
    expect(buildPageMeta(0, query)).toMatchObject({ totalPages: 1, hasNext: false });
  });
});

describe('toSkipTake', () => {
  it('converts a page number to an offset', () => {
    expect(toSkipTake({ page: 1, pageSize: 20 })).toEqual({ skip: 0, take: 20 });
    expect(toSkipTake({ page: 4, pageSize: 25 })).toEqual({ skip: 75, take: 25 });
  });
});

import { PaginationMeta } from '../types';

export interface ParsedPagination {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export function parsePagination(pageQuery?: any, limitQuery?: any): ParsedPagination {
  const page = Math.max(1, parseInt(String(pageQuery || 1), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(limitQuery || 10), 10) || 10));
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
    take: limit,
  };
}

export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

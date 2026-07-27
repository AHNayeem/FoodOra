/**
 * http.ts — thin data-access seam.
 *
 * Every service in this folder returns a Promise so the UI is already written
 * against an async API. Today they resolve mock data; swapping to a real
 * GraphQL/REST backend means changing only these functions, not the components.
 */

/** Simulate network latency for realistic loading states in development. */
export function mockDelay<T>(data: T, ms = 300): Promise<T> {
  return new Promise((resolve) => {
    if (process.env.NODE_ENV === "test") return resolve(data);
    setTimeout(() => resolve(data), ms);
  });
}

/** Paginated response envelope used by every list endpoint. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export function paginate<T>(all: T[], page = 1, pageSize = 12): Paginated<T> {
  const start = (page - 1) * pageSize;
  const items = all.slice(start, start + pageSize);
  return {
    items,
    total: all.length,
    page,
    pageSize,
    hasMore: start + pageSize < all.length,
  };
}

/** Standard single-resource envelope (mirrors a `data`/`error` GraphQL shape). */
export type Result<T> = { data: T; error: null } | { data: null; error: string };

export function ok<T>(data: T): Result<T> {
  return { data, error: null };
}

import { cursorFor } from './cursor';
import type { IConnection, IEdge, IPage } from './page.types';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type PageInput } from './page.input';

/** Clamps a client-supplied page window into something a database should run. */
export function toSkipTake(input?: PageInput | null): {
  skip: number;
  take: number;
  page: number;
  pageSize: number;
} {
  const page = Math.max(1, Math.trunc(input?.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(input?.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export function buildPage<T>(
  items: T[],
  total: number,
  window: { page: number; pageSize: number },
): IPage<T> {
  return {
    items,
    total,
    page: window.page,
    pageSize: window.pageSize,
    hasMore: window.page * window.pageSize < total,
  };
}

/**
 * Takes the `n + 1` rows the keyset query fetched and turns them into a
 * connection. Fetching one extra row is how `hasNextPage` is answered without a
 * second query.
 */
export function buildConnection<T extends { id: string; createdAt: Date }>(
  rows: T[],
  first: number,
  totalCount: number,
  hasPreviousPage = false,
): IConnection<T> {
  const hasNextPage = rows.length > first;
  const nodes = hasNextPage ? rows.slice(0, first) : rows;
  const edges: IEdge<T>[] = nodes.map((node) => ({ cursor: cursorFor(node), node }));

  return {
    edges,
    totalCount,
    pageInfo: {
      hasNextPage,
      hasPreviousPage,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
}

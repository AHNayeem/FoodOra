/**
 * pagination.js — page/pageSize in, `skip`/`take` out.
 *
 * Page-based rather than cursor-based because `Paginated<T>` in
 * `frontend/services/http.ts` is page-based and every list surface is written
 * against it. A cursor would be the better answer for an infinite feed and is
 * the right change to make *with* the frontend, not ahead of it.
 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** The query-string half of a list route's schema. Spread into `querystring.properties`. */
export const paginationProperties = Object.freeze({
  page: { type: "integer", minimum: 1, default: 1 },
  pageSize: { type: "integer", minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE },
});

/**
 * `{ page, pageSize }` → Prisma's `{ skip, take }`, plus the values back.
 *
 * The clamp is deliberate belt-and-braces: the schema above already refuses
 * `pageSize=100000`, and a route that forgets to spread it should still not be
 * able to ask PostgreSQL for a million rows.
 */
export function toSkipTake({ page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const safePage = Math.max(1, Math.trunc(Number(page) || 1));
  const safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(pageSize) || DEFAULT_PAGE_SIZE)));
  return { page: safePage, pageSize: safeSize, skip: (safePage - 1) * safeSize, take: safeSize };
}

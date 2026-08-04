import { Field, InputType, Int } from '@nestjs/graphql';

/** Hard ceiling. An unbounded `pageSize` is a denial-of-service parameter. */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 12;

/**
 * Offset pagination, matching `frontend/services/http.ts::Paginated<T>` exactly
 * — `{ items, total, page, pageSize, hasMore }`. Every existing list in the
 * prototype already reads that shape, so keeping it means no component changes
 * when a service swaps to GraphQL.
 */
@InputType({
  description:
    'Offset pagination: `{ items, total, page, pageSize, hasMore }` on the way back.',
})
export class PageInput {
  @Field(() => Int, { defaultValue: 1, description: '1-based page number.' })
  page: number = 1;

  @Field(() => Int, {
    defaultValue: DEFAULT_PAGE_SIZE,
    description: `Items per page. Capped server-side at ${MAX_PAGE_SIZE}.`,
  })
  pageSize: number = DEFAULT_PAGE_SIZE;
}

/**
 * Keyset pagination for the four append-heavy feeds where offset drifts as rows
 * arrive while the user scrolls: `notificationFeed`, `orderEvents`, `reviews`,
 * `auditLog` (D5 §Pagination).
 */
@InputType()
export class CursorInput {
  @Field(() => Int, { defaultValue: 20 })
  first: number = 20;

  @Field(() => String, { nullable: true, description: 'Opaque cursor from a previous page.' })
  after?: string;
}

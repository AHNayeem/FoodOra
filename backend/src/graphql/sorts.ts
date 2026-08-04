import { registerEnumType } from '@nestjs/graphql';

/**
 * Sort options are a **closed enum per resource**, never a free-form
 * `orderBy: [{ field, direction }]` (D5 §Filtering & sorting).
 *
 * An open sort API is an invitation to sort a million-row table by an unindexed
 * column, from a client, with no way to refuse. A closed one is a promise that every
 * option has an index behind it — here `users(created_at DESC)`, `users(name)` and
 * `users(last_login_at DESC)`, which is why `PRIMARY_ROLE` is absent despite being
 * an obvious thing to want: `@@index([primaryRole, status])` orders by role *then*
 * status, and offering it as a sort would return rows in an order the index cannot
 * produce without a full sort.
 *
 * These are real GraphQL enums rather than scalars — the opposite of the domain
 * vocabularies. The distinction is ownership: a domain vocabulary is a value the
 * frontend already stores in kebab-case and must round-trip verbatim; a sort key is
 * an API affordance this schema invents, so it may as well be introspectable and
 * autocompleted.
 */
export enum UserSort {
  NEWEST = 'NEWEST',
  OLDEST = 'OLDEST',
  NAME = 'NAME',
  LAST_LOGIN = 'LAST_LOGIN',
}

registerEnumType(UserSort, {
  name: 'UserSort',
  description: 'How to order the user directory. Every option is index-backed.',
});

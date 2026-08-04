import { registerAs } from '@nestjs/config';

import { loadEnvironment } from './environment';

/**
 * The catalog read side's limits and cache lifetimes.
 *
 * Unit 1 held these as module constants — `CANDIDATE_CAP = 500` in
 * `policies/listing.ts`, `MAX_RAIL_SIZE = 50` in the service, `TTL_SECONDS = 900` in
 * the Redis adapter. They were honest constants: each had a comment arguing for its
 * value. What made them wrong was not the numbers but the location. Every one of them
 * is a property of the *deployment* — how large the catalogue is, how often merchants
 * edit menus during service, how much staleness the business will accept — and a value
 * that varies per deployment does not belong in a file that has to be recompiled and
 * redeployed to change it.
 *
 * The domain constants survive as the defaults, so the policy still reads as a policy
 * and a unit test still has a number to reach for without a `ConfigService`.
 */
export const catalogConfig = registerAs('catalog', () => {
  const env = loadEnvironment();
  return {
    /** See `CATALOG_CANDIDATE_LIMIT` — the in-memory working set for one listing. */
    candidateLimit: env.CATALOG_CANDIDATE_LIMIT,
    /** Ceiling on the bare-`Int` rail limits, which no `PageInput` caps for us. */
    railLimit: env.CATALOG_RAIL_LIMIT,
    cache: {
      /**
       * Zero means "do not cache", and it is not a degenerate case — it is how you
       * bisect a suspected staleness bug in production without a deploy.
       */
      railsTtlSeconds: env.CATALOG_RAILS_TTL_SECONDS,
      menuTtlSeconds: env.CATALOG_MENU_TTL_SECONDS,
    },
  } as const;
});

export type CatalogConfig = ReturnType<typeof catalogConfig>;

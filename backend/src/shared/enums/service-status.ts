/**
 * The first entry in the vocabulary registry.
 *
 * `shared/enums/` holds the kebab-case unions that mirror `frontend/types/*` —
 * `VendorType`, `OrderStatus`, `CouponKind`, ~40 of them — as **plain
 * TypeScript**, with no GraphQL import anywhere near them. That is deliberate:
 * a domain file may read a vocabulary, and a domain file may not know what
 * GraphQL is (D1 §The dependency rule).
 *
 * `graphql/scalars.registry.ts` is where each vocabulary becomes a validated
 * custom scalar, so the kebab-case value reaches the wire verbatim (D5 §Enums).
 * They arrive with the modules that own them.
 *
 * This one is E1's own: what a dependency probe can report.
 */
export const SERVICE_STATUSES = ['up', 'degraded', 'down'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

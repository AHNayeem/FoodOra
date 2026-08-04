# D4 — Prisma Schema

The schema itself is the deliverable and it lives in
[`database/prisma/schema/`](../../database/prisma/schema/) — **169 models, 104
enums, ~6,000 lines**, split into 16 files by bounded context. It validates
against Prisma 6.19:

```bash
cd database
bun install
bun run validate   # → The schemas at prisma/schema are valid 🚀
bun run format
```

| File | Models | Contents |
| --- | ---: | --- |
| `main.prisma` | – | generator, datasource, the eight schema-wide conventions |
| `platform.prisma` | 13 | currencies, countries, languages, tax, settings, flags, translations, files, audit, outbox, idempotency |
| `identity.prisma` | 18 | users, RBAC/PBAC, credentials, sessions, tokens, devices, OTP, settings, addresses, favorites |
| `catalog.prisma` | 23 | cuisines, categories, vendors, branches, hours, amenities, menus, foods, options, nutrition, allergens, inventory |
| `orders.prisma` | 11 | cart, orders, items, options, lifecycle events, declines, refund requests, invoices, sequences |
| `payments.prisma` | 15 | providers, intents, transactions, refunds, webhooks, saved methods, wallet, ledger, payouts, membership |
| `promotions.prisma` | 8 | offers, coupons, scoping, claims, redemptions |
| `reviews.prisma` | 9 | reviews, aspects, tags, dishes, media, replies, votes, reports, aggregates |
| `delivery.prisma` | 13 | zones, areas, riders, documents, shifts, jobs, job orders, stops, offers, pings, ledger, remittances, withdrawals |
| `reservations.prisma` | 4 | booking policies, zones, reservations, table allocation |
| `dinein.prisma` | 11 | tables, QR config, sittings, rounds, service requests, POS shifts/tickets/sales |
| `subscriptions.prisma` | 12 | meal plans, tiers, meals, subscriptions, days, slots, skips, cycles |
| `catering.prisma` | 10 | services, packages, add-ons, quotes |
| `cms.prisma` | 9 | collections, documents, revisions, audit, contact, blog, testimonials, jobs |
| `notifications.prisma` | 6 | templates, notifications, channels, dispatches, segments, campaigns |
| `ai.prisma` | 7 | food profiles, conversations, messages, usage, recognition, search logs, term stats |

## Requirements checklist

**Relation names** — every relation is explicitly named
(`@relation("VendorBranches")`, `@relation("OrderCustomer")`). Not decoration:
`User` has 30 relations, several of them to the same model
(`PayoutAccount` → vendor *and* rider; `ExchangeRate` → base *and* quote
currency), and Prisma cannot disambiguate those without names. Named relations
also keep the generated client's field names stable across schema edits.

**Indexes** — every list screen's access path is a composite index in
`(scope, filter, sort)` order, plus partial and GIN/GiST indexes added by raw
migration. Full inventory in [D2 §Indexes](./D2-database-design.md#indexes).

**Enums** — 104, all with `@map`-ed kebab-case labels so a Postgres row reads
identically to the TypeScript union:

```prisma
enum OrderStatusKind {
  RIDER_ASSIGNED @map("rider-assigned")
  ON_THE_WAY     @map("on-the-way")
  DELIVERY_FAILED @map("delivery-failed")
  @@map("order_status_kind")
}
```

**Constraints** — natural-key uniques in the schema; check constraints,
partial uniques and the reservation exclusion constraint in hand-written
migrations (Prisma cannot express them). Listed in
[D2 §Constraints](./D2-database-design.md#constraints).

**Soft delete** — `deletedAt` on every mutable business entity, enforced by a
client extension; deliberately absent from financial and evidentiary tables.

**Reusable base model** — Prisma has no model inheritance or mixins, and
pretending otherwise would be a lie in a design document. The convention is
enforced three ways instead:

1. A documented field block, repeated verbatim (`main.prisma` §2–4).
2. A TypeScript kernel — `shared/kernel/entity.ts` exposes `BaseFields`,
   `SoftDeletable` and `Versioned`, and every repository's row type is
   `BaseFields & …`, so a missing column is a compile error.
3. A `scripts/check-base-fields.ts` guard in CI that parses the schema AST and
   fails on any model missing `createdAt`/`updatedAt` that is not on the
   allowlist of append-only tables.

Client extensions supply the *behaviour* the base model would have carried:

```
soft-delete.extension.ts      filters deletedAt, rewrites delete → update
audit.extension.ts            stamps createdBy/updatedBy from RequestContext
optimistic-lock.extension.ts  asserts a version match on every update
decimal.extension.ts          Decimal → number at the read boundary
```

**Pagination-friendly** — every listable model has a stable, unique,
monotonic sort key. IDs are prefixed ULIDs, so `id` alone is a valid cursor and
`(createdAt DESC, id DESC)` is a total order with no ties. Indexes are declared
in that direction (`@@index([vendorId, status, placedAt(sort: Desc)])`) so
keyset pagination is an index-only range scan. See
[D5 §Pagination](./D5-graphql-architecture.md#pagination).

**Performance** — `relationJoins` preview enabled so Prisma emits real
`LATERAL` joins instead of the N+1-shaped two-query strategy; DataLoader per
request for anything the resolver graph still fans out; denormalised counters
for the aggregates on hot cards; `Decimal` for exact money; partitioning
planned for the four append-heavy tables.

## Frontend contract mapping

The rule from the brief — *every backend module should expose interfaces that
match the current mock data structure* — is checked model by model. Every
`types/*.ts` interface is served without reshaping. The five places the storage
shape differs from the read model, and how each is recomposed:

| Read model (`types/*`) | Storage | Recomposition |
| --- | --- | --- |
| `Vendor` (flat, one location) | `Vendor` + `VendorBranch` | `CatalogService.toVendorModel(vendor, primaryBranch)` |
| `Vendor.hours: WeeklyHours` | `BranchHour` rows | folded into the 7-key record; split services merge |
| `Order.lifecycle` (nested) | flattened columns + `OrderEvent` | `OrderResolver.lifecycle()` composes |
| `DeliveryJob.completedStopIds` | `DeliveryStop.completedAt` | stops with a completion, ordered by it |
| `CustomerSettings.notifications` | `NotificationPreference` rows | keyed back into the topic record |

And the fields that are **computed, never selected**:

| Field | Computed from |
| --- | --- |
| `Vendor.distanceKm` | caller coordinates ↔ branch lat/lng |
| `Vendor.isOpen` | `BranchHour` + `BranchClosure` + `acceptingOrders`, in the branch timezone |
| `CouponStatus`, `HeldCoupon.remaining` / `daysLeft` | window + `usageLimit` + redemptions |
| `ReviewSummary`, `RatingPoint`, `LovedDish` | corpus + `RatingAggregate` |
| `TimeSlot`, `DayAvailability`, `TableStatus`, `ReservationDaySummary` | hours + floor plan + the book |
| `PlannedDelivery` | subscription rules + skips + clock |
| `RiderWallet`, `RiderCashPosition`, `RiderEarningsSummary` | `RiderLedgerEntry` + completed jobs |
| `VendorStats`, `RevenuePoint`, `HourlyPoint`, `BestSeller` | SQL aggregates over `Order` / `OrderItem` |
| `DineInRoundStatus` | elapsed time since `sentAt` (unless `servedAt` is set) |
| `CmsStatus`, `CmsDocumentView.coverage` | publication window + draft + locale coverage |

## ID strategy

```ts
// common/ids/id.service.ts
const PREFIX = { vendor: 'ven', user: 'usr', food: 'fd', order: 'ord', … } as const;

next(kind: keyof typeof PREFIX): string {
  return `${PREFIX[kind]}_${ulid()}`;   // ven_01J8ZK9Q7X4M2P0T6R3B5W8N1C
}
```

Prefixed so a log line or a support ticket is self-describing; ULID so ids sort
by creation time (a valid cursor, and good B-tree locality on insert); string so
the Phase C seed ids (`ven_dhaka-biryani-house`, `usr_1`, `cus_thai`) can be
kept **verbatim** by the seeders. Nothing in the frontend parses an id, so both
generations coexist safely.

## Known limitations

- **Multi-file schema** requires Prisma ≥ 6.7. Pinned to `^6.16.2`.
- `package.json#prisma` is deprecated in favour of `prisma.config.ts` from
  Prisma 7; the migration is a one-file change and is deferred until the
  backend upgrades.
- The reservation **exclusion constraint** needs a `tstzrange` column on
  `reservation_tables` maintained by trigger, because Prisma has no range type.
  Written in the migration; the application also checks overlap in the same
  transaction so the error message is a domain error rather than a 23P01.
- `postgresqlExtensions` is still a preview feature; `citext`, `pg_trgm`,
  `unaccent` and `btree_gin` must exist in the target database.
- PostGIS is deliberately **not** required. Proximity uses `earthdistance` +
  GiST, which is enough for "within N km" on a city-scale dataset. If polygon
  zone matching outgrows `ZoneArea` labels, PostGIS becomes a follow-up
  migration, not a redesign — `DeliveryZone.boundary` is already GeoJSON.

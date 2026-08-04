# D2 — Database Design

PostgreSQL 16. **169 models, 104 enums**, in
[database/prisma/schema/](../../database/prisma/schema/), one file per bounded
context. The schema validates against Prisma 6.19 (`bun run validate` in
`database/`).

## Normalisation

3NF as the default, with three named, deliberate exceptions.

**Normalised where Phase C used arrays or JSON**, because these are queried,
joined or counted:

| Phase C shape | Table | Why |
| --- | --- | --- |
| `Category.keywords: string[]` | `CategoryKeyword` | search indexes and weights terms |
| `Vendor.hours: WeeklyHours` | `BranchHour` | a split lunch/dinner service is two rows; JSON cannot express it |
| `Vendor.cuisineIds/dietary` | `VendorCuisine`, `VendorDietary` | facet counts are index scans |
| `OrderLifecycle.rejectedRiderIds` | `OrderRiderDecline` | dispatch excludes riders with an anti-join |
| `Subscription.skippedDates` | `SubscriptionSkip` | "what am I cooking tomorrow" is one index scan |
| `Reservation.tableIds` | `ReservationTable` | availability arithmetic joins on it |
| `Review.aspects/tags/dishIds/media` | four child tables | aspect averages and tag counts are aggregates |
| `CustomerSettings.notifications` | `NotificationPreference` | a new topic is a row, not a JSON migration |
| `AppNotification.channels` | `NotificationChannelRecord` | "why no email" is answered per channel |
| `DeliveryJob.completedStopIds` | `DeliveryStop.completedAt` | progress belongs on the stop |

**Kept as JSONB, on purpose:**

1. **Snapshots** — `Order.vendorSnapshot`, `Order.addressSnapshot`,
   `Order.riderSnapshot`, `Reservation.venueSnapshot`,
   `Subscription.planSnapshot`, `CateringQuote.serviceSnapshot`,
   `DineInRoundItem.options`. These are immutable copies whose *whole purpose*
   is to not be joined. The live FK sits beside each one for analytics.
2. **The CMS value map** — `CmsDocument.values` / `draft`, and
   `CmsCollection.fields`. The shape is declared at runtime by the collection,
   so a relational decomposition would require a migration every time an editor
   adds a field — the exact thing the C26 design exists to prevent.
3. **Provider payloads** — `PaymentTransaction.rawPayload`,
   `PaymentWebhookEvent.payload`. Recording what a gateway actually said is only
   useful verbatim.

**Denormalised counters**, maintained inside the same transaction as their
source and reconciled nightly:

- `Vendor.rating` / `reviewCount`, `FoodItem.rating` / `reviewCount`,
  `MealPlan.rating` / `reviewCount` — already read directly by the frontend.
- `RatingAggregate` — per-subject lifetime + monthly histogram rows, so the
  vendor card and the dashboard trend need no scan of the corpus.
- `Offer.claimed`, `Coupon.totalRedeemed` — the scarcity meter and the global cap.
- `Wallet.balance`, `LedgerAccount.balance`, `InventoryItem.onHand` — running
  balances beside their append-only movement logs.
- `Order.itemCount` and the lifecycle timestamps (`acceptedAt`, `readyAt`, …) —
  the kitchen board filters and SLA reports read them without touching
  `OrderEvent`.

## Constraints

- **Primary keys** — `VarChar(40)` app-minted prefixed ULID on every aggregate
  and child entity the frontend addresses; composite PKs on pure join tables.
- **Foreign keys** with explicit `onDelete`:
  - `Cascade` where the child cannot exist alone (`OrderItem`, `CartItem`,
    `ReviewMedia`, `DeliveryStop`, `SubscriptionSkip`).
  - `Restrict` where deletion would destroy history (`Order.vendor`,
    `Subscription.plan`, `PaymentIntent.provider`, `Country.currency`).
  - `SetNull` where the reference is informational (`Order.rider`,
    `OrderItem.food`, `Review.order`).
- **Unique** — natural keys everywhere: `Vendor.slug`, `FoodItem.slug`,
  `Coupon.code`, `Order.orderNumber`, `Invoice.invoiceNumber`,
  `(SocialIdentity.provider, providerUid)`, `(PaymentProvider, providerRef)`,
  `(PaymentWebhookEvent.providerId, eventId)`, `(CouponRedemption.couponId,
  orderId)`, `(Review.orderId, subject)`, `(DeliveryStop.jobId, sequence)`,
  `(Reservation.reference)`, `(CmsDocument.collection, key)`.
- **Check constraints** added by migration (Prisma cannot express them):

```sql
ALTER TABLE reviews          ADD CONSTRAINT reviews_rating_range      CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE food_items       ADD CONSTRAINT food_price_nonneg         CHECK (price >= 0);
ALTER TABLE food_items       ADD CONSTRAINT food_spicy_range          CHECK (spicy_level BETWEEN 0 AND 3);
ALTER TABLE vendors          ADD CONSTRAINT vendor_price_level_range  CHECK (price_level BETWEEN 1 AND 4);
ALTER TABLE orders           ADD CONSTRAINT order_total_nonneg        CHECK (total >= 0);
ALTER TABLE orders           ADD CONSTRAINT order_pickup_has_no_addr  CHECK (fulfillment <> 'pickup' OR address_snapshot IS NULL);
ALTER TABLE tax_rules        ADD CONSTRAINT tax_rate_range            CHECK (rate >= 0 AND rate <= 1);
ALTER TABLE vendor_branches  ADD CONSTRAINT branch_eta_order          CHECK (eta_min_minutes <= eta_max_minutes);
ALTER TABLE reservations     ADD CONSTRAINT reservation_time_order    CHECK (starts_at < ends_at);
ALTER TABLE reservations     ADD CONSTRAINT reservation_party_positive CHECK (party_size > 0);
ALTER TABLE refunds          ADD CONSTRAINT refund_amount_positive    CHECK (amount > 0);
ALTER TABLE payout_accounts  ADD CONSTRAINT payout_owner_exactly_one  CHECK ((vendor_id IS NULL) <> (rider_id IS NULL));
```

- **Partial unique indexes** the ORM cannot declare:

```sql
CREATE UNIQUE INDEX vendor_branches_primary_uq
  ON vendor_branches (vendor_id) WHERE is_primary AND deleted_at IS NULL;
CREATE UNIQUE INDEX addresses_default_uq
  ON addresses (user_id) WHERE is_default AND deleted_at IS NULL;
CREATE UNIQUE INDEX user_role_assignments_platform_uq
  ON user_role_assignments (user_id, role_id) WHERE vendor_id IS NULL;
CREATE UNIQUE INDEX user_permissions_platform_uq
  ON user_permissions (user_id, permission_id) WHERE vendor_id IS NULL;
CREATE UNIQUE INDEX saved_methods_default_uq
  ON saved_payment_methods (user_id) WHERE is_default AND deleted_at IS NULL;
```

- **Exclusion constraint** — the one integrity rule that actually matters for
  bookings, and the only place double-booking can be prevented rather than
  detected:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE reservation_tables ADD COLUMN period tstzrange;  -- maintained by trigger from the reservation
ALTER TABLE reservation_tables
  ADD CONSTRAINT reservation_tables_no_overlap
  EXCLUDE USING gist (table_id WITH =, period WITH &&)
  WHERE (period IS NOT NULL);
```

## Indexes

Composite indexes are ordered **(scope, filter, sort)** — the shape every list
screen actually queries.

| Index | Serves |
| --- | --- |
| `orders(vendorId, status, placedAt DESC)` | merchant board, kitchen queue |
| `orders(userId, placedAt DESC)` | customer order history |
| `orders(status, placedAt DESC)` | admin live ops |
| `orders(riderId, status)` | rider's active trips |
| `orders(scheduledFor)` | the scheduled-order sweeper |
| `reservations(vendorId, date, status)` | the availability query |
| `reservations(vendorId, startsAt, endsAt)` | overlap arithmetic |
| `delivery_jobs(zoneId, status, expiresAt)` | the offer pool |
| `job_offers(riderId, outcome, offeredAt DESC)` | a rider's offer feed |
| `notifications(userId, readAt, at DESC)` | unread badge + feed |
| `reviews(subject, subjectId, status, createdAt DESC)` | the review list |
| `coupons(startsAt, endsAt, deletedAt)` | live-coupon scans |
| `food_items(vendorId, deletedAt, isAvailable)` | menu render |
| `vendor_branches(city, countryCode, deletedAt)` | directory listing |

Plus, added by migration:

```sql
-- Trigram search on names (spec: Smart Search, fuzzy matching)
CREATE INDEX vendors_name_trgm   ON vendors      USING gin (name gin_trgm_ops);
CREATE INDEX food_items_name_trgm ON food_items  USING gin (name gin_trgm_ops);
CREATE INDEX categories_name_trgm ON categories  USING gin (name gin_trgm_ops);

-- Full-text search vectors, maintained as generated columns
ALTER TABLE food_items ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', unaccent(name || ' ' || description))) STORED;
CREATE INDEX food_items_tsv ON food_items USING gin (search_tsv);

-- Geospatial proximity. PostGIS is optional; this covers "within N km".
CREATE INDEX vendor_branches_geo ON vendor_branches USING gist (
  ll_to_earth(lat::float8, lng::float8)
);

-- JSONB containment for CMS value search
CREATE INDEX cms_documents_values_gin ON cms_documents USING gin (values jsonb_path_ops);

-- Partial indexes for hot, selective predicates
CREATE INDEX orders_active ON orders (vendor_id, placed_at DESC)
  WHERE status IN ('placed','confirmed','preparing','packing','ready');
CREATE INDEX riders_available ON riders (zone_id)
  WHERE is_on_shift AND status = 'active' AND deleted_at IS NULL;
```

**Partitioning.** `rider_location_pings` is `PARTITION BY RANGE (at)` monthly,
pruned at 30 days. `audit_logs`, `notifications`, `notification_dispatches` and
`search_query_logs` become partitioned once volume justifies it — the schema
already avoids anything that would block it (no FK *into* those tables).

## Soft delete

`deletedAt IS NULL` means active, on every mutable business entity. Enforced by
a Prisma client extension so no query can forget it:

```ts
// infrastructure/prisma/soft-delete.extension.ts
query: {
  $allModels: {
    async findMany({ model, args, query }) {
      if (SOFT_DELETE_MODELS.has(model) && !args.where?.deletedAt) {
        args.where = { ...args.where, deletedAt: null };
      }
      return query(args);
    },
    async delete({ model, args, query }) { /* → update({ deletedAt: now }) */ },
  },
}
```

Bypassed explicitly via `prisma.$withDeleted` for admin restore and for
compliance exports.

**Deliberately NOT soft-deletable** — these are financial or evidentiary records
and are never deleted, only superseded: `PaymentIntent`,
`PaymentTransaction`, `Refund`, `LedgerEntry`, `OrderEvent`, `AuditLog`,
`CmsRevision`, `CmsAuditEntry`, `StockMovement`, `RiderLedgerEntry`,
`NotificationDispatch`, `LoginAttempt`, `OutboxEvent`.

**GDPR erasure** is a separate operation from soft delete:
`UserErasureService` pseudonymises `User.name`/`email`/`phone`, drops
`Credential`, `SocialIdentity`, `Device` and `Address`, and rewrites
review author snapshots to "Deleted user" — while leaving orders, invoices and
ledger entries intact, because tax law requires them.

## Audit fields

Every business row: `createdAt`, `updatedAt`, `deletedAt`. Anything a human
edits also carries `createdBy` / `updatedBy` / `deletedBy` (user id), stamped by
a client extension from `RequestContext`, so a handler cannot forget.

Beyond the row-level fields, three separate trails:

- `AuditLog` — the platform-wide "who did what", written by an interceptor
  around every mutating resolver, with a shallow field diff.
- `OrderEvent` — the order's own append-only lifecycle log (status, actor, note).
- `CmsAuditEntry` + `CmsRevision` — content history, with reversible publishes.

## Optimistic locking

`version Int @default(0)` on every mutable aggregate. Writes:

```ts
const { count } = await tx.order.updateMany({
  where: { id, version: expectedVersion },
  data: { ...changes, version: { increment: 1 } },
});
if (count === 0) throw new ConflictError('order.conflict');
```

This is what keeps two dashboard tabs from silently overwriting each other, and
what makes "accept" idempotent under a double-tap. GraphQL surfaces it as
`extensions.code = 'CONFLICT'`; the mutation input carries `expectedVersion`.

Where a *count* is the contended resource — `Offer.claimed`,
`Coupon.totalRedeemed`, `InventoryItem.onHand`, wallet and ledger balances —
optimistic locking is the wrong tool. Those use atomic
`UPDATE … SET x = x + n WHERE … AND x + n <= limit` with the guard in the
predicate, so a race cannot oversell.

## Timestamps

- **Instants** are `timestamptz(3)`, always UTC, named `*At`.
- **Plain local dates** are `date` — `Reservation.date`,
  `Subscription.startDate`, `SubscriptionSkip.date`, `CateringQuote.eventDate`,
  `ExchangeRate.effectiveOn`. A Friday booking is Friday everywhere; converting
  it to an instant would move it across a timezone boundary.
- **Local times** are `varchar(5)` `"HH:mm"` — `BranchHour.openTime`,
  `Reservation.time`. Same reason.
- Where both are needed, both are stored: `Reservation` keeps `date` + `time`
  for display and `startsAt` / `endsAt` (derived from the branch timezone) for
  the overlap query. The pair is written together; neither is authoritative
  alone.
- `VendorBranch.timezone` and `Country.timezone` are the only sources for
  local-day boundaries. Analytics bucket with
  `date_trunc('day', placed_at AT TIME ZONE b.timezone)`.

## Enums vs lookup tables

Both, by a clear rule:

- **Postgres enum** for a closed vocabulary the *code* switches on — order
  status, payment method, dietary tag, review aspect. Labels are `@map`-ed to
  the frontend's kebab-case, so a row reads identically to the TypeScript union.
  Adding a member is a migration, which is correct: new code has to handle it.
- **Lookup table** for a vocabulary *operators* extend without a deploy —
  `Country`, `Currency`, `Language`, `TaxRule`, `Role`, `Permission`, `Amenity`,
  `PaymentProvider`, `MembershipPlan`, `NotificationTemplate`,
  `NotificationSegment`, `CmsCollection`, `Setting`, `FeatureFlag`.

## Global platform support

| Requirement | Mechanism |
| --- | --- |
| Multi-country | `Country` table; `countryCode` on users, branches, zones, plans, quotes, invoices |
| Multi-currency | `Currency` table; every money-bearing row carries its own `currency` and is **never converted**. `ExchangeRate` exists only for cross-country reporting |
| Timezone | `Country.timezone`, `VendorBranch.timezone`, `User.timezone`; all local-day logic reads one of them |
| Language | `Language` + `CountryLanguage`; catalog text via `Translation`, editorial via `CmsLocalizedText` inside `CmsDocument.values`; `Language.direction` drives RTL |
| Tax | `TaxRule` — dated, scoped (country → region → city → vendor), per `appliesTo`, inclusive or additive. Rate + label **snapshotted** onto every priced document |
| Regional pricing | `VendorBranch` fees per location; `DeliveryZone` fare rules; `CommissionRule` and `MembershipPlan` per country/type |
| Configurable settings | `Setting` (platform → country → vendor resolution) and `FeatureFlag` with five strategies |
| White label | `CmsDocument` collection `site` + `Setting` scope `COUNTRY`, so brand copy and theme are data |

## Money

`Decimal @db.Decimal(14, 2)` (Postgres `numeric`), not minor-unit integers, and
not float.

The frontend types money as a plain `number` in the entity's currency, and BDT
renders with zero fraction digits while USD renders two. Minor-unit integers
would have forced every read to know each currency's exponent to reconstruct
that `number` — a conversion in both directions, in every resolver, that gets
one currency wrong eventually. `numeric` is exact, sums exactly, and maps to the
existing contract with a single `.toNumber()` at the GraphQL boundary. The cost
is that `Decimal` must not leak into arithmetic done in JS floats; the `Money`
value object in `common/money` is the guard, and the boundary mapper is the only
place `.toNumber()` is allowed.

Rates and fractions are `Decimal(6, 4)` — `0.0875` is exactly 8.75%.

## Migrations & seeds

- `prisma migrate dev` for authoring; `prisma migrate deploy` in CI/CD.
- Raw SQL above lives in hand-edited migration files, committed alongside the
  generated ones.
- **Expand/contract** for anything destructive: add nullable → backfill in a
  batched job → switch reads → make non-null → drop the old column, each a
  separate release. No migration takes an exclusive lock on `orders`.
- Seeds are split and idempotent (`upsert` by natural key):
  `01-regions` → `02-rbac` → `03-settings-flags` → `04-payment-providers` →
  `05-cms-collections` → `06-catalog` → `07-demo-users` → `08-demo-activity`.
  Seeds 01–05 are **production** reference data. 06–08 reuse the Phase C seed
  ids verbatim (`ven_*`, `usr_*`, `cus_*`, …) so every deep link and screenshot
  from the prototype still resolves.

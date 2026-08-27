# FoodOra — Database Design

**Status:** finalised and verified against real PostgreSQL, 2026-08-27.
**Schema:** [`database/prisma/schema/`](../database/prisma/schema/) — 18 files, 184 models, 127 enums.
**Engine floor:** PostgreSQL 12+ (verified on 18.4). Extensions: `pg_trgm`, `unaccent`, `citext`, `btree_gin`.

This document is the authority on the FoodOra data model for the backend that
comes next. It supersedes [`docs/backend/D2`](./backend/D2-database-design.md)
and [`D4`](./backend/D4-prisma-schema.md), which describe the same schema as
designed for the removed NestJS/GraphQL stack; those remain as the historical
record and should not be used to plan new work.

The product source of truth is the current frontend — [`Analysis.md`](../Analysis.md),
[`frontend/docs/GAP - Implement.md`](../frontend/docs/GAP%20-%20Implement.md) and
the `frontend/types/*` modules. Every table below exists to serve a type in that
tree, and the mapping is given in §10.

---

## 1. What changed in this phase, and why

The schema was already substantially complete and well argued. The audit found
**three whole modules with no database support at all**, one **financial model
that could not be traced**, and a handful of **enums and columns narrower than
the frontend they serve**. Nothing was rewritten; 15 tables were added and 8
existing ones extended.

| # | Gap found | Frontend authority | Closed by |
|---|-----------|--------------------|-----------|
| 1 | Support tickets / disputes — no table. The platform's answer to "my order was wrong" had nowhere to live and the operations desk had no queue. | `types/support.ts`, `stores/support.ts` | `SupportTicket`, `SupportTicketEvent` |
| 2 | Order contact threads — no table. "I'm at the blue gate" had nowhere to go, and a dispute record is the wrong shape for it. | `types/conversation.ts`, `stores/order-chat.ts` | `OrderThread`, `OrderThreadEntry` |
| 3 | Onboarding applications — no table. A vendor could be `PENDING` but nothing recorded what was applied for, who reviewed it, or why they said no. | `types/onboarding.ts`, `lib/vendor-onboarding.ts`, `lib/rider-onboarding.ts` | `VendorApplication`, `VendorApplicationBranch`, `RiderApplication`, `OnboardingDocument`, `OnboardingEvent` |
| 4 | Commission was one number (`Order.commission`). No rate snapshot, no commissionable base, no vendor net, no platform take — so a statement could not be itemised and a renegotiated rate would restate history. | `types/finance.ts::OrderCommission` | `OrderCommission` + `Order.commissionRate` |
| 5 | Rider earnings per order — nothing. A real delivery produced no earning record, so the rider's wallet and the order's books were two different realities. | `types/finance.ts::OrderRiderEarning` | `OrderRiderEarning` |
| 6 | **A payout could not be traced to the orders that made it.** `Payout` had no line items and `Order` had no settlement reference. A statement was a claim. | `types/finance.ts::VendorSettlement.orderIds` | `PayoutOrder`, `Order.settlementRef`, `Payout.periodRef` |
| 7 | Manual settlement corrections — nothing. `Payout.deductions` was an unexplained lump. | `types/finance.ts::SettlementAdjustment` | `SettlementAdjustment` |
| 8 | `OrderStatusKind` had 16 of the frontend's **17** statuses — `scheduled` was missing, so a scheduled order could not be represented at all. | `types/order.ts::OrderStatus` | enum member, positioned first |
| 9 | `RefundStatusKind` ended at `approved`. There was no way to say "we decided to pay this **and** the money has gone back" — the type file calls this out as the defect it was. | `types/order.ts::RefundStatus` | `REFUNDED` member |
| 10 | The refund route (`wallet`/`card`/`cash`), decision time and settlement time were all absent from the order. | `types/order.ts::OrderLifecycle` | `RefundMethodKind`, `Order.refundMethod` / `refundDecidedAt` / `refundSettledAt` |
| 11 | The counter-side handover — the restaurant's failed-code lockout and the four-point checklist — was not stored. | `types/order.ts::HandoverCheck` | `HandoverCheckKind`, `Order.handoverAttempts` / `handoverVerifiedAt` / `handoverChecks` |
| 12 | Customer blocking had a status but no grounds, no moderator and no history. | `types/customer.ts` | `AccountBlockReason`, `User.blockReason`/`blockedAt`/`blockedById`, `AccountModerationEvent` |
| 13 | Staff: `VendorStaff.userId` was NOT NULL, so an **invitation could not exist** — but there is no mail server, and the frontend is explicit that a staff member is a record, not an account. No role, no invited state, no permission delta. | `types/staff.ts` | nullable `userId`, `StaffRoleKind`, `StaffStatusKind`, invite columns, `VendorStaffPermission` |
| 14 | `DeliveryZone` had no `deliveryRadiusKm` — the cross-zone reach serviceability answers with. | `types/delivery.ts::DeliveryZone` | column |
| 15 | `ZoneArea` was a bare label. `DeliveryStop.lat/lng` are NOT NULL but a saved address may have no coordinates, so nothing could supply the missing geography. | `lib/mock/drop-points.ts` | `ZoneArea.lat`/`lng`/`label` |
| 16 | `OrderEvent.meta` was untyped JSON, so "every order the kitchen asked for more time on" was a JSONB scan. | `types/order.ts::OrderEventDetail` (G45) | `OrderEventDetailKind` column + index |
| 17 | `VendorStatus` had no `REJECTED`; `RiderStatus` had no `DRAFT` or `REJECTED`. | `types/onboarding.ts` | enum members, positioned |
| 18 | Two deferred defects (DSC-1, DSC-2) whose stated trigger — "the first migration touching cart/order tables" — this work met. | [`deferred-schema-changes.md`](./backend/deferred-schema-changes.md) | composite `CartItem` key; `orders(couponId, status)` index |

---

## 2. Core entities

184 models across 18 bounded contexts, one file each.

| Context | File | Models | The aggregate root |
|---|---|---|---|
| Identity | `identity.prisma` | 19 | `User` — accounts, credentials, sessions, devices, roles, permissions, addresses, moderation |
| Catalog | `catalog.prisma` | 24 | `Vendor` (brand) + `VendorBranch` (location), menus, foods, options, inventory, staff |
| Ordering | `orders.prisma` | 11 | `Order` — cart, checkout, the event log, invoices |
| Payments & money | `payments.prisma` | 19 | `PaymentIntent`, `LedgerEntry`, `Payout`, `OrderCommission` |
| Delivery | `delivery.prisma` | 13 | `DeliveryJob` (a trip) + `Rider` |
| Onboarding | `onboarding.prisma` | 5 | `VendorApplication`, `RiderApplication` |
| Support | `support.prisma` | 4 | `SupportTicket`, `OrderThread` |
| Promotions | `promotions.prisma` | 8 | `Offer` (campaign) + `Coupon` (ticket) |
| Reviews | `reviews.prisma` | 9 | `Review` |
| Notifications | `notifications.prisma` | 6 | `Notification` |
| Dine-in & POS | `dinein.prisma` | 11 | `DineInSession`, `PosSale` |
| Reservations | `reservations.prisma` | 4 | `Reservation` |
| Catering | `catering.prisma` | 10 | `CateringService`, `CateringQuote` |
| Subscriptions | `subscriptions.prisma` | 12 | `MealPlan`, `Subscription` |
| CMS & content | `cms.prisma` | 9 | `CmsDocument`, `BlogPost` |
| AI & search | `ai.prisma` | 7 | `AiConversation`, `SearchQueryLog` |
| Platform | `platform.prisma` | 13 | `Country`, `Setting`, `AuditLog`, `OutboxEvent`, `FileAsset` |
| Conventions | `main.prisma` | — | generator, datasource, the eight rules |

### The eight conventions (`main.prisma`)

1. **IDs are application-generated, prefixed, sortable strings** (`ven_01J8…`). Join tables use composite keys.
2. **Audit fields on every persisted row** — `createdAt`, `updatedAt`, `deletedAt`, plus `createdBy`/`updatedBy` where a human edits.
3. **Soft delete** = `deletedAt IS NULL` means active. Immutable financial and append-only records deliberately have **no** `deletedAt`.
4. **Optimistic locking** — `version Int` on mutable aggregates; writes are `updateMany({ where: { id, version } })` and a 0-row result is a conflict. Append-only tables have no `version`.
5. **Money is `Decimal(14,2)`**, rates `Decimal(6,4)`. Never float.
6. **Enum labels are stored in the frontend's kebab-case vocabulary via `@map`.** The Prisma *client* does not speak it — see §8, this is a real backend obligation.
7. **Snapshots are JSON beside a live FK.** The JSON serves the read model; the FK serves joins and integrity.
8. **Derived state is never stored** — no `isExpired`, no `isUsed`, no reservation-slot table, no settlement table. The exceptions are denormalised counters maintained transactionally (`Vendor.rating`, `Offer.claimed`, `RatingAggregate`).

---

## 3. The order model

`Order` is the immutable record produced at checkout, plus the mutable working
state it accumulates. The frontend's nested `OrderLifecycle` is **flattened into
columns** so "every order that blew its promised time" is an indexed query
rather than a JSON scan, and `OrderEvent` carries what a status cannot say.

```
Order ──┬── OrderItem ── OrderItemOption
        ├── OrderEvent          append-only; the only honest timeline
        ├── OrderRiderDecline   so dispatch excludes by anti-join, not array scan
        ├── PaymentIntent ──┬── PaymentTransaction
        │                   └── Refund
        ├── RefundRequest       the customer's claim (≠ the money moving)
        ├── Invoice             gap-free numbering via NumberSequence
        ├── OrderCommission     1:1, stamped at completion, immutable
        ├── OrderRiderEarning   1:1, stamped at completion, immutable
        ├── PayoutOrder         which run paid for it
        ├── DeliveryJobOrder    which trip carried it
        ├── SupportTicket       disputes
        ├── OrderThread         conversations
        └── Review
```

### The 17 statuses, in ordinal order

`scheduled` → `placed` → `confirmed` → `preparing` → `packing` → `ready` →
`rider-assigned` → `picked-up` → `on-the-way` → `arrived` → `delivered` →
`completed` · `rejected` · `cancelled` · `delivery-failed` → `returned` ·
`refunded`

`scheduled` is the entry state of a future-slot order and the only status no
transition reaches — an order is *born* there or born `placed`. It sorts **first**,
which is why the migration positions it with `ADD VALUE … BEFORE 'placed'`
rather than appending. `delivery-failed` is not terminal: it forks to
`on-the-way` or `returned`.

The transition graph and the actor permissions are **domain code**, ported from
`frontend/lib/order-machine.ts`. The database stores only where the order got to
and who moved it.

### Completion is the idempotency boundary

`Order.settledAt` is the guard. The completion transition writes, in one
transaction: the status, an `OrderEvent`, `OrderCommission`, `OrderRiderEarning`,
the ledger legs, the rider ledger entries and the stock movement — all under
`WHERE id = ? AND "settledAt" IS NULL`. A replay matches zero rows and does
nothing. Verified: §9.

---

## 4. The financial model

The single most important structural rule, taken from `types/finance.ts`:

> **`OrderCommission` and `OrderRiderEarning` are STORED. `VendorSettlement`,
> `RiderSettlement` and `PlatformFinancials` are DERIVED.**

Stored, because the rate that applied is the rate that applied — a vendor
renegotiating tomorrow must not silently restate last week's books. Derived,
because a settlement is an aggregate over the stored rows, and deriving it is
what makes the restaurant's earnings page, the admin's payout run and platform
analytics agree *by construction* rather than by three services doing similar
sums.

```
                        ┌── OrderCommission ────┐
Order (completed) ──────┤   rate, gross,        │   settlementRef = "2026-W35"
  settledAt             │   commissionable,     ├──────────────┐
  settlementRef         │   commission,         │              │
                        │   vendorNet,          │              ▼
                        │   platform, tax, tip  │      (derived aggregate)
                        └───────────────────────┘      VendorSettlement
                        ┌── OrderRiderEarning ──┐              │
                        │   base, distance,     │              ▼
                        │   peak, batch, tip,   │           Payout  ── PayoutOrder ── Order
                        │   payoutTotal,        │              ▲         (the line items)
                        │   cashCollected       │              │
                        └───────────────────────┘   SettlementAdjustment
                                                     (signed corrections)
LedgerEntry — double entry, SUM(amount) = 0 per transactionRef. The only place
              money moves. Wallet, rider and vendor balances are projections.
```

### Traceability

`Order.settlementRef` and `Payout.periodRef` hold the same string (`"2026-W35"`),
and `PayoutOrder` records what each order contributed **at the moment the run
happened**. Re-deriving a paid line from the order later would let a subsequent
refund silently restate a statement already sent. Verified:
`SUM(PayoutOrder.netAmount) + Payout.adjustments = Payout.netAmount`.

### Cash is a liability, not earnings

`OrderRiderEarning.cashCollected` is deliberately separate from `payoutTotal`.
Doorstep cash is platform money the rider is holding; what the platform
transfers is fares *less* the float, and a week is allowed to net negative so
the ledger says so instead of clamping. `RiderLedgerEntry.affectsCash`
separates the two axes: `available` is what we owe the rider, `cashInHand` is
what the rider owes us.

### Commission reversal

`CommissionStatus.REVERSED` exists because a refunded order must not keep
earning the platform its cut, and the honest way to say so is a state on the
charge rather than a deletion of it — the row stays, so a statement shows the
charge *and* its reversal instead of a gap.

### What is NOT stored

`SettlementStatus` has two members with no table: `open` (the period is still
running) and `pending` (closed and owed). Both are states of a period with **no
payout row yet**, so storing them would mean minting a payout for money nobody
has agreed to move.

---

## 5. The delivery model

The unit of work is a **trip**, not an order: `DeliveryJob` carries the money,
the distance and the progress, and per-order detail lives on its stops. That is
what makes batching a data shape instead of a special case.

```
DeliveryJob ──┬── DeliveryJobOrder ── Order      (a batch has several)
              ├── DeliveryStop                   pickup/dropoff, ordered by `sequence`
              ├── JobOffer ── Rider              a decline is a row, not a deletion
              ├── RiderLocationPing
              └── OrderRiderEarning

DeliveryZone ──┬── ZoneArea (area + centroid)
               └── fares as DATA: baseFare, perKm, peakMultiplier, peakHours,
                   batchBonus, cashLimit, deliveryRadiusKm
```

**The order is the authority; a job is derived from it** — the rule
`lib/delivery-bridge.ts` establishes. Nothing is copied into a second store to
drift.

`ZoneArea.lat`/`lng` is the geography that makes this work at all. A saved
`Address` may have no coordinates (the customer typed it, nobody geocoded it),
but `DeliveryStop.lat`/`lng` are NOT NULL because a rider cannot ride to a
string. The area centroid is the honest answer in between — the *area's* centre,
not the doorstep — and it means one neighbourhood has **one** position, so a
real delivery and a synthesised one beside it are paid the same distance.

Rider money: `RiderLedgerEntry` (append-only, signed) is the truth;
`RiderWallet`, `RiderCashPosition` and `RiderEarningsSummary` are projections.
`RiderRemittance` is cash going back, `RiderWithdrawal` is earnings coming out.

---

## 6. Onboarding: two statuses, one authority

`types/onboarding.ts` argues that `Vendor` and `Rider` should carry no status
field, because a second copy is a second answer to "is this restaurant live".
That is right about **authority** and wrong about **storage**: discovery filters
on `Vendor.@@index([type, status, deletedAt])`, and routing every storefront read
through a join to the review queue would put onboarding on the hot path of the
home page.

The resolution follows the convention `Vendor.rating` already sets:

| | Authority | Projection |
|---|---|---|
| Restaurant | `VendorApplication.status` | `Vendor.status` |
| Rider | `RiderApplication.status` | `Rider.status` |

One writer — the review service — updates both in the same transaction.
`Vendor.status.PAUSED` is the exception: the merchant's own open/closed switch,
never a review outcome.

```
VendorApplication ──┬── VendorApplicationBranch ── VendorBranch (on approval)
                    ├── OnboardingDocument
                    └── OnboardingEvent
RiderApplication  ──┬── OnboardingDocument
                    └── OnboardingEvent
```

`OnboardingDocument` and `OnboardingEvent` each carry a **real foreign key to
both** application kinds, exactly one set — the pattern `PayoutAccount` and
`Payout` already use. A CHECK enforces the "exactly one", and two partial unique
indexes make `(application, kind)` unique per side. The alternative — four
tables — would duplicate the reviewer's log, and the frontend is explicit that
"a reviewer's log should read identically on either queue".

`OnboardingDocStatus.MISSING` is a state, not an absent row: a required document
nobody uploaded is a gap the reviewer must see, and a checklist assembled from
whatever rows happen to exist cannot show one.

The application's payout details are **flat columns, not a `PayoutAccount` row**.
That table hangs off a vendor or a rider, neither of which exists yet, and a
payable destination for a partner the platform has not accepted would be a
liability with nothing behind it. Approval mints the real row.

---

## 7. RBAC, staff and audit

```
User ──┬── UserRoleAssignment ── Role ── RolePermission ── Permission
       └── UserPermission (direct grant/denial, vendor-scopable; denial wins)

Vendor ── VendorStaff ──┬── User?  (NULL for an outstanding invitation)
                        └── VendorStaffPermission ── Permission
```

`User.primaryRole` backs the frontend's single `role` string;
`User.permissions` is a **resolved** array (role grants ∪ direct grants −
direct denials) computed by the API, not a column. The real model underneath is
a proper many-to-many, and `UserRoleAssignment.vendorId` is what makes "manager
of *this* branch" expressible without a second permission system.

`VendorStaff.userId` is nullable because **a staff member is a record, not an
account**. There is no mail server, so an invitation is a row saying "this person
has been asked", not a login that exists. Minting a `User` per invitation would
put accounts in the system nobody can authenticate as. `VendorStaffPermission`
holds only the **delta** from the role — grants and revokes — so "what may a
manager do" has one answer, and on acceptance the rows are copied into
`UserPermission` scoped to the vendor.

**Audit** is three tables, deliberately:

| Table | Scope | Why separate |
|---|---|---|
| `AuditLog` | every mutation, platform-wide | written by one interceptor; `action` is free text so a new verb needs no migration |
| `CmsAuditEntry` | CMS documents | rendered inline per document; shape fixed by `types/cms.ts` |
| `AccountModerationEvent` | one account's block history | what a moderator reads *before* deciding; `types/customer.ts` fixes the shape |

Plus the append-only per-aggregate logs that are not audit but *are* the record:
`OrderEvent`, `SupportTicketEvent`, `OnboardingEvent`, `OrderThreadEntry`,
`LedgerEntry`, `RiderLedgerEntry`, `StockMovement`, `PaymentTransaction`,
`LoginAttempt`.

---

## 8. Prisma compatibility

Verified by generating the client and reading the end-to-end fixture back
through it — 28 checks, all passing (§9).

| Concern | Result |
|---|---|
| `prisma validate` | passes |
| `prisma format` | clean (applied) |
| `prisma generate` | client v6.19.3, into `database/generated/client` |
| Multi-file schema | 18 files under `prisma/schema`, wired via `package.json#prisma` |
| Composite primary keys | `CartItem` → `where: { cartId_id: { cartId, id } }`; upsert verified to hit one basket only |
| Composite foreign keys | `CartItemOption → CartItem(cartId, id)` |
| `Decimal` money | exact — `1559`, `0.15`, no float drift |
| `Json` snapshots | round-trip unchanged |
| Enum arrays | `handoverChecks` round-trips; stored as the mapped labels |
| Optimistic locking | fresh write 1 row, stale write 0 rows |
| Relation depth | 10 relations on `Order` in one query |
| Aggregates | `orderCommission.aggregate` over a settlement period |
| Cascade behaviour | `Cascade` on children, `Restrict` on financial parents, `SetNull` on snapshots |

### The one real trap: enum vocabulary

**The Prisma client does not speak the stored vocabulary.** `order.status` comes
back as `"COMPLETED"`, and `where: { status: "completed" }` is *rejected* as an
invalid value. Prisma addresses enums by the member identifier and applies
`@map` only at the SQL boundary — and an identifier cannot contain a hyphen, so
the two vocabularies can never coincide for any value this schema maps.

The API layer therefore owns one total, mechanical translation in each
direction, and **it is not optional**: leaving it out sends `SCREAMING_CASE` to
a frontend whose unions are kebab-case. It is derivable from the generated
`Prisma.<Enum>` objects and should be generated once, not hand-written per
resolver. 127 enums are affected.

The `@map` still earns its place: it is what makes a `psql` row, a CSV export
and a hand-written report read in the product's own vocabulary.

### Generator output

Was `../../../backend/src/infrastructure/prisma/generated` — a path into the
removed NestJS tree, which would have `prisma generate` mint a NestJS-shaped
folder under an empty `backend/`. Now `database/generated/client`, inside the
package that owns the schema; the consumer imports from `@foodora/database`,
which stays true whatever the new backend's internal layout is. Gitignored.

### Deferred, with reason

`package.json#prisma` is deprecated and goes away in Prisma 7; the replacement
is `prisma.config.ts`. Deferred deliberately: a config file stops Prisma
auto-loading `.env`, so the move needs explicit env loading and a re-test of
every command. Worth doing *with* the Prisma 7 upgrade.

---

## 9. Verification

Everything below was **run**, not inspected. PostgreSQL 18.4, three databases.

### Migrations

| Migration | Content |
|---|---|
| `20260803120000_v1_baseline` | the whole V1 datamodel (engine-generated) |
| `20260803120100_v1_partial_unique_indexes` | 5 partial unique indexes Prisma cannot express |
| `20260827120000_v2_gap_closure` | this phase's DDL, hand-corrected in 3 places (below) |
| `20260827120100_v2_partial_constraints` | 5 CHECKs + 7 partial unique indexes |

`migrate deploy` applies all four cleanly from empty. `migrate status` → up to
date. `migrate diff` against the applied database → **empty**: no drift.

> The V1 README said "No PostgreSQL has ever run this schema … the first
> `migrate deploy` is the test." It has now run. That claim is closed.

**Three defects were found in the generated `migrate diff` output and fixed by
hand** — each would have broken a deployment that had data:

1. **Enum members were appended, not positioned.** `ADD VALUE 'scheduled'` puts
   the state an order is *born* in after every terminal state, breaking any
   `ORDER BY status`. Now `… BEFORE 'placed'`, and likewise for `rider_status`.
2. **The `cart_items` re-key had no backfill.** Rows carry a `<cartId>#<lineId>`
   prefix that must be stripped — children before parents, and both old primary
   keys dropped *first*, because stripping makes `cartA#line1` and `cartB#line1`
   both become `line1` and the rewrite transiently violates the very keys being
   replaced. Guarded with `position('#' IN id) > 0` so a re-run is safe.
3. **`payouts.periodRef` was added NOT NULL with no default**, which fails on any
   table already holding a payout. Now added nullable, backfilled from the
   period, then constrained — and computed from the period's **midpoint**,
   because `to_char` on a `timestamptz` renders in the session time zone and a
   window ending Sunday 23:59:59 UTC lands in the *next* ISO week in Asia/Dhaka.
   *(This one was caught by the test below, not by reading.)*

### The migration path, against real data

A database was built from the V1 baseline, seeded in the **old prefixed shape**
including the exact collision DSC-1 existed to fix — two guests, same dish, same
configuration, identical global id — then migrated:

```
BEFORE  cart_a#food_pizza|opt_large / cart_a   qty 2
        cart_b#food_pizza|opt_large / cart_b   qty 1
AFTER   food_pizza|opt_large        / cart_a   qty 2
        food_pizza|opt_large        / cart_b   qty 1
        payouts.periodRef = '2026-W34'  (backfilled)
```

Both baskets survive, the prefix is gone, and the value that used to collide is
now legal in two carts and unique within each.

### End-to-end data flow — 26 assertions, all passing

A full lifecycle was written through the real database: restaurant application →
approval → storefront → menu → rider application → approval → fleet → cart →
checkout → 13 lifecycle events → dispatch → trip with stops → counter handover
(one failed code, then the four checks) → OTP → cash collected → **completion** →
commission → rider earning → double-entry ledger → remittance → review →
contact thread → payout run with line items and an adjustment → a second order
disputed → support ticket with an internal note → refund `requested → approved →
refunded` → commission reversed → moderation note → a scheduled order.

Verified among others: the ledger sums to zero per `transactionRef` (3 refs);
commission arithmetic closes (`1380 − 207 = 1173`, `207 + 60 = 267`); gross
equals the order total; the rider payout itemises to its total; **completion is
idempotent** (a replayed transition matched 0 rows and produced no second
commission); rider cash nets to zero after remittance while the earnings axis
holds `128.40`; `SUM(PayoutOrder.netAmount) + adjustments = Payout.netAmount`;
`Order.settlementRef = Payout.periodRef`; the refund reached `refunded` with a
route; a refunded order's commission is `reversed`; the customer sees 3 of 4
ticket events; the handover checklist and failed attempt are both recorded;
`detailKind` is queryable without opening the JSON; the scheduled order sits
outside the happy path; the same line id lives in two carts; applications are
the authority and the catalogue mirrors them; a missing document is a row; an
invited staff member has no user but does have grants; a postal-only order can
still be ridden to; the trip links to the real order; stock moved with the sale.

### Constraints — 22 negative tests

Every constraint **refuses** what it should and **allows** what it should —
18 refusals and 4 allowances, no unexpected outcomes:

*Refused:* a document belonging to both applications, or to neither; an event
belonging to both; the same document kind twice on one application; an
adjustment charged to both a vendor and a rider, or to nobody; a payout with no
payee; **paying the same vendor's period a second time**; two commissions on one
order; inviting the same address twice; a second owner for one vendor; the same
line id twice in one cart; reviewing one order twice as the same subject; a
second lifetime rating aggregate; two threads with the same party on one order;
a cart line referencing a missing cart; deleting an order a paid payout
references; deleting a vendor carrying a commission record.

*Allowed:* the same document kind on a different application; a **failed retry**
for the same vendor and period; reviewing the same order's rider as well as its
vendor; a restaurant thread alongside a rider thread.

### Reference / seed data

`database/package.json#prisma.seed` delegates to `backend`'s `seed:reference`,
**which no longer exists** — the NestJS backend was removed. The seeder needs
`IdService` and the permission catalogue, so it belongs with the new backend.
The E2E fixtures above (currencies, countries, languages, tax rules,
permissions, roles, zones with area centroids) are a working specification of
the minimum reference set: `User.countryCode` is a non-null FK to `countries`,
so **no account can be created until a country row exists**. See §11.

---

## 10. Module → entity map

| Module | Entities | DB |
|---|---|---|
| Authentication | `User`, `Credential`, `Session`, `RefreshToken`, `Device`, `OtpChallenge`, `PasswordReset`, `LoginAttempt`, `SocialIdentity` | ✅ |
| RBAC / PBAC | `Role`, `Permission`, `RolePermission`, `UserRoleAssignment`, `UserPermission` | ✅ |
| Discovery & search | `Vendor`, `VendorBranch`, `Cuisine`, `Category`, `CategoryKeyword`, `Amenity`, `SearchQueryLog`, `SearchTermStat` | ✅ |
| Menu | `Menu`, `MenuSection`, `FoodItem`, `FoodOptionGroup`, `FoodOption`, `FoodDietary`, `FoodAllergen`, `FoodNutrition` | ✅ |
| Inventory | `InventoryItem`, `StockMovement` | ✅ |
| Cart | `Cart`, `CartItem`, `CartItemOption` | ✅ *(re-keyed)* |
| Checkout & pricing | `Order`, `OrderItem`, `OrderItemOption`, `TaxRule`, `NumberSequence` | ✅ |
| Order lifecycle | `Order`, `OrderEvent`, `OrderRiderDecline` | ✅ *(+`scheduled`, handover, `detailKind`)* |
| Payments | `PaymentProvider`, `PaymentIntent`, `PaymentTransaction`, `PaymentWebhookEvent`, `SavedPaymentMethod` | ✅ |
| Refunds | `RefundRequest`, `Refund`, `Order.refund*` | ✅ *(+`refunded`, method, timestamps)* |
| Support & disputes | `SupportTicket`, `SupportTicketEvent` | ✅ **new** |
| Order contact | `OrderThread`, `OrderThreadEntry` | ✅ **new** |
| Delivery & dispatch | `DeliveryZone`, `ZoneArea`, `DeliveryJob`, `DeliveryJobOrder`, `DeliveryStop`, `JobOffer` | ✅ *(+radius, centroid)* |
| Tracking | `RiderLocationPing` | ✅ |
| Rider money | `RiderLedgerEntry`, `RiderRemittance`, `RiderWithdrawal`, `RiderShift` | ✅ |
| Commission & settlement | `OrderCommission`, `OrderRiderEarning`, `CommissionRule`, `SettlementAdjustment`, `Payout`, `PayoutOrder`, `PayoutAccount` | ✅ **new/extended** |
| Ledger | `LedgerAccount`, `LedgerEntry` | ✅ |
| Wallet | `Wallet`, `WalletTransaction` | ✅ |
| Coupons & offers | `Offer`, `Coupon`, `CouponClaim`, `CouponRedemption` + scope joins | ✅ *(+index)* |
| Reviews & moderation | `Review`, `ReviewReply`, `ReviewVote`, `ReviewReport`, `ReviewMedia`, `RatingAggregate` | ✅ *(+lifetime uq)* |
| Restaurant onboarding | `VendorApplication`, `VendorApplicationBranch`, `OnboardingDocument`, `OnboardingEvent` | ✅ **new** |
| Rider onboarding | `RiderApplication`, `RiderDocument`, `OnboardingDocument`, `OnboardingEvent` | ✅ **new** |
| Restaurant staff | `VendorStaff`, `VendorStaffPermission` | ✅ **extended** |
| Restaurant profile & hours | `Vendor`, `VendorBranch`, `BranchHour`, `BranchClosure`, `BranchAmenity` | ✅ |
| Admin customer mgmt | `User`, `AccountModerationEvent` | ✅ **extended** |
| POS | `PosShift`, `PosSale`, `PosSaleItem`, `PosHeldTicket`, `PosHeldTicketLine` | ✅ |
| QR dine-in | `QrMenuConfig`, `DineInSession`, `DineInRound`, `DineInRoundItem`, `ServiceRequest`, `RestaurantTable` | ✅ |
| Reservations | `BookingPolicy`, `BookingPolicyZone`, `Reservation`, `ReservationTable` | ✅ |
| Catering | `CateringService`, `CateringPackage`, `CateringAddOn`, `CateringQuote` + joins | ✅ |
| Meal plans | `MealPlan`, `PlanTier`, `PlanMeal`, `Subscription`, `SubscriptionCycle`, `SubscriptionSkip` | ✅ |
| Notifications | `NotificationTemplate`, `Notification`, `NotificationDispatch`, `NotificationCampaign`, `NotificationSegment`, `NotificationPreference` | ✅ |
| CMS & blog | `CmsCollection`, `CmsDocument`, `CmsRevision`, `CmsAuditEntry`, `BlogPost`, `Testimonial`, `JobOpening`, `CmsContactMessage` | ✅ |
| AI assistant | `AiConversation`, `AiMessage`, `FoodProfile`, `AiUsageLog`, `AiRecognition` | ✅ |
| Platform settings | `Country`, `Currency`, `Language`, `TaxRule`, `Setting`, `FeatureFlag`, `Translation` | ✅ |
| Audit | `AuditLog`, `CmsAuditEntry`, `AccountModerationEvent`, `OutboxEvent`, `IdempotencyKey` | ✅ |
| File storage | `FileAsset` | ✅ |
| Analytics & reports | *derived* from orders, commissions, earnings, reviews | ✅ derived |
| Fraud / risk | *derived* — see §11 | ✅ by design |
| Loyalty | — | ⬜ not built in the frontend |
| Referrals | — | ⬜ not built in the frontend |

---

## 11. Remaining gaps, and why each is one

| Gap | Status |
|---|---|
| **Loyalty programme** | No tables, deliberately. `Analysis.md` A11 records that `loyalty` exists only as a `CouponSource` label — there is no ledger, no earn, no burn anywhere in the frontend. `CouponSourceKind.LOYALTY` is present for when there is. Adding a points ledger now would be modelling a feature nobody has specified. |
| **Referral programme** | Same shape (`Analysis.md` A12). `CouponSourceKind.REFERRAL` is present; code issuance, attribution and reward triggers are unbuilt. |
| **Fraud / risk** | **Correctly absent.** `lib/risk.ts` derives all four of its signals and says so: "There is no risk table, no score written to a customer … a `Customer.riskScore` updated by whatever remembered to would go stale exactly when it mattered." The inputs it reads — `Refund`, `CouponRedemption`, `LoginAttempt`, `OrderEvent`, `DeliveryZone.cashLimit` — are all present and indexed. |
| **Guest customers** | `Customer` (`cus_*`, keyed on phone) has no table. It is derived at read time from orders, which is what the frontend does. Moderation attaches to `User`, so blocking a guest who has never registered is not expressible — acceptable while the block action is an account action. Revisit if guest blocking is specified. |
| **Reference seeder** | `package.json#prisma.seed` points at the removed backend. Must be rebuilt with the new backend; §9 gives the minimum set. **This is the one blocking item for a runnable stack.** |
| **Menu drafts** | `stores/menu` holds unpublished edits client-side. In a real backend a menu edit is an update, so no draft table is needed — but if publish/unpublish is wanted for menus (as `CmsDocument.draft` gives for content), that is a future decision, not a current gap. |
| `prisma.config.ts` | Deferred with the Prisma 7 upgrade — see §8. |
| `RiderDocument` vs `OnboardingDocument` | Two document vocabularies survive on purpose: the application's (`driving-licence`, `profile-photo`) and the active rider's compliance set (`licence`). The frontend spells them differently too. Worth collapsing if the rider compliance sweep is built. |

**No data-model gap now prevents any workflow the frontend implements.**

---

## 12. Operating the database

```bash
cd database
bun install
bun run validate        # schema is valid
bun run migrate:deploy  # apply — NOT migrate dev, see below
bun run migrate:status
bun run generate        # client -> database/generated/client
```

**`migrate deploy`, never `migrate dev`.** Prisma cannot see partial indexes or
CHECK constraints, so `migrate dev` reports the 12 partial indexes and 5 CHECKs
as drift and offers to reset the database. To author the next migration:

```bash
# Offline, needs no database:
bunx prisma migrate diff --from-empty --to-schema-datamodel ./prisma/schema --script

# Or against the deployed database:
bunx prisma migrate diff \
  --from-url "$DATABASE_DIRECT_URL" \
  --to-schema-datamodel ./prisma/schema --script \
  > prisma/schema/migrations/<timestamp>_<name>/migration.sql
```

Then **read it before applying**. This phase found three defects in generated
output; the generator does not write backfills and does not know that enum
ordinal position carries meaning.

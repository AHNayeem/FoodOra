# FoodOra — Backend Requirements

**Written from the finalised database, 2026-08-27.** The database phase is
complete; this is what the next phase must build on top of it.

> **Update, 2026-08-27 — the foundation phase has shipped.** Module 0 and module
> 1 below are done: `backend/` is a running Fastify application and the
> reference seeder in §2 exists, which closes the blocking prerequisite. What was
> built, and the conventions in §1 it implements, is
> [`docs/backend/F1-fastify-foundation.md`](./backend/F1-fastify-foundation.md).
> The next module is **2 — Auth & sessions**.

**Stack (decided):** Fastify + JavaScript + Prisma + PostgreSQL.
**Not in scope, by instruction:** NestJS, TypeScript, GraphQL, Redis, Docker.

The `docs/backend/D1`–`D10` and `E1`–`E3` documents describe a NestJS + GraphQL +
Redis backend that has been removed. They are the historical design record.
**Do not plan new work from them.** Where they conflict with this document or
with [`FOODORA-DATABASE-DESIGN.md`](./FOODORA-DATABASE-DESIGN.md), those two win.

---

## 1. What the database already decides for you

These are not suggestions — the schema is built around them and breaking one
produces silently wrong data rather than an error.

| # | Obligation | Consequence of ignoring it |
|---|---|---|
| 1 | **Every write supplies a prefixed id.** `ven_…`, `usr_…`, `ord_…`. No column has a generating default; the frontend's deep links depend on the prefixes. | `NOT NULL` violation on every insert. |
| 2 | **Enum translation in both directions.** The client speaks `COMPLETED`; the column and the frontend speak `completed`. 127 enums. Generate the map from `Prisma.<Enum>`; do not hand-write it. | `SCREAMING_CASE` reaches a frontend whose unions are kebab-case, and `where: { status: 'completed' }` throws. |
| 3 | **Soft delete is a filter, not a behaviour.** `deletedAt IS NULL` means active, and nothing enforces it for you. | Deleted vendors appear in discovery. |
| 4 | **Optimistic locking on anything with `version`.** Write with `updateMany({ where: { id, version } })` and treat 0 rows as a conflict. | Lost updates on concurrent edits. |
| 5 | **Money is `Decimal`.** Never `Number(...)` it before arithmetic. Convert at the API boundary only, because the frontend types money as a plain number. | Rounding errors in settlement. |
| 6 | **Completion is one transaction, guarded by `settledAt`.** Status + `OrderEvent` + `OrderCommission` + `OrderRiderEarning` + ledger legs + rider ledger + stock movement, all under `WHERE settledAt IS NULL`. | Duplicate commissions and earnings on a retry. |
| 7 | **Ledger legs sum to zero per `transactionRef`.** Assert it in the write path. | Books that do not balance, discovered months later. |
| 8 | **Snapshots are written once and never refreshed.** `vendorSnapshot`, `addressSnapshot`, `riderSnapshot`, `planSnapshot`, `venueSnapshot`, and every `*Name` column beside an id. | An old receipt silently re-prices when the menu changes. |
| 9 | **The order machine is domain code, not database logic.** Port `frontend/lib/order-machine.ts` — `TRANSITIONS` and `ACTORS` — so both sides agree on legal moves. The database stores only where the order got to. | Two state machines that disagree. |
| 10 | **`migrate deploy`, never `migrate dev`.** 12 partial indexes and 5 CHECKs are invisible to Prisma and read as drift. | An offer to reset the database. |
| 11 | **Applications are the review authority.** Write `VendorApplication.status` and `Vendor.status` in the same transaction; never write `Vendor.status` from anywhere else except the merchant's own `PAUSED` switch. | Two answers to "is this restaurant live". |
| 12 | **Derived state stays derived.** No settlement table, no `isExpired`, no `isUsed`, no reservation slots, no risk score. The list is in `main.prisma` §8 and each has a stated reason. | The staleness bug each convention exists to prevent. |

---

## 2. The one blocking prerequisite — **closed**

**A reference-data seeder.** `database/package.json#prisma.seed` delegated to the
removed backend's `seed:reference`, so `bun run seed` failed. Nothing worked
before it existed: `User.countryCode` is a non-null FK to `countries`, so **no
account could be created until a country row existed**.

**Built 2026-08-27** as `backend/src/seed/reference.js`, reached from both sides:

```bash
cd backend  && npm run seed:reference
cd database && bun run seed          # prisma.seed now → ../backend/scripts/seed-reference.js
```

255 rows across 14 tables, covering the minimum set below in full. Deterministic
(ids are derived from natural keys, not random), idempotent (a second run changes
nothing, ids included) and safe on a live database (it never touches
`deletedAt`). Details and the row-by-row provenance are in
[F1 §8](./backend/F1-fastify-foundation.md#8-the-reference-seeder).

Minimum set, as exercised by the verified end-to-end fixture — all present:

- ✅ `Currency` (5), `Language` (en, bn, ar — the frontend's three locales), `Country` (5), `CountryLanguage` (15)
- ✅ `TaxRule` per country (5)
- ✅ `Permission` catalogue — the closed list in `lib/rbac.ts::PLATFORM_PERMISSIONS` (20)
- ✅ `Role` × the 14 `UserRoleSlug` built-ins, with `RolePermission` grants (54)
- ✅ `DeliveryZone` (3) + `ZoneArea` **with centroids** (19), from `lib/mock/drop-points.ts`
- ✅ `PaymentProvider` — `cash` and `wallet` enabled, three gateways disabled and in test mode
- ✅ `LedgerAccount` for each platform account (6)
- ✅ `CmsCollection` definitions (9), exported verbatim from `lib/mock/cms.ts`
- ✅ `NotificationTemplate` catalogue (92) — one per `notifications.<audience>.<key>`

A demo seeder — restaurants, menus, orders in every status, the financial
scenarios `GAP - Implement.md` §21 lists — is separate and **still to come**.

---

## 3. Module build order

Each row is one module. The database column is settled; the backend column is
the work. Order follows dependency, not importance.

| # | Module | Depends on | Notes |
|---|---|---|---|
| 0 | Foundation | — | **done** — Fastify, config, logging, error shape, health, Prisma client + soft-delete and enum-mapping layers. [F1](./backend/F1-fastify-foundation.md) |
| 1 | Reference data & seeder | 0 | **done** — §2. |
| 2 | Auth & sessions | 1 | **done** — Argon2id, refresh rotation with reuse detection, OTP, devices, `requireUser`. [M2](./backend/M2-auth-sessions.md) |
| 3 | RBAC / PBAC | 2 | Resolve `User.permissions` = role grants ∪ direct grants − denials |
| 4 | Catalog & discovery | 1 | **done** — `isOpen` (branch hours + timezone) and `distanceKm` (caller coordinates) derived, never stored. [M4](./backend/M4-catalog-discovery.md) |
| 5 | Menu & inventory | 4 | Availability = merchant switch AND (untracked OR in stock) |
| 6 | Cart | 5 | Composite key `{ cartId, id }`; single-vendor by construction |
| 7 | Checkout | 6 | Server-priced. Tax from `TaxRule`, coupons server-side, `commissionRate` snapshotted at placement |
| 8 | Order lifecycle | 7 | The ported machine. Every move writes an `OrderEvent` with `detailKind` |
| 9 | Payments & refunds | 8 | Intent per attempt; webhooks stored before processing; `RefundRequest` ≠ `Refund` |
| 10 | Dispatch & delivery | 8 | Order is the authority, trip derived. Area centroid supplies missing geography |
| 11 | Rider money | 10 | `affectsCash` separates what we owe from what the rider owes |
| 12 | Commission & settlement | 8, 11 | Stamped at completion; settlements derived; `PayoutOrder` on every run |
| 13 | Support & disputes | 9 | Visibility filtered once, server-side |
| 14 | Order contact threads | 8 | Small on purpose. No read receipts — nothing can tell the truth about them |
| 15 | Onboarding (vendor + rider) | 3, 4, 10 | Application is the authority; approval mints storefront/fleet row + `PayoutAccount` |
| 16 | Staff | 3, 15 | Invitation without an account; permission delta copied to `UserPermission` on acceptance |
| 17 | Coupons & offers | 7 | Status and remaining-uses derived, never stored |
| 18 | Reviews & moderation | 8 | `RatingAggregate` updated in the review's transaction |
| 19 | Wallet | 9 | Balance is a maintained projection; assert it against the sum |
| 20 | Notifications | 8 | Key + params, never prose. Channels decided once, at emit |
| 21 | Admin operations | 3, 8, 12 | Orders, customers, restaurants, riders, payouts, coupons, reviews, support |
| 22 | Audit | 3 | One interceptor around every mutating route |
| 23 | Analytics & reports | 12 | Derived. Same numbers as the merchant and admin views by construction |
| 24 | Platform settings & flags | 3 | Resolution vendor → country → platform, first hit wins |
| 25 | Files | 1 | Presigned upload, row written on complete |
| 26 | POS & QR dine-in | 5 | |
| 27 | Reservations | 4 | No slot table — overlap arithmetic against the book |
| 28 | Catering | 1 | |
| 29 | Meal plans & subscriptions | 9 | Schedule rules stored, calendar derived |
| 30 | CMS, blog, content | 25 | JSONB values against a declared field schema |
| 31 | AI assistant & search | 4 | Provider behind a port; `SearchQueryLog` honours `saveSearchHistory` |

---

## 4. Frontend contract

The seam is `frontend/services/*`. Components never import `lib/mock` directly,
so replacing a mock body with an HTTP call must not touch a component, route or
type. The read models the backend must return are `frontend/types/*` **unchanged**
— that is what the JSON snapshots and denormalised counters exist for.

Two live-flag facts from `Analysis.md` to settle early:

- `NEXT_PUBLIC_BACKEND_*` flags in `frontend/.env.local` currently point at a
  deleted API (A1, A2). They must be `0` until a real endpoint answers. **Still
  outstanding, and now concrete for auth**: module 2 answers at
  `/api/v1/auth/*` in REST, while `services/auth.ts` behind
  `NEXT_PUBLIC_BACKEND_AUTH` still issues Apollo mutations — so that flag must
  stay `0`. The API deliberately matches the client's *contract* (the
  `AuthSession` shape, the `User` read model, the refusal envelope, the
  `RENDERABLE` keys, the cookie and header names), so the remaining delta is
  transport and one base URL:
  [M2 §11](./backend/M2-auth-sessions.md#11-what-is-not-here) sets it out.
- `scripts/verify-operations.ts` (`verify:graphql`) reads `backend/schema.gql`,
  which no longer exists (A3). The GraphQL client layer — 1,691 LOC in
  `lib/graphql/` — needs an explicit keep-or-excise decision (A4). **This
  backend is not GraphQL**, so the honest options are to vendor a schema copy
  for the gate or remove the layer and the gate together. Leaving it undecided
  is the one thing the audit rules out. **Still outstanding**: the foundation is
  REST (`/api/v1`, JSON, the error contract in
  [F1 §5](./backend/F1-fastify-foundation.md#5-error-contract)), which settles
  what the API *is* but not what happens to `lib/graphql/` — a frontend change,
  and not one this phase was asked to make.

---

## 5. Definition of done, per module

1. Migration written, reviewed by hand, applied with `migrate deploy`.
2. `prisma validate` passes and `migrate diff` against the applied database is empty.
3. Routes implemented, with the enum translation and soft-delete filters applied.
4. The frontend service body switched over, with the mock retained as fallback where the existing pattern does.
5. End-to-end flow driven against real PostgreSQL — not inspected.
6. `frontend`: `bun run typecheck`, `bun run lint`, `bun run build` green; messages added to **all three locales** (`en`, `bn`, `ar`).
7. [`FOODORA-MODULE-CHECKLIST.md`](./FOODORA-MODULE-CHECKLIST.md) updated — and only then.

# FoodOra — Master Module Checklist

**Legend:** `[ ]` not started · `[~]` partial · `[x]` complete
**Rule:** a box is ticked only when the work has been *verified*, not merely written.
Database, backend, frontend and verification are tracked **separately** — a
complete database column says nothing about the backend.

Last updated **2026-09-01**, at the end of **module 5 — menu & inventory**.

- **Database** — table, columns, relations, constraints, indexes exist and have been applied and exercised against real PostgreSQL.
- **Backend** — Fastify routes exist and are wired to Prisma. *The foundation is built ([F1](./backend/F1-fastify-foundation.md)); module 2, auth & sessions ([M2](./backend/M2-auth-sessions.md)), module 3, RBAC/PBAC ([M3](./backend/M3-rbac-pbac.md)), module 4, catalog & discovery ([M4](./backend/M4-catalog-discovery.md)) and module 5, menu & inventory ([M5](./backend/M5-menu-inventory.md)) are built and verified. No other business module has started, by instruction.*
- **Frontend** — the surface exists and works on the mock path (state per [`Analysis.md`](../Analysis.md)).
- **Verified** — driven end to end, not inspected. For the database phase this means the assertions in [`FOODORA-DATABASE-DESIGN.md`](./FOODORA-DATABASE-DESIGN.md) §9.

---

## Core commerce

| Module | Database | Backend | Frontend | Verified |
|---|---|---|---|---|
| Reference data (currencies, countries, languages, tax) | [x] | [x] seeded | [x] | [x] |
| Reference **seeder** | [x] schema | [x] **unblocked** | n/a | [x] 255 rows, re-run is a no-op |
| Authentication & sessions | [x] | [x] [M2](./backend/M2-auth-sessions.md) | [x] mock path | [x] 70 tests + 51 lifecycle checks |
| RBAC / PBAC | [x] | [x] [M3](./backend/M3-rbac-pbac.md) | [x] | [x] 71 tests against the seeded 14/20/54 |
| Discovery & search | [x] | [x] [M4](./backend/M4-catalog-discovery.md) | [x] | [x] 115 tests + 49 flow checks |
| Menu & options | [x] | [x] [M5](./backend/M5-menu-inventory.md) | [x] | [x] 130 tests + 54 flow checks |
| Inventory & stock | [x] | [x] [M5](./backend/M5-menu-inventory.md) | [x] | [x] atomic adjust, ledger balances |
| Cart | [x] re-keyed | [x] [M6](./backend/M6-cart.md) | [x] | [x] 90 tests + 51 flow checks |
| Checkout & pricing | [x] | [ ] | [x] | [x] |
| Order lifecycle (17 statuses) | [x] +`scheduled` | [ ] | [x] | [x] |
| Order event log (typed details) | [x] | [ ] | [x] | [x] |
| Scheduled orders | [x] | [ ] | [x] | [x] |
| Payments | [x] | [ ] | [x] | [x] |
| Refunds (`requested→approved→refunded`) | [x] | [ ] | [x] | [x] |
| Invoices | [x] | [ ] | [~] no PDF | [ ] |

## Delivery

| Module | Database | Backend | Frontend | Verified |
|---|---|---|---|---|
| Zones, areas & fares | [x] +radius, centroid | [ ] | [x] | [x] |
| Dispatch & offers | [x] | [ ] | [x] | [x] |
| Trips, stops & batching | [x] | [ ] | [x] | [x] |
| Counter handover & checklist | [x] **new** | [ ] | [x] | [x] |
| OTP handover | [x] | [ ] | [x] | [x] |
| Delivery failure & return | [x] | [ ] | [x] | [~] statuses only |
| Live rider tracking | [x] | [ ] | [x] | [ ] |
| Rider earnings, cash & remittance | [x] | [ ] | [x] | [x] |
| Rider withdrawals | [x] | [ ] | [x] | [ ] |

## Money

| Module | Database | Backend | Frontend | Verified |
|---|---|---|---|---|
| Commission (itemised, per order) | [x] **new** | [ ] | [x] | [x] |
| Commission management (rates) | [x] `CommissionRule` | [ ] | [ ] **A6** | [ ] |
| Rider earning (per order) | [x] **new** | [ ] | [x] | [x] |
| Settlement (derived) | [x] by design | [ ] | [x] | [x] |
| Settlement adjustments | [x] **new** | [ ] | [x] | [x] |
| Payouts & payout lines | [x] **new** | [ ] | [x] | [x] |
| Double-entry ledger | [x] | [ ] | [x] | [x] |
| Wallet | [x] | [ ] | [x] | [x] |
| Platform financials & analytics | [x] derived | [ ] | [x] | [~] |

## Partners

| Module | Database | Backend | Frontend | Verified |
|---|---|---|---|---|
| Restaurant onboarding & approval | [x] **new** | [ ] | [x] | [x] |
| Rider onboarding & approval | [x] **new** | [ ] | [x] | [x] |
| Onboarding documents & event log | [x] **new** | [ ] | [x] | [x] |
| Restaurant profile, hours, branches | [x] | [ ] | [~] A15, A20 | [~] |
| Restaurant staff & invitations | [x] **extended** | [ ] | [~] A14 no login | [x] schema |
| Vendor membership plans | [x] | [ ] | [ ] | [ ] |

## Customer care

| Module | Database | Backend | Frontend | Verified |
|---|---|---|---|---|
| Support tickets & disputes | [x] **new** | [ ] | [x] | [x] |
| Internal notes & visibility | [x] **new** | [ ] | [x] | [x] |
| Order contact threads | [x] **new** | [ ] | [x] | [x] |
| Reviews | [x] | [ ] | [x] | [x] |
| Review moderation | [x] | [ ] | [x] | [~] |
| Customer management & blocking | [x] **extended** | [ ] | [x] | [x] |
| Notifications & preferences | [x] | [ ] | [x] | [ ] |

## Platform & admin

| Module | Database | Backend | Frontend | Verified |
|---|---|---|---|---|
| **Backend foundation** (app, health, errors, validation, Prisma layers, auth guards) | n/a | [x] | n/a | [x] 74 assertions |
| Admin order operations | [x] | [ ] | [x] | [x] |
| Coupons & offers | [x] +index | [ ] | [x] | [~] |
| Audit log | [x] | [ ] | [x] | [~] |
| Platform settings & feature flags | [x] | [ ] | [x] | [~] |
| File storage | [x] | [ ] | [ ] **A19** | [ ] |
| Reports & export | [x] derived | [ ] | [~] CSV only | [ ] |
| Outbox & idempotency | [x] | [ ] | n/a | [~] |

## Verticals

| Module | Database | Backend | Frontend | Verified |
|---|---|---|---|---|
| POS Lite | [x] | [ ] | [x] | [ ] |
| QR dine-in | [x] | [ ] | [x] | [ ] |
| Reservations | [x] | [ ] | [x] | [ ] |
| Catering quotes | [x] | [ ] | [x] | [ ] |
| Meal plans & subscriptions | [x] | [ ] | [x] | [ ] |
| CMS & blog | [x] | [ ] | [x] | [ ] |
| AI assistant & food profile | [x] | [ ] | [x] | [ ] |

## Not built anywhere

| Module | Database | Backend | Frontend | Note |
|---|---|---|---|---|
| Loyalty / points | [ ] | [ ] | [ ] | `Analysis.md` A11 — a `CouponSource` label only. Deliberately unmodelled. |
| Referrals | [ ] | [ ] | [ ] | `Analysis.md` A12 — same. |
| Fraud / risk tables | n/a | [ ] | [x] derived | `lib/risk.ts` derives all four signals by design. A table would be the bug. |
| Guest customer records | n/a | [ ] | [x] derived | Derived from orders by phone. See design doc §11. |

---

## Cross-cutting state

| Item | State |
|---|---|
| Prisma schema valid | [x] |
| Migrations applied from empty | [x] 4 migrations |
| Migration drift | [x] none |
| Migration path tested with data | [x] incl. the DSC-1 collision |
| Prisma client generates & reads | [x] 28/28 |
| Constraints negative-tested | [x] 22/22 (18 refused, 4 allowed) |
| End-to-end data flow | [x] 26/26 assertions |
| Deferred schema changes DSC-1, DSC-2 | [x] closed |
| Backend foundation | [x] Fastify app, health, error/response contract, validation, Prisma layers, auth guards — [F1](./backend/F1-fastify-foundation.md) |
| Backend reference seeder | [x] 255 rows, deterministic and idempotent |
| Backend test suite | [x] 550 assertions against real PostgreSQL, plus `npm run auth:flow` (51 checks), `npm run catalog:flow` (49 checks), `npm run menu:flow` (54 checks) and `npm run cart:flow` (51 checks) over a real socket |
| Forbidden technologies | [x] `npm run check:forbidden` — no TypeScript, NestJS, Redis, Docker, GraphQL |
| Backend module 2 — auth & sessions | [x] Argon2id, sessions, refresh rotation with reuse detection, OTP, password reset, `requireUser` — [M2](./backend/M2-auth-sessions.md) |
| Backend module 4 — catalog & discovery | [x] the directory, search, rails and one storefront; `isOpen` and `distanceKm` derived per request — [M4](./backend/M4-catalog-discovery.md) |
| Backend module 5 — menu & inventory | [x] boards, sections, dishes, modifier groups and options, stock with an append-only movement ledger; availability derived as *switch AND (untracked OR in stock)*; the atomic adjustment is one guarded `UPDATE` — [M5](./backend/M5-menu-inventory.md) |
| Backend module 6 — cart | [x] one basket per customer or guest key, single-vendor by construction; the cart line's key **is** its configuration (food id + sorted option ids), prices snapshotted from stored menu rows, `InventoryItem.reserved` read and deliberately never written — [M6](./backend/M6-cart.md) |
| Backend catalog taxonomy seeder | [x] 66 rows (8 cuisines, 10 categories, 48 keywords), deterministic, idempotent, reconciling |
| Backend business modules | [~] 6 of 32 done (0 foundation, 1 reference data, 2 auth, 3 RBAC/PBAC, 4 catalog, 5 menu & inventory, 6 cart) — next is module 7, checkout |
| Frontend `.env.local` points at a deleted API | [~] A1–A3. `NEXT_PUBLIC_BACKEND_CATALOG` **set to `0`** by module 4 — the API is REST and `services/catalog.ts` still issues GraphQL ([M4 §6](./backend/M4-catalog-discovery.md#6-frontend-contract)). `NEXT_PUBLIC_BACKEND_AUTH` is still `1` and **must be `0`** for the same reason ([M2 §11](./backend/M2-auth-sessions.md#11-what-is-not-here)). `NEXT_PUBLIC_BACKEND_CART` stays `0` — `services/cart.ts` still issues GraphQL ([M6 §12](./backend/M6-cart.md#12-frontend-contract)) |
| §10 browser verification (Scenarios A–G) | [ ] A23 outstanding |

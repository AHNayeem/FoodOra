# Backend — Phase D (design), Phase E (NestJS), Phase F (Fastify)

## The current backend

| Doc | What |
| --- | --- |
| [**F1 — Fastify Backend Foundation**](./F1-fastify-foundation.md) | the backend that exists in `backend/` today: stack, structure, lifecycle, Prisma layers, error and response contracts, validation, the reference seeder, the auth foundation, versioning, environment, tests |
| [**M2 — Authentication & Sessions**](./M2-auth-sessions.md) | module 2: Argon2id, the session and refresh-token lifecycle, rotation with reuse detection, OTP, password reset, `requireUser`, the nine endpoints, and what the frontend would need to change to reach them |

Everything below F1 describes the **removed** NestJS backend and is kept as a
record of the reasoning, not as a plan. Where it and F1 disagree, F1 wins.

---

> [!IMPORTANT]
> **Historical record — do not plan new work from this directory.**
>
> Every document below designs a **NestJS + GraphQL + Redis + Docker** backend
> that has since been removed (`backend OLD/` holds it). The replacement is
> **Fastify + JavaScript**, with no GraphQL, no Redis and no Docker, and it is
> built: see [F1](./F1-fastify-foundation.md).
>
> The current authorities are:
>
> | For | Read |
> | --- | --- |
> | The data model | [`docs/FOODORA-DATABASE-DESIGN.md`](../FOODORA-DATABASE-DESIGN.md) |
> | What the backend must do | [`docs/FOODORA-BACKEND-REQUIREMENTS.md`](../FOODORA-BACKEND-REQUIREMENTS.md) |
> | Module status | [`docs/FOODORA-MODULE-CHECKLIST.md`](../FOODORA-MODULE-CHECKLIST.md) |
> | Product / frontend state | [`Analysis.md`](../../Analysis.md) |
> | The backend as built | [`F1`](./F1-fastify-foundation.md), [`M2`](./M2-auth-sessions.md) |
>
> These documents remain because the *reasoning* in them — D2 on normalisation
> and money, D3's ER diagrams, D7 on the ledger and settlement — is what the
> schema is built from and is still correct about the database. The stack
> decisions, the module layout, the GraphQL contracts and the deployment
> chapter are not.
>
> Two counts here are also stale: the schema is now **184 models and 127
> enums** across 18 files, and "Nothing in V1 has been run against a database"
> is no longer true — see
> [DATABASE-DESIGN §9](../FOODORA-DATABASE-DESIGN.md#9-verification).

Design for the production backend that will gradually replace the Phase C mock
layer, and the implementation as it lands. **No frontend code has been modified.**

| Phase | Doc | State |
| --- | --- | --- |
| E1 | [E1 — Backend Foundation](./E1-backend-foundation.md) | done — NestJS, GraphQL, Prisma, config, logging, validation, filters, health, Docker |
| E2 | [E2 — Authentication](./E2-authentication.md) | done — RS256 + JWKS, rotating refresh with reuse detection, OTP, RBAC/PBAC guard chain |
| E3 | [E3 — Core Modules](./E3-core-modules.md) | done — users + directory, ranked roles, a closed permission catalogue, countries/languages/currencies, scoped settings |
| E4 | restaurant modules (restaurants, branches, menus, categories, foods, inventory, POS Lite, QR menu) | superseded in part by V1 Unit 1 below |

## V1 — the vertical slice

Phase E built the backend bottom-up; V1 cuts across it, replacing the mock layer one
slice at a time so the frontend keeps working after each. **This is the first work that
modifies frontend code**, and only ever a service body — never a component, route or
type.

| Unit | Doc | State |
| --- | --- | --- |
| — | [V1 — Frontend analysis](./V1-phase1-frontend-analysis.md) | the survey the units are planned from |
| 0 | [V1 Unit 0 — cutover](./V1-unit0-cutover.md) | done — baseline migration, two browser-only auth fixes, Apollo wiring, the `LIVE` flag mechanism |
| 1 | [V1 Unit 1 — catalog](./V1-unit1-catalog.md) | done — 7 public catalog queries, three-way seed split, derived `isOpen`/`distanceKm` |
| 2 | [V1 Unit 2 — cart](./V1-unit2-cart.md) | done — server-side basket, **real PostgreSQL at last**, Redis menu cache, routing port, error boundary, timeouts + fallback |
| 3 | [V1 Unit 3 — checkout](./V1-unit3-checkout.md) | done — server-priced checkout, tax from `tax_rules`, server-side coupons, guest-cart adoption, the auth-context and schema-emit fixes |
| 4 | the restaurant side: accept · reject · start cooking · food ready | awaiting approval |

Nothing in V1 has been run against a database: this machine has no PostgreSQL and no
Docker. Each unit says exactly what that leaves unverified.

Phase D below is design only; its one runnable artifact is the Prisma schema.

| Doc | Covers |
| --- | --- |
| [D1 — Project Architecture](./D1-project-architecture.md) | Clean Architecture layering, folder tree, the 30 modules, cross-cutting decisions |
| [D2 — Database Design](./D2-database-design.md) | normalisation, constraints, indexes, soft delete, audit, optimistic locking, timestamps, multi-country/currency/tax, money |
| [D3 — ER Diagram](./D3-er-diagram.md) | context map + 11 domain ER diagrams + relationship summary |
| [D4 — Prisma Schema](./D4-prisma-schema.md) | the schema itself, requirement checklist, frontend contract mapping, ID strategy, limitations |
| [D5 — GraphQL Architecture](./D5-graphql-architecture.md) | queries, mutations, subscriptions, pagination, filtering, search, authorization, errors, validation, upload, performance |
| [D6 — Authentication](./D6-authentication-architecture.md) | JWT, refresh rotation with reuse detection, OTP, social, sessions, devices, RBAC/PBAC, rate limits |
| [D7 — Payments](./D7-payment-architecture.md) | the gateway port, 8 providers, intent lifecycle, webhooks, refunds, the double-entry ledger, settlement |
| [D8 — Notifications](./D8-notification-architecture.md) | outbox pipeline, fan-out, the preference gate, 4 channels, templates, broadcasts, quiet hours |
| [D9 — Real-time](./D9-realtime-architecture.md) | transports, rooms, order status, KDS, rider tracking, dashboards, live analytics, chat/presence |
| [Deferred schema changes](./deferred-schema-changes.md) | schema defects held shut by application code, with the migration that closes each one |
| [D10 — Deployment](./D10-deployment-architecture.md) | Docker, Nginx, CDN, data stores, environments, CI/CD, scaling, observability, backup/DR, checklist |

Schema: [`database/prisma/schema/`](../../database/prisma/schema/) — 169 models,
104 enums, 16 files.

```bash
cd database && bun install && bun run validate
# → The schemas at prisma/schema are valid 🚀
```

---

## The governing constraint

`frontend/services/*` is the seam. Components never import `lib/mock` directly —
they call async service functions that return the domain types in
`frontend/types/*`. So the backend's job is to let each service function keep
its **signature and return type** while its body changes from a mock read to a
GraphQL request.

Every design decision in Phase D was tested against that. Where storage had to
differ from the read model, the recomposition is named and owned by a specific
service (see [D4 §Frontend contract mapping](./D4-prisma-schema.md#frontend-contract-mapping)).

## Seam → backend mapping

| Frontend seam | Backend module | GraphQL | Phase |
| --- | --- | --- | --- |
| `services/auth.ts` | `auth` | `login` `register` `requestOtp` `verifyOtp` `logout` `changePassword` `requestPasswordReset` `resetPassword` · `me` `mySessions` · `POST /auth/refresh` | E2 (social: later) |
| `services/account.ts` | `users` | `updateProfile` · admin: `users` `user` `setUserStatus` `setUserPrimaryRole` | E3 (`myAddresses`: E5) |
| `services/settings.ts` | `users` | `mySettings` `updateSettings` `closeAccount` | E3 |
| `services/favorites.ts` | `users` | `myFavorites` `toggleFavorite` | E5 — the open question is how a device's list merges with an account's |
| `config/regions.ts` | `regions` | `countries` `country` `currencies` · admin: `createCountry` `updateCountry` `setCountryLanguages` | E3 (`taxRate`: E5) |
| `config/i18n/config.ts` | `regions` | `languages` | E3 |
| _(new)_ | `rbac` | `roles` `permissions` `userAuthorization` `createRole` `setRolePermissions` `assignRole` `setDirectGrant` | E3 |
| _(new)_ | `settings` | `publicSettings` · admin: `settings` `settingDefinitions` `setSetting` `clearSetting` | E3 |
| `services/catalog.ts` | `catalog` | `cuisines` `categories` `vendors` `vendor` `vendorMenu` `food` | E4 |
| `services/search.ts` | `search` | `search` `searchSuggestions` | E4 |
| `services/qr.ts` | `dinein` | `qrMenu` `sendRound` `requestService` | E4 |
| `services/pos.ts` | `pos` | `posCatalog` `completeSale` | E4 |
| `stores/cart` + `lib/cart.ts` | `cart` | `addToCart` `updateCartLine` `myCart` | E5 |
| `services/orders.ts` | `orders` | `placeOrder` `order` `myOrders` `cancelOrder` `verifyDeliveryOtp` | E5 |
| `lib/order-machine.ts` | `orders/domain` | `acceptOrder` `rejectOrder` `advanceOrder` | E5 |
| `services/coupons.ts` | `promotions` | `myCouponBook` `applyCouponCode` `claimCoupon` `vendorCoupons` | E5 |
| `services/offers.ts` | `promotions` | `offers` `offer` | E5 |
| `services/wallet.ts` | `wallet` | `myWallet` `topUpWallet` | E5 |
| `services/delivery.ts` | `delivery` | `jobOffers` `acceptJob` `completeStop` `riderEarnings` `riderWallet` | E6 |
| `lib/tracking.ts` | `tracking` | `riderLocation` subscription | E6 |
| _(new)_ | `payments` | `authorisePayment` webhooks refunds | E7 |
| `services/notifications.ts` | `notifications` | `notificationFeed` `sendBroadcast` | E8 |
| `lib/order-sim.ts` | `realtime` | `orderUpdated` `kitchenTicket` subscriptions | E8 |
| `services/vendor.ts`, `lib/analytics.ts` | `analytics` | `vendorStats` `vendorRevenue` `vendorBestSellers` | E9 |
| `services/reviews.ts` | `reviews` | `vendorReviews` `submitReview` `replyToReview` | E5/E9 |
| `services/reservations.ts` | `reservations` | `availability` `bookTable` `reservationBook` | E4/E5 |
| `services/subscriptions.ts` | `subscriptions` | `mealPlans` `subscribe` `skipDelivery` | E5 |
| `services/catering.ts` | `catering` | `cateringServices` `requestQuote` | E5 |
| `services/cms.ts`, `pages.ts`, `content.ts` | `cms` | `cmsDocuments` `saveCmsDocument` `cmsBanners` `blogPosts` | E3/E8 |
| `services/ai.ts` | `ai` | `askAssistant` `recommend` `analyseDish` `buildDietPlan` | E9 |

## Decisions worth arguing about

Five places the design departs from the obvious choice. Each is reversible, and
each is called out in its document.

**1. Vendor is split into brand + branch.** The spec's ER list asks for
Restaurants *and* Branches; Phase C's `Vendor` is one flat storefront. Rather
than pick a side, `Vendor` holds brand facts and `VendorBranch` holds location
facts, and `CatalogService.toVendorModel()` flattens the pair back into the
exact shape the frontend renders. Multi-branch merchants then cost nothing
later. The price is a join on the hottest read path, mitigated by
`relationJoins` and a Redis card cache. ([D2](./D2-database-design.md),
[catalog.prisma](../../database/prisma/schema/catalog.prisma))

**2. Kebab-case enums reach the wire as validated scalars, not GraphQL enums.**
GraphQL enum values cannot contain hyphens, and the frontend's unions are
`"cloud-kitchen"`, `"rider-assigned"`, `"free-delivery"`. Native enums would
have forced a mapping layer into the frontend — the one thing this phase is
supposed to prevent. Custom scalars keep the wire value identical and still
validate server-side; the cost is losing enum autocomplete in GraphiQL.
([D5 §Enums](./D5-graphql-architecture.md#enums--the-one-place-naïve-code-first-would-break-the-frontend))

**3. Money is `Decimal(14,2)`, not minor-unit integers.** The frontend types
money as a plain `number` in the entity's currency, and BDT displays zero
fraction digits. Minor units would have put an exponent conversion in every
resolver in both directions. `numeric` is exact and maps with one `.toNumber()`
at the boundary. ([D2 §Money](./D2-database-design.md#money))

**4. Snapshots stay JSONB, with the FK beside them.** `Order.vendorSnapshot`,
`Reservation.venueSnapshot` and the rest are immutable copies whose purpose is
*not* to be joined. Storing them as JSON serves the read model with zero
reshaping; the live FK next to each one serves analytics and integrity.

**5. Derived state is still never stored.** Coupon status, review summaries,
reservation slots, subscription calendars, rider wallets and vendor stats remain
computed, exactly as Phase C computes them. The only stored aggregates are the
counters the frontend already reads, maintained transactionally and reconciled
nightly. ([D4 §Frontend contract mapping](./D4-prisma-schema.md#frontend-contract-mapping))

## Spec coverage

| Phase D asked for | Where |
| --- | --- |
| modules, common, auth, graphql, prisma, config, cache, queue, websocket, notification, storage, payment, audit, logger, health, shared, utilities | D1 |
| normalization, constraints, indexes, composite indexes, soft delete, audit fields, optimistic locking, timestamps, enums, lookup tables | D2 |
| multi country, multi currency, timezone, language, tax, configurable settings | D2 §Global platform support |
| ER diagram, all relationships, the 26 named entities | D3 |
| relation names, indexes, enums, constraints, soft delete, base model, pagination-friendly, performance | D4 |
| queries, mutations, subscriptions, filtering, sorting, pagination, cursor pagination, search, authorization, error handling, validation, upload | D5 |
| email, phone OTP, Google, Apple, Facebook, refresh rotation, sessions, remember me, devices, RBAC, PBAC | D6 |
| Stripe, SSLCommerz, bKash, Nagad, Rocket, PayPal, Apple Pay, Google Pay, refund, partial refund, webhook, retry, status sync | D7 |
| push, email, SMS, in-app, WebSocket, Firebase, preferences, templates | D8 |
| live order status, kitchen status, rider tracking, restaurant dashboard, live analytics, chat, presence, typing | D9 |
| Docker, Nginx, CDN, object storage, Redis, PostgreSQL, monitoring, logging, CI/CD, environments, scaling, backup, DR, health checks | D10 |

## Phase E readiness

Phase E replaces the mock layer module by module, and the frontend keeps working
after every step. Two mechanisms make that literal rather than aspirational:

- `NEXT_PUBLIC_API_MODE=mock|graphql` selects each service's implementation, so
  a finished module talks to the backend while an unfinished one still serves
  mock data.
- Seeds 06–08 reuse the Phase C seed ids verbatim (`ven_*`, `usr_*`, `cus_*`,
  `off_*`, …), so every deep link, screenshot and bookmark from the prototype
  resolves against the real database.

Phase E order is unchanged from the brief: **E1 foundation, E2 auth and E3 core
(done)** → E4 restaurant → E5 ordering → E6 delivery → E7 payments →
E8 communication → E9 analytics → E10 security → E11 testing → E12 production.

Where E3 departed from the design above — a permission catalogue owned by code
rather than by the table, rank as the rule governing who may grant what, a
declared settings catalogue whose defaults are the last resolution layer,
`Country.defaultLocale` derived rather than patched, and the GraphQL `User` type
moved into shared schema surface — each is argued in
[E3 §Nine decisions](./E3-core-modules.md#nine-decisions-that-depart-from-the-phase-d-text).

Where E2 departed from the design above — a REST refresh endpoint rather than a
GraphQL mutation, authorization resolved per request rather than read from the
token, a narrower meaning for the token epoch, a replay window on rotation — each
is argued in
[E2 §Ten decisions](./E2-authentication.md#ten-decisions-that-depart-from-the-phase-d-text).

Where E1 departed from the design above — soft delete refusing `delete`, the
Docker build context, Debian over Alpine, production-only secret requirements,
and a database-independent boot — the reasoning is in
[E1 §Five decisions](./E1-backend-foundation.md#five-decisions-that-depart-from-the-phase-d-text).

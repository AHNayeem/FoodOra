# D1 — Backend Project Architecture

Clean Architecture inside a modular monolith. One deployable, many independently
maintainable modules, with a dependency rule the compiler can enforce.

## The dependency rule

```
presentation ──┐
               ├──► application ──► domain
infrastructure ┘
```

- **domain** — entities, value objects, domain events, state machines, and
  **ports** (interfaces). Zero imports from NestJS, Prisma, Redis or GraphQL.
  Pure TypeScript, unit-testable with no container.
- **application** — command/query handlers, DTOs, orchestration. Depends only
  on domain ports.
- **infrastructure** — adapters that *implement* domain ports: Prisma
  repositories, Redis caches, BullMQ processors, gateway clients.
- **presentation** — GraphQL resolvers, WebSocket gateways, webhook
  controllers. Thin: validate, authorize, delegate, map.

Wiring is dependency injection by token, never by concrete class:

```ts
// domain/ports/order.repository.port.ts
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
export interface OrderRepositoryPort {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order, expectedVersion: number): Promise<void>;
}

// orders.module.ts
providers: [{ provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository }]
```

The rule is enforced mechanically, not by memo — an ESLint
`no-restricted-imports` boundary per layer, and `dependency-cruiser` in CI:

```
domain      → may import: domain
application → may import: domain, application
infra/pres  → may import: anything
modules/a   → may NOT import modules/b/** except modules/b/domain (published contracts)
```

## Folder tree

```
backend/
├── src/
│   ├── main.ts                     bootstrap: Fastify adapter, helmet, CORS, shutdown hooks
│   ├── app.module.ts               composition root — imports every feature module
│   │
│   ├── config/                     typed, validated configuration (nothing reads process.env directly)
│   │   ├── configuration.ts        loads + freezes the config tree
│   │   ├── validation.schema.ts    Zod schema; boot FAILS on a missing/invalid var
│   │   ├── app.config.ts           port, env, urls, cors origins
│   │   ├── database.config.ts      pool size, timeouts, log level
│   │   ├── redis.config.ts         cache + queue + pubsub connections (three logical DBs)
│   │   ├── jwt.config.ts           issuer, audience, TTLs, key ids
│   │   ├── storage.config.ts       S3 endpoint, bucket, CDN base
│   │   ├── payment.config.ts       provider enablement (secrets by ref only)
│   │   ├── notification.config.ts  FCM, SMTP, SMS provider refs
│   │   └── graphql.config.ts       playground, introspection, depth/complexity caps
│   │
│   ├── common/                     cross-cutting, framework-aware, domain-free
│   │   ├── decorators/             @CurrentUser @Roles @Permissions @Public @Idempotent
│   │   ├── guards/                 JwtAuthGuard RolesGuard PermissionsGuard ThrottleGuard
│   │   ├── interceptors/           LoggingInterceptor AuditInterceptor TimeoutInterceptor
│   │   ├── filters/                AllExceptionsFilter GraphQLExceptionFilter PrismaExceptionFilter
│   │   ├── pipes/                  ZodValidationPipe SanitizeHtmlPipe
│   │   ├── errors/                 DomainError NotFoundError ConflictError ForbiddenError …
│   │   ├── pagination/             offset + cursor helpers, Relay connection builders
│   │   ├── scalars/                DateTime, Decimal-as-Float, JSONObject, enum-scalar factory
│   │   ├── money/                  Money VO, Decimal↔number boundary mappers
│   │   ├── ids/                    IdService — prefixed, sortable id minting
│   │   ├── dataloader/             per-request DataLoader registry (N+1 defence)
│   │   ├── context/                RequestContext (requestId, actor, locale, tz) via ALS
│   │   └── testing/                module builders, fixtures, fake clock
│   │
│   ├── infrastructure/             one folder per external system
│   │   ├── prisma/                 PrismaService + client extensions
│   │   │   ├── prisma.service.ts
│   │   │   ├── soft-delete.extension.ts
│   │   │   ├── audit.extension.ts
│   │   │   ├── optimistic-lock.extension.ts
│   │   │   └── transaction.manager.ts     unit-of-work across repositories
│   │   ├── cache/                  CacheService (get/set/del/tags), stampede lock, key registry
│   │   ├── queue/                  BullMQ registration, base processor, DLQ, scheduler
│   │   ├── websocket/              Socket.IO adapter + Redis adapter for horizontal fan-out
│   │   ├── storage/                S3StoragePort impl, presigned uploads, image variants
│   │   ├── mailer/                 EmailPort impl (SMTP/provider)
│   │   ├── sms/                    SmsPort impl
│   │   ├── push/                   FcmPort impl
│   │   ├── maps/                   GeoPort impl (distance, route, geocode)
│   │   ├── payment/                one adapter per gateway, all behind PaymentGatewayPort
│   │   ├── ai/                     AiProviderPort impl (+ the deterministic local engine)
│   │   ├── search/                 SearchPort impl (Postgres FTS now, OpenSearch later)
│   │   └── outbox/                 OutboxWriter + OutboxRelay (transactional outbox)
│   │
│   ├── modules/                    bounded contexts — see the table below
│   │   └── <module>/
│   │       ├── domain/
│   │       │   ├── entities/
│   │       │   ├── value-objects/
│   │       │   ├── events/
│   │       │   ├── state-machines/
│   │       │   ├── policies/               pure business rules (pricing, eligibility)
│   │       │   └── ports/
│   │       ├── application/
│   │       │   ├── commands/
│   │       │   ├── queries/
│   │       │   ├── dto/
│   │       │   ├── mappers/                domain ↔ read model
│   │       │   └── services/
│   │       ├── infrastructure/
│   │       │   ├── repositories/
│   │       │   ├── processors/             BullMQ workers
│   │       │   └── listeners/              reactions to other modules' events
│   │       ├── presentation/
│   │       │   ├── *.resolver.ts
│   │       │   ├── *.subscription.ts
│   │       │   ├── models/                 GraphQL object types
│   │       │   ├── inputs/
│   │       │   └── *.controller.ts         webhooks / health / files only
│   │       └── <module>.module.ts
│   │
│   ├── shared/                     contracts more than one module needs
│   │   ├── contracts/              published event payloads + port interfaces
│   │   ├── enums/                  the kebab-case vocabularies mirroring types/*
│   │   ├── constants/
│   │   └── kernel/                 Entity, AggregateRoot, DomainEvent, Result, Clock
│   │
│   ├── health/                     liveness, readiness, dependency probes
│   ├── logger/                     Pino setup, redaction, request correlation
│   ├── audit/                      AuditService + the interceptor's sink
│   └── graphql/                    schema assembly, directives, plugins, complexity, error mapping
│
├── prisma/ -> ../database/prisma   (single source of truth lives in database/)
├── test/
│   ├── unit/                       domain + policies, no container
│   ├── integration/                module + real Postgres/Redis via testcontainers
│   ├── e2e/                        GraphQL over HTTP against a seeded database
│   └── load/                       k6 scenarios
├── Dockerfile
├── nest-cli.json
├── tsconfig.json
└── package.json
```

## Modules

Every module is a NestJS module with its own resolvers, handlers, repositories
and queue processors. Cross-module calls go through a **published contract** —
either an injected port from `shared/contracts` or a domain event — never a
direct repository import.

| Module | Owns | Replaces frontend seam |
| --- | --- | --- |
| `auth` | login, OTP, social, tokens, sessions, devices | `services/auth.ts` |
| `users` | accounts, profile, settings, addresses, favorites | `services/account.ts`, `settings.ts`, `favorites.ts` |
| `rbac` | roles, permissions, assignment, resolution | (new) |
| `regions` | countries, currencies, languages, taxes, exchange | `config/regions.ts` |
| `settings` | platform/country/vendor settings, feature flags | (new) |
| `catalog` | cuisines, categories, vendors, branches, menus, foods | `services/catalog.ts` |
| `inventory` | stock, movements, low-stock alerts | (new, E4) |
| `search` | search, suggestions, facets, logging | `services/search.ts` |
| `cart` | server-side cart, line pricing | `stores/cart` + `lib/cart.ts` |
| `orders` | checkout, lifecycle machine, events, invoices | `services/orders.ts`, `lib/order-machine.ts` |
| `pricing` | subtotal → discount → tax → fees → total; one engine | `lib/checkout.ts`, `lib/coupons.ts` |
| `payments` | intents, gateways, webhooks, refunds, ledger, payouts | (new, E7) |
| `wallet` | balance, transactions, top-up, settle | `services/wallet.ts` |
| `promotions` | offers, coupons, claims, redemptions, eligibility | `services/offers.ts`, `coupons.ts` |
| `reviews` | reviews, replies, votes, reports, aggregates | `services/reviews.ts` |
| `reservations` | policies, availability, bookings, floor status | `services/reservations.ts` |
| `dinein` | QR config, sittings, rounds, service requests | `services/qr.ts` |
| `pos` | shifts, held tickets, sales | `services/pos.ts` |
| `delivery` | zones, riders, dispatch, jobs, stops, rider money | `services/delivery.ts` |
| `tracking` | live positions, ETA, route replay | `lib/tracking.ts` |
| `subscriptions` | meal plans, tiers, subscriptions, cycles | `services/subscriptions.ts` |
| `catering` | caterers, packages, add-ons, quotes | `services/catering.ts` |
| `cms` | collections, documents, drafts, revisions, projections | `services/cms.ts`, `pages.ts`, `content.ts` |
| `notifications` | records, dispatch, preferences, campaigns | `services/notifications.ts` |
| `realtime` | WS gateway, rooms, presence, typing | `lib/order-sim.ts` (replaces simulation) |
| `analytics` | vendor stats, revenue, hourly, best sellers, insights | `services/vendor.ts`, `lib/analytics.ts` |
| `ai` | assistant, recommendations, nutrition, recognition | `services/ai.ts` |
| `storage` | uploads, presigning, variants | (new) |
| `audit` | audit log read/write | (new) |
| `health` | probes | (new) |

## Cross-cutting decisions

**Transactions.** A `TransactionManager` exposes `runInTransaction(fn)` backed by
`prisma.$transaction`, propagated through `AsyncLocalStorage` so repositories
enlist automatically. Application handlers declare the boundary; repositories
never open one.

**Events.** In-process domain events for same-request reactions
(`EventEmitter2`), and the **transactional outbox** (`OutboxEvent`) for anything
that must survive a crash — notifications, dispatch, payouts, webhooks. Never
publish to a queue inside a transaction that could roll back.

**Errors.** Domain throws `DomainError` subclasses carrying a stable
`code` + i18n `messageKey`. One GraphQL filter maps them to
`extensions.code`; the frontend already renders i18n keys from its `Result`
envelope, so error strings stay keys, never prose. See D5 §Errors.

**Config.** `ConfigModule.forRoot({ validate })` with a Zod schema. A missing
`JWT_PRIVATE_KEY` fails the boot, not the first request.

**Logging.** Pino, JSON, one line per request plus domain events, with
`requestId` from `RequestContext` on every line and a redaction list covering
`authorization`, `password`, `token`, `otp`, `card`, `phone`, `email`.

**Multi-country.** `RequestContext` carries `countryCode`, `currency`, `locale`
and `timezone`, resolved from the authenticated user, else the `Accept-Language`
/ region headers, else the platform default. Every date-bucketing query and
every tax lookup reads it. No service calls `new Date().toISOString().slice(0,10)`.

**Clock.** `Clock` port injected everywhere; `FakeClock` in tests. This is what
makes the derived-state design (coupon status, reservation completion,
subscription schedule) testable at all.

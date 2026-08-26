# FoodOra API

NestJS modular monolith on Clean Architecture, per [`docs/backend/D1`](../docs/backend/D1-project-architecture.md).
Phases **E1 — Foundation**, **E2 — Authentication** and **E3 — Core Modules** are in place.
V1 then cut the frontend over slice by slice: **Unit 1 catalog**, **Unit 2 cart**,
**Unit 3 checkout** — see [`docs/backend/README`](../docs/backend/README.md) for the ledger.

```bash
bun install
bun run db:generate                # Prisma client ← database/prisma/schema
docker compose -f ../docker/docker-compose.dev.yml up -d
bun run db:migrate                 # first migration (E12 ships the committed set)
bun run start:dev                  # http://localhost:4000/graphql
```

Without Docker the process still starts: Postgres and Redis connect in the
background and `/health/ready` reports the truth until they are up.

## Scripts

| Command | Does |
| --- | --- |
| `bun run start:dev` | watch mode. Raises the Node heap ceiling to 4 GB explicitly — a recompile peaks around 680 MB and the default ceiling on an 8 GB machine is only 2 GB, which is what used to abort the watcher. It does **not** write `schema.gql`. |
| `bun run build` / `bun run start` | compile to `dist/`, run the compiled app |
| `bun run typecheck` / `bun run lint` | `tsc --noEmit`, ESLint incl. layer boundaries |
| `bun run schema:emit` / `schema:check` | write `schema.gql`, or fail if it is stale. These are the **only** writers: `GRAPHQL_SCHEMA_EMIT` gates it, so starting the server cannot rewrite a reviewed artifact. |
| `bun run db:generate` / `db:migrate` / `db:deploy` | delegate to `../database` |
| `bun run verify:auth` | E2's 151-assertion harness — crypto, rotation, lockout, authorization algebra. No database needed. |
| `bun run verify:core` | E3's 169-assertion harness — escalation policy, setting resolution, required channels, language sets. No database needed. |
| `bun run verify:catalog` | V1 Unit 1's 108-assertion harness — listing, sorting, opening hours, the cache rule. No database needed. |
| `bun run verify:cart` / `verify:cart:live` | V1 Unit 2 — 79 offline, 47 against real PostgreSQL (the unique constraint, tombstone revival, SQL increment, cascades). |
| `bun run verify:checkout` / `verify:checkout:live` | V1 Unit 3 — 141 offline (incl. the server-vs-frontend total agreement), 87 against real PostgreSQL (tax rules, the order-number sequence, the transaction, hash-only OTP, coupon limits). |
| `bun run seed:reference` | Reference data E3 owns: currencies, countries, languages, the 14 built-in roles, the permission catalogue, **and the per-market tax rules checkout prices from**. Idempotent. **Needs a database** — and `User.countryCode` is a non-null FK, so nothing can register until this has run. |

## Layout

```
src/
├── config/           typed, Zod-validated configuration — the only reader of process.env
├── common/           cross-cutting: errors, context, ids, scalars, pagination, filters, pipes
├── shared/           kernel (Entity, Result, Clock) + the kebab-case vocabularies
├── infrastructure/   prisma (+ 3 client extensions), redis (3 connections + cache)
├── graphql/          driver, scalar registry, sorts, payload types, shared object types
│                     (`models/User` — the one type three modules return)
├── logger/           Pino, redaction, requestId correlation
├── health/           live / ready / deep probes
└── modules/          bounded contexts — `system` is the reference implementation
                      auth · rbac · regions · users · settings · catalog · cart · orders
```

Two folders exist because of the dependency rule rather than in spite of it.
`shared/contracts/` holds a token plus an interface for capabilities that cross a
boundary nothing else may cross — `TOKEN_VERIFIER` and `AUTHORIZATION_STATE` (a guard
in `common/` cannot import a module), `RATE_LIMITER` and `UNIT_OF_WORK` (an
`application/` file cannot import `infrastructure/`), `SESSION_CONTROL` and
`SETTINGS_READER` (a module cannot reach another module's `application/`).
`common/guards/` holds the guards that depend on them.

`shared/permissions.ts` is the other file worth reading first: the platform's
permission catalogue, closed, with `PermissionSlug` as a literal union — so
`@Permissions('users:wirte')` is a compile error rather than a door that silently
locks for everyone.

## The dependency rule

```
presentation ──┐
               ├──► application ──► domain
infrastructure ┘
```

`domain/` imports nothing from NestJS, Prisma, Redis or GraphQL; it declares
**ports** and the layers outside it supply adapters. A module may import another
module's `domain/` — its published contract — and nothing else.

This is enforced by `eslint.config.mjs`, so a violation fails `bun run lint` and
therefore CI. `src/modules/system` is the smallest complete example: a port in
`domain/ports`, a service in `application` that depends only on the port, an
adapter in `infrastructure` that is the one file knowing Prisma exists, and a
resolver in `presentation` that validates, delegates and maps.

## Conventions worth knowing before writing a module

- **Nothing reads `process.env`.** Inject a namespace: `@Inject(appConfig.KEY)`.
  A lint rule enforces it, and boot fails on a missing or malformed variable.
- **Nothing calls `Date.now()`.** Inject `CLOCK`. Derived state — coupon expiry,
  a reservation completing, a subscription's pause expiring — is only testable
  because time is a dependency.
- **Expected refusals are data, not exceptions.** An ineligible coupon returns a
  `Result` failure carried in a mutation payload with HTTP 200. Only genuinely
  exceptional conditions throw a `DomainError`.
- **Errors carry i18n keys, never prose.** The frontend renders them in en/bn/ar.
- **Repositories never open transactions.** The application handler declares the
  boundary with `TransactionManager.runInTransaction`; repositories enlist
  automatically through `AsyncLocalStorage`.
- **`delete` is refused on soft-deletable models.** Use `softDelete()`, which
  stays inside the active transaction. See the header of
  `infrastructure/prisma/extensions/soft-delete.extension.ts`.
- **Kebab-case vocabularies are scalars, not GraphQL enums** — `"cloud-kitchen"`
  must reach the client verbatim. Mint them in `graphql/scalars.registry.ts`, and cross
  the Prisma boundary with `enumCodec('UserRoleSlug')` rather than a hand-written map.
  Call `assertVocabularyMatches` in the owning module's `onModuleInit` so drift between
  the union and the Postgres enum fails the boot instead of one unlucky query.
- **Every mutation returns a payload type.** `payloadOf(Thing, 'ThingPayload')` mints
  it and `toPayload(result)` maps a `Result<T>` into it, so a refusal is data at HTTP
  200 and the frontend's `Result<T>` needs no reshaping.
- **Protection is the default.** The guard chain is global, so a new resolver is
  authenticated unless it says `@Public()`. Declare what it needs with `@Roles()` /
  `@Permissions()`; add `@FreshSession()` to anything that moves money or changes
  access. A `@VendorScope('input.vendorId')` gate is a cheap early refusal, never the
  boundary — row scoping belongs in the repository, so an id outside the scope reads as
  `NOT_FOUND` rather than `FORBIDDEN`.

## Contract with the frontend

`frontend/services/*` is the seam. Each function keeps its signature and return
type while its body changes from a mock read to a GraphQL request, selected per
service by `NEXT_PUBLIC_API_MODE=mock|graphql`. Nothing in `frontend/` has changed
yet: the mutations exist, but with no demo accounts (E12) there is nothing to sign in
to, so flipping the seam would be unverifiable code. What the flip needs is listed in
[E2 §What the cutover still needs](../docs/backend/E2-authentication.md#what-the-cutover-still-needs)
and [E3 §What the cutover still needs](../docs/backend/E3-core-modules.md#what-the-cutover-still-needs)
— E3's `seed:reference` clears the hard blocker there, since a country row has to exist
before any account can.

One constant deliberately stays in the frontend until E5: `config/regions.ts`'s
`taxRate` and `taxLabel`. A single rate per country is the prototype's simplification,
and `TaxRule` is dated and scoped because one order can attract several rules at once.

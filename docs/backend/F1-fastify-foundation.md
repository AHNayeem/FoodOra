# F1 — Fastify Backend Foundation

**Built 2026-08-27.** The first document in this directory that describes code
that exists in `backend/` today. Everything numbered `D*` and `E*` beside it
designs the removed NestJS backend and is a historical record; where it and this
disagree, this wins.

**Scope: the foundation, and deliberately nothing else.** No business module is
implemented. What is here is the frame each of the 32 modules in
[BACKEND-REQUIREMENTS §3](../FOODORA-BACKEND-REQUIREMENTS.md#3-module-build-order)
mounts into, plus the one blocking prerequisite §2 named — the reference-data
seeder.

---

## 1. Stack

| Layer | Choice | Version |
| --- | --- | --- |
| Runtime | Node.js | ≥ 20.11 (built on 20.17) |
| Language | JavaScript, ES modules (`"type": "module"`) | — |
| HTTP | Fastify | 5.x |
| ORM | Prisma Client, from `@foodora/database` | 6.19 |
| Database | PostgreSQL | 18.4 |
| Tests | `node:test` | built in |

Six runtime dependencies, all first-party Fastify plugins: `@fastify/cors`,
`@fastify/helmet`, `@fastify/jwt`, `@fastify/rate-limit`, `@fastify/sensible`,
`fastify-plugin`. Plus `dotenv` and `ulid`.

**Not used, by instruction:** TypeScript, NestJS, Redis, Docker, GraphQL.
`npm run check:forbidden` searches the tree and the manifest for all five and
exits non-zero on a hit, so the claim stays true rather than becoming folklore.

> **The GraphQL question is not closed.** This backend is REST, and the
> frontend's live path (`lib/graphql/`, 1,691 LOC, and the `verify:graphql`
> gate that reads a `backend/schema.gql` which no longer exists) is Apollo. That
> is `Analysis.md` A3/A4 and it is a **frontend** decision, untouched by this
> phase. See §11.

---

## 2. Folder structure

```
backend/
├── src/
│   ├── app.js                    buildApp() — the application, not listening
│   ├── server.js                 listen, signals, graceful shutdown
│   │
│   ├── config/
│   │   └── env.js                the only reader of process.env
│   │
│   ├── plugins/                  cross-cutting, registered once
│   │   ├── prisma.js             client lifecycle, soft delete, checkDatabase()
│   │   ├── auth.js               JWT config + authenticate / optionalAuth / authorize
│   │   ├── cors.js
│   │   ├── security.js           helmet, tuned for a JSON API
│   │   ├── rate-limit.js
│   │   └── sensible.js
│   │
│   ├── middleware/
│   │   ├── error-handler.js      anything → the error contract
│   │   └── request-context.js    request ids, log serialisers, redaction
│   │
│   ├── shared/
│   │   ├── constants/            error codes, id prefixes
│   │   ├── errors/               AppError + the response envelopes
│   │   ├── utils/                enums, ids, serialize, versioning, pagination
│   │   └── validators/           the shared JSON Schemas
│   │
│   ├── routes/
│   │   ├── index.js              unversioned health + the versioned mount
│   │   └── v1/index.js           where modules register
│   │
│   ├── health/routes.js          /health and /health/ready
│   │
│   └── seed/
│       ├── reference.js          the seeder
│       └── data/                 the tables, copied from the frontend
│
├── scripts/
│   ├── seed-reference.js         the entry point `prisma db seed` calls
│   └── check-forbidden.js
├── tests/                        7 files, 74 assertions
├── .env.example
└── package.json
```

**There is no `backend/prisma/`.** The recommended structure in the phase brief
had one; the database phase is explicit that there is a single finalised
datamodel and a second copy of it is a bug waiting to diverge. The schema stays
in `database/prisma/schema/` (18 files, 184 models, 127 enums) and the backend
consumes the generated client through the `@foodora/database` package. See §4.

A module lands as `src/modules/<name>/` — routes, handlers, its own schemas —
and one `register` line in `routes/v1/index.js`.

---

## 3. Application lifecycle

`buildApp()` and `server.js` are separate on purpose: `buildApp()` returns a
fully wired instance that has never bound a port, so the whole test suite runs
through `app.inject()` against the real plugin chain with no socket.

**Registration order** (`src/app.js`), each step needed by the next:

1. shared JSON Schemas, so a route may `$ref` them;
2. the error handler and 404 handler;
3. **prisma** — connects during boot, so an unreachable database is a start-up
   failure rather than a 500 on the first request;
4. security → cors → rate limit, outermost first;
5. sensible, auth — decorators only;
6. routes.

**Startup** fails loudly. `config/env.js` validates the whole environment once
and throws with every problem listed; in production a missing or short
`JWT_SECRET` is one of them.

**Shutdown** is three rules in `server.js`:

- `SIGTERM`/`SIGINT` → `app.close()`: stop accepting, let in-flight requests
  finish, then `onClose` returns the Prisma pool.
- `SHUTDOWN_TIMEOUT_MS` (10s) is a hard deadline with exit code 1, so one slow
  query cannot hold a deployment open.
- A second signal exits immediately.

`unhandledRejection` and `uncaughtException` are fatal: after an uncaught throw
the process state is unknown, and serving from an unknown state is worse than
restarting.

---

## 4. Prisma integration

The client is generated by the `database` package into `database/generated/client`
(gitignored) and reached through the `@foodora/database` package name, which
`backend/package.json` declares as `file:../database`. `database/package.json`
gained a `main`/`exports` pointing at the generated client — the change that
makes `import { PrismaClient } from "@foodora/database"` resolve, which its own
README already said consumers would do.

`npm run db:generate` regenerates it; `db:validate` and `db:status` run against
the same schema directory. **`migrate deploy`, never `migrate dev`** — 12 partial
indexes and 5 CHECK constraints are invisible to Prisma and read as drift.

Three layers sit on the client, each answering an obligation from
[BACKEND-REQUIREMENTS §1](../FOODORA-BACKEND-REQUIREMENTS.md#1-what-the-database-already-decides-for-you):

### Enum translation — `shared/utils/enums.js`

The schema stores enum labels in the frontend's kebab-case vocabulary via `@map`,
**but the client does not**: `order.status` comes back `"COMPLETED"` and
`where: { status: "completed" }` is rejected. Over 127 enums, a hand-written map
is a guaranteed wrong entry, so it is derived at boot from
`Prisma.dmmf.datamodel`, which carries each member's `dbName`. Add an enum member
to the schema, regenerate, and the map has it.

```js
toApiEnum("OrderStatusKind", "RIDER_ASSIGNED")   // → "rider-assigned"
toDbEnum("OrderStatusKind", "rider-assigned")    // → "RIDER_ASSIGNED"
toApiRow("Order", row)                           // every enum field of one row
toDbInput("Order", { status: { in: ["completed"] } })   // filters too
```

Verified in the database, not assumed: `select direction from languages` returns
`rtl` while `language.direction` returns `RTL`.

### Soft delete — `plugins/prisma.js`

A Prisma client extension adds `deletedAt: null` to `findUnique`, `findFirst`,
`findMany`, `count`, `aggregate` and `groupBy`, and refuses `delete`/`deleteMany`
outright, for the models that have the column — discovered from the generated
schema rather than a hand-kept list, so the immutable financial tables (ledger
entries, order events, payments) are excluded automatically.

Two stated limits: relations loaded through `include` are **not** filtered (a
query extension sees the top-level model only — filter in the `include`), and
`update`/`updateMany` are left alone so a row can be restored. `prisma.$unfiltered()`
returns the unextended client for the three callers that need it.

### Money and locking — `shared/utils/`

- `serialize.js` — `Decimal` → `number` at the API boundary **and nowhere else**;
  `Decimal#toJSON` returns a *string*, so leaving this to `JSON.stringify` would
  silently change every money field's type on the wire.
- `versioning.js` — `updateVersioned()` writes through
  `updateMany({ where: { id, version } })` and turns a 0-row result into a
  `CONFLICT` (or `NOT_FOUND` if the row is gone). Written as a helper because the
  difference between the correct call and the lost-update bug is the presence of
  one word.
- `ids.js` — `newId("usr_")` mints prefix + ULID; unregistered prefixes are
  refused. `deterministicId("prm_", "orders.view")` derives a stable id from a
  natural key, for reference data (§8).

---

## 5. Error contract

Not invented here. `frontend/lib/graphql/result.ts` already documents two failure
shapes and `frontend/services/http.ts` already returns `Result<T>`; the contract
is those files written as JSON.

| Outcome | HTTP | Body |
| --- | --- | --- |
| success | 200 | `{ "success": true, "data": … }` |
| expected refusal | **200** | `{ "success": false, "error": { "key": "errors.invalidOtp", "path": "code" } }` |
| exception | 4xx/5xx | `{ "success": false, "error": { "code", "key", "message", "details?", "requestId" } }` |

**The refusal is the part worth understanding.** A wrong password, a spent OTP,
an ineligible coupon: the request was well formed, the server understood it, and
the answer is no. `fromPayload` in the frontend unwraps exactly this at HTTP 200.
Returning a 400 would push a business outcome into the client's exception path,
log it as an error, and make every form special-case a status code.

`key` is always an i18n key from `messages/*.json`, never prose — the API does
not know whether the reader chose `en`, `bn` or `ar`. A key must also be in
`RENDERABLE` in `lib/graphql/result.ts` or the screen degrades to
`errors.generic`.

### The closed set of codes

`shared/constants/error-codes.js`. Six of these are already mapped to i18n keys
by the frontend's `BY_CODE`; the rest fall back to `errors.generic`.

| Code | HTTP | i18n key |
| --- | --- | --- |
| `BAD_USER_INPUT` | 400 | `errors.invalidInput` |
| `UNAUTHENTICATED` | 401 | `errors.unauthenticated` |
| `FORBIDDEN` | 403 | `errors.forbidden` |
| `NOT_FOUND` | 404 | `errors.notFound` |
| `CONFLICT` | 409 | `errors.generic` ¹ |
| `PAYLOAD_TOO_LARGE` | 413 | `errors.invalidInput` |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | `errors.invalidInput` |
| `UNPROCESSABLE_ENTITY` | 422 | `errors.invalidInput` |
| `TOO_MANY_REQUESTS` | 429 | `errors.tooManyRequests` |
| `INTERNAL_ERROR` | 500 | `errors.generic` |
| `SERVICE_UNAVAILABLE` | 503 | `errors.serviceUnavailable` |

¹ There is no `errors.conflict` in the three locale files. Adding the code with a
key nothing can render would put an untranslated string on a screen; the module
that first needs a specific conflict message adds the key to `en`, `bn` and `ar`
and to `RENDERABLE` at the same time.

### What reaches the handler

Four kinds of thing, each normalised once (`middleware/error-handler.js`):

1. an `AppError` — passed through;
2. an Ajv validation error — `BAD_USER_INPUT` with `details: [{ field, rule, message }]`;
3. a Prisma error — `P2002` → `CONFLICT`, `P2025` → `NOT_FOUND`, `P2003` →
   `BAD_USER_INPUT`, `P2034` → `CONFLICT`, `P1001`/`P1002`/`P1008`/`P1017` →
   `SERVICE_UNAVAILABLE`, `PrismaClientValidationError` → `INTERNAL_ERROR`
   (a malformed query is *our* bug, not the caller's);
4. anything else — logged with its stack, answered with `INTERNAL_ERROR` and
   nothing more. **The client never sees a message we did not choose.**

---

## 6. Response contract

| Situation | Shape |
| --- | --- |
| success | `ok(data)` → `{ success: true, data }` |
| list | `okPage({ items, total, page, pageSize })` → adds `hasMore`; matches `Paginated<T>` field for field |
| validation failure | 400, `details` names each field |
| authentication failure | 401 `UNAUTHENTICATED` |
| authorization failure | 403 `FORBIDDEN`, `details.required` lists the permissions |
| not found | 404 `NOT_FOUND` |
| conflict | 409 `CONFLICT` — optimistic lock lost, or a unique collision |
| database failure | 503 `SERVICE_UNAVAILABLE` |
| unexpected | 500 `INTERNAL_ERROR`, no details |
| business refusal | **200** `{ success: false, error: { key } }` |

`/health` and `/health/ready` are the only routes outside the envelope, and the
exception is deliberate: their readers are a load balancer and a monitoring
check, neither of which will be taught to unwrap `data`. The 503 body *is* in the
error shape, because that one is also read by people.

---

## 7. Validation

Fastify's own: JSON Schema compiled by Ajv, declared per route under `params`,
`querystring`, `headers`, `body`, and a `response` schema that both documents and
serialises. No validation library on top — Fastify compiles a schema once at boot
so validation is free per request, and the same declaration is what an OpenAPI
document is generated from later. A second validator would put the route's real
contract somewhere the framework cannot see.

Ajv options (`src/app.js`): `coerceTypes: "array"` (a query string has no types),
`removeAdditional: "all"` (a field nobody declared is a field nobody validated),
`useDefaults`, `allErrors` (one round trip, not one per mistake).

Shared schemas, registered once and referenced as `{ $ref: "id#" }`:

| `$id` | What |
| --- | --- |
| `id` | `^[a-z]{2,6}_[Crockford]{26}$` — the platform's id format |
| `error` | the exception body |
| `paginationQuery` | `?page=&pageSize=` with the 100-row cap |

Plus `success(dataSchema)` to wrap a payload in the envelope, and
`commonErrorResponses` for the four every route can produce.

---

## 8. The reference seeder

`database/package.json#prisma.seed` pointed at the removed NestJS backend's
`seed:reference`, which is why `bun run seed` had been failing. It now points at
`node ../backend/scripts/seed-reference.js`. **The blocking prerequisite in
BACKEND-REQUIREMENTS §2 is closed.**

```bash
cd backend  && npm run seed:reference
cd database && bun run seed          # prisma db seed → the same file
```

255 rows across 14 tables:

| Table | Rows | Source in the frontend |
| --- | --- | --- |
| `currencies` | 5 | `config/regions.ts::currencies` |
| `languages` | 3 | `config/i18n/config.ts::localeMeta` |
| `countries` | 5 | `config/regions.ts::countries` |
| `country_languages` | 15 | all three locales everywhere; `en` default |
| `tax_rules` | 5 | `config/regions.ts` `taxRate`/`taxLabel` |
| `permissions` | 20 | `lib/rbac.ts::PLATFORM_PERMISSIONS` |
| `roles` | 14 | `types/user.ts::UserRole` |
| `role_permissions` | 54 | `lib/rbac.ts::ROLE_PERMISSIONS` |
| `delivery_zones` | 3 | `lib/mock/delivery-zones.ts` |
| `zone_areas` | 19 | area centroids from `lib/mock/drop-points.ts` |
| `payment_providers` | 5 | cash + wallet enabled; three gateways disabled, test mode |
| `ledger_accounts` | 6 | the platform-owned kinds, BDT |
| `cms_collections` | 9 | `lib/mock/cms.ts::cmsCollections`, exported verbatim |
| `notification_templates` | 92 | one per `notifications.<audience>.<key>` in `messages/*.json` |

**The seeder invents nothing.** Every row is a copy of something the frontend
already publishes, with the source named beside it. A rate or a permission slug
that existed only here would be a second source of truth that drifts the first
time somebody edits the frontend's copy. Where a column has no frontend
equivalent it is left at the schema's default and the reason is stated in
`src/seed/data/reference.js` — `Role.rank`, `DeliveryZone.customerBaseFee`.

Three properties, all tested:

- **Deterministic.** Ids come from `deterministicId()`, a hash of the natural key,
  so `orders.view` is the same permission id in every database that has ever run
  this and a `RolePermission` grant means the same thing in staging as in
  production.
- **Idempotent.** Every write is an upsert on a key the row already has; the
  second run changes nothing, ids included.
- **Safe on a live database.** The `update` half refreshes the *definition* and
  never touches `deletedAt`. A zone an operator deactivated stays deactivated.

It runs in one transaction: a half-seeded database — permissions but no roles —
is harder to reason about than an empty one.

**What it does not seed:** accounts, restaurants, menus, orders. §2 is explicit
that a demo seeder is separate and comes after.

Two derived columns worth knowing about. `NotificationTemplate.channels`, `topic`
and `isRequired` are computed from the two rules `lib/notifications.ts::channelsFor`
actually implements — only a customer has preferences, and a customer's topic is
`CATEGORY_TOPIC[category]` — rather than typed out. Written out they would be 276
values that must agree with a function in another repository, and the first to
drift would email somebody who turned email off.

---

## 9. Authentication foundation

**Not the authentication module.** No registration, sign-in, password reset, OTP,
refresh rotation, device list or role management — those are modules 2 and 3, they
need Argon2id and a session table, and half of one here would mean the module
that owns it starts by deleting code.

What exists (`plugins/auth.js`):

| Decorator | Use |
| --- | --- |
| `fastify.authenticate` | `preHandler` — requires a valid **access** token |
| `fastify.optionalAuth` | populates `request.user` if a token is present, carries on if not |
| `fastify.authorize(...perms)` | requires **all** of them; 403 with `details.required` |
| `fastify.signAccessToken(claims)` | the auth module decides *when*; this decides *how* |
| `fastify.signRefreshToken(claims)` | same key, different lifetime and `tokenType` |
| `fastify.hasPermission(user, perm)` | the same reading as `lib/rbac.ts` |

`request.user` — the vocabulary is the frontend's, so a claim is comparable to a
frontend constant without translation:

```js
{ id, roles: ["customer-support"], permissions: ["orders.view"], sessionId, tokenType: "access" }
```

Two decisions that are load-bearing:

- **A refresh token is refused as a bearer credential.** They are signed with the
  same secret; without the `tokenType` check a stolen refresh token would open
  the whole API.
- **`authorize` requires all its arguments, not any.** "Any" silently widens
  access the first time someone adds a second argument expecting it to narrow.
  Wildcards are honoured exactly as `lib/rbac.ts` honours them (`*`,
  `orders.*`), and the legacy colon vocabulary (`orders:view`) grants nothing —
  reading it as `orders.view` would hand every restaurant owner the
  platform-wide order list.

**Where permissions come from is a stated limitation.** From the token, for now.
Module 3 resolves `role grants ∪ direct grants − denials` against the database
and this reads whatever it puts in the claim; module 2 mints tokens with
`permissions: []`, so nothing depends on the answer yet.

> **Superseded in part by [M2](./M2-auth-sessions.md).** The module is built.
> `authenticate` is unchanged and still answers only "is this a valid access
> token", from the claims, with no database read — which is not enough to
> protect a route, because it stays true for fifteen minutes after the account is
> suspended, deleted or signed out. **New routes should use `fastify.requireUser`**
> (M2 §5), which re-reads the account, the session row and
> `credentials.tokenEpoch`. M2 also fixed a bug in `plugins/rate-limit.js` that
> made every rate-limited request answer 500 instead of 429 — see M2 §6.

---

## 10. API versioning

`/api/v1`, from `API_PREFIX`. In the path because that is what the frontend is
built against (`config/backend.ts` composes `API_URL` with a path) and because a
version in the path is visible in a log line, an address bar and a curl command.

`/health` and `/health/ready` are **also** served unprefixed, and that is the
operational split: infrastructure should not have to know which API version is
current, because a probe URL that changes on a version bump is a probe that fails
on deploy day.

A module registers one line in `routes/v1/index.js`. v2 would be a folder beside
`v1/`, mounted at `/api/v2`, sharing `shared/` and `plugins/`, running alongside
until the frontend has moved.

---

## 11. Environment

`config/env.js` is the only reader of `process.env`; everything else imports the
validated object. A missing or malformed variable throws at start-up with every
problem listed.

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `HOST` / `PORT` | `0.0.0.0` / `4000` | matches `NEXT_PUBLIC_API_URL` |
| `LOG_LEVEL` | `info` (`silent` in test) | |
| `LOG_PRETTY` | true in development | production emits NDJSON |
| `TRUST_PROXY` | `false` | on only behind a proxy that *overwrites* `x-forwarded-for` |
| `BODY_LIMIT_BYTES` | 1 MiB | |
| `SHUTDOWN_TIMEOUT_MS` | 10000 | |
| `DATABASE_URL` | — | **required** |
| `DATABASE_DIRECT_URL` | `DATABASE_URL` | the datasource declares `directUrl`, so the Prisma CLI refuses to run without it; differs only behind a pooler |
| `DATABASE_HEALTH_TIMEOUT_MS` | 2000 | shorter than the load balancer's own timeout |
| `CORS_ORIGINS` | `http://localhost:3000` | comma-separated; `*` echoes the origin |
| `CORS_CREDENTIALS` | `true` | |
| `JWT_SECRET` | dev placeholder | **required in production, ≥ 32 chars** |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `foodora` / `foodora-api` | |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `15m` / `30d` | |
| `RATE_LIMIT_ENABLED` / `_MAX` / `_WINDOW_MS` | on / 300 / 60000 | in-process, therefore **per instance** |
| `API_PREFIX` | `/api/v1` | |

No `REDIS_URL`, no Docker variables, no NestJS variables. `.env` is gitignored;
`.env.example` holds defaults and no secrets.

---

## 12. Testing

`npm test` → `NODE_ENV=test node --test tests/`. No test framework: Node 20 has
one, and a dependency here would be a dependency in every future module.

| File | What it holds the line on |
| --- | --- |
| `app.test.js` | boot, root route, request ids (including a forged one), 404 shape, security headers, CORS allow-list, clean shutdown |
| `health.test.js` | liveness, readiness, both prefixes, **the 503 branch**, probe exemption from the rate limiter |
| `error-contract.test.js` | AppError pass-through, 500 leaks nothing, Prisma code mapping, the 200 refusal |
| `validation.test.js` | schema enforcement, field-level details, coercion, `removeAdditional`, the page-size cap |
| `prisma-layer.test.js` | all 127 enums round-trip, soft-delete model discovery, id rules, `Decimal` → `number` |
| `soft-delete.test.js` | a deleted row is invisible to `findMany` **and `findUnique`**, against real PostgreSQL |
| `auth-foundation.test.js` | the guards, the `tokenType` refusal, permission semantics against `lib/rbac.ts` |
| `seed.test.js` | the §2 minimum set, centroids, kebab-case in the column, **a second run changes nothing** |

**74 assertions, all passing, against real PostgreSQL.** Two of them are the ones
that matter: readiness answering 503 when the check fails (a ready check that
always returns 200 is worse than none, because the deploy that broke the
connection string goes green), and the seeder's second run being a no-op.

Domain suites arrive with their modules — §5 of BACKEND-REQUIREMENTS, item 5.

---

## 13. Commands

```bash
# from backend/
npm install
npm run db:generate       # Prisma client ← database/prisma/schema
npm run db:validate       # schema is valid
npm run db:status         # migrations applied?
npm run seed:reference    # reference data (idempotent)
npm run dev               # node --watch
npm start                 # production
npm test
npm run check:forbidden   # no TypeScript / NestJS / Redis / Docker / GraphQL
npm run verify            # db:validate + check:forbidden + test

# from database/
bun run migrate:deploy    # never migrate dev — 12 partial indexes read as drift
bun run seed              # → backend/scripts/seed-reference.js
```

---

## 14. What this phase leaves open

1. **The GraphQL layer, A3/A4.** This backend is REST. `frontend/lib/graphql/`
   (1,691 LOC) and the `verify:graphql` gate that reads a deleted
   `backend/schema.gql` are still there. The honest options remain what
   BACKEND-REQUIREMENTS §4 said: vendor a schema copy for the gate, or remove the
   layer and the gate together. **Not decided here** — it is a frontend change,
   and this phase touched no frontend file.
2. **`frontend/.env.local` points at a deleted API, A1/A2.**
   `NEXT_PUBLIC_BACKEND_AUTH=1` and `NEXT_PUBLIC_BACKEND_CATALOG=1` are on with
   no endpoint behind them. They must be `0` until a real endpoint answers — and
   when one does, it will answer REST, not the GraphQL those flags reach for.
   Again a frontend file, deliberately untouched.
3. **Rate limiting is per instance.** The store is memory; two instances each
   allow the full budget. A shared store would be Redis, which is out of scope,
   so the number should be read as "per instance".
4. **Nothing mints a token.** The auth foundation is configuration and guards;
   module 2 makes it reachable.
5. **`package.json#prisma` is deprecated** and goes away in Prisma 7. The
   replacement, `prisma.config.ts`, stops Prisma auto-loading `.env`, so the move
   needs explicit env loading and a re-test of every command — deferred to the
   Prisma 7 upgrade, as the database phase already recorded.

## 15. Recommended first module

**Module 2 — Auth & sessions.** Module 0 (foundation) and module 1 (reference
data & seeder) are done; §3 puts auth next and nothing above it is unblocked
without it. Concretely: Argon2id hashing, `Session` with refresh rotation and
reuse detection, OTP, the device list — and the frontend surface it replaces
already exists behind `NEXT_PUBLIC_BACKEND_AUTH`, which means the module has a
real acceptance test the day it lands.

Module 3 (RBAC/PBAC) follows immediately, because the permission catalogue and
all fourteen roles are already in the database and `authorize()` is waiting for a
resolver behind it.

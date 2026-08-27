# @foodora/backend

The FoodOra API. **Fastify · JavaScript · Prisma · PostgreSQL.** No TypeScript,
no NestJS, no Redis, no Docker, no GraphQL.

**Three of the 32 modules in
[BACKEND-REQUIREMENTS §3](../docs/FOODORA-BACKEND-REQUIREMENTS.md#3-module-build-order)
are built:** module 1, reference data; module 2, auth & sessions; and module 3,
RBAC/PBAC. The rest is the frame they mount into. Next is module 4.

| Document | |
| --- | --- |
| [`F1 — Fastify foundation`](../docs/backend/F1-fastify-foundation.md) | stack, structure, lifecycle, Prisma layers, error and response contracts, validation, the seeder |
| [`M2 — Auth & sessions`](../docs/backend/M2-auth-sessions.md) | Argon2id, the session and refresh lifecycle, rotation with reuse detection, OTP, password reset, `requireUser` |
| [`M3 — RBAC / PBAC`](../docs/backend/M3-rbac-pbac.md) | role and permission resolution, vendor scope, the authorization guards, 401 vs 403, the permission cache |

## Getting it running

```bash
# 1. PostgreSQL 12+ with pg_trgm, unaccent, citext and btree_gin available.
#    Whatever DATABASE_URL points at.

cd database && bun run migrate:deploy    # 4 migrations — deploy, never dev

# 2. The Prisma client. Generated into database/generated/client (gitignored),
#    imported here as @foodora/database.
cd ../backend
npm install
npm run db:generate

# 3. Configuration.
cp .env.example .env      # every value is already the default

# 4. Reference data. Nothing works before this: User.countryCode is a non-null
#    FK to countries, so no account can exist until a country row does.
npm run seed:reference

# 5. Go.
npm run dev
curl localhost:4000/health/ready
```

## Commands

| Command | What |
| --- | --- |
| `npm run dev` | `node --watch src/server.js` |
| `npm start` | production |
| `npm test` | 144 assertions, `node:test`, against real PostgreSQL |
| `npm run seed:reference` | reference data — deterministic, idempotent |
| `npm run db:generate` | regenerate the Prisma client |
| `npm run db:validate` / `db:status` | schema valid / migrations applied |
| `npm run check:forbidden` | searches for TypeScript, NestJS, Redis, Docker, GraphQL |
| `npm run auth:flow` | the module 2 lifecycle end to end over a real socket — 51 checks |
| `npm run verify` | `db:validate` + `check:forbidden` + `test` + `auth:flow` |

## Endpoints

| Route | |
| --- | --- |
| `GET /` | what this is, and where the rest of it is |
| `GET /health` | liveness — answered from memory, touches nothing |
| `GET /health/ready` | readiness — queries PostgreSQL; **503** when it cannot |
| `GET /api/v1/health`, `/api/v1/health/ready` | the same two, versioned |

**Module 2 — auth & sessions**, at `/api/v1/auth`. Contracts in
[M2 §4](../docs/backend/M2-auth-sessions.md#4-endpoints).

| Route | |
| --- | --- |
| `POST /register` | create an account and sign in |
| `POST /login` | email + password |
| `POST /otp/request`, `/otp/verify` | one-time code; verifying a `login` code signs in |
| `POST /password/forgot`, `/password/reset` | reset by emailed token |
| `POST /refresh` | spend the refresh cookie; rotates, and detects reuse |
| `POST /logout` | `{ allDevices? }` |
| `GET /me` | the signed-in account |

Guard a new route with **`fastify.requireUser`**, not bare `fastify.authenticate`:
the second checks the token, the first also checks the account, the session row
and `credentials.tokenEpoch`, which is what makes revocation immediate.
[M2 §5](../docs/backend/M2-auth-sessions.md#5-requireuser--the-guard-for-every-later-module).

**Module 3 — RBAC/PBAC.** Declare what a route needs and the guard authenticates
and authorizes in one line. Contracts in
[M3 §6](../docs/backend/M3-rbac-pbac.md#6-the-fastify-authorization-api).

```js
fastify.get("/orders",      { preHandler: fastify.requirePermission("orders.view") }, handler)
fastify.get("/queue",       { preHandler: fastify.requireAnyPermission("support.view", "orders.view") }, handler)
fastify.get("/flags",       { preHandler: fastify.requireRole("super-admin") }, handler)
fastify.get("/v/:vendorId", { preHandler: fastify.requireVendorAccess() }, handler)

// the permission AND the record it is being used on
fastify.get("/v/:vendorId/orders", {
  preHandler: fastify.requireAuthorization({
    permission: "orders.view",
    vendor: (request) => request.params.vendorId,
  }),
}, handler)
```

Permissions are resolved from the database on the request — `role grants ∪ direct
grants − denials` — never from the token, whose `permissions` claim is `[]` on
purpose. A misspelt slug throws at startup, not at the first refusal. Use these,
not `fastify.authorize`, which reads that empty claim and is F1's.

`/api/v1/_authz` carries verification probes outside production.

## The five things to know before writing a module

Each one is an obligation the database makes and does not enforce
([BACKEND-REQUIREMENTS §1](../docs/FOODORA-BACKEND-REQUIREMENTS.md#1-what-the-database-already-decides-for-you)),
and each already has a home here.

1. **Every write supplies a prefixed id.** `newId("ord_")`. No column has a
   generating default. Register the prefix in `shared/constants/id-prefixes.js`
   first — an unregistered one is refused.
2. **The client speaks `COMPLETED`; the frontend speaks `"completed"`.** Use
   `toApiRow` / `toDbInput` from `shared/utils/enums.js`. The map is derived from
   the generated schema, so there is nothing to keep in step.
3. **Money is `Decimal`.** Never `Number(...)` it before arithmetic. `toJsonSafe`
   converts at the boundary and nowhere else.
4. **Versioned rows are written with `updateVersioned`.** A plain `update`
   compiles, runs, and silently discards the other writer's change.
5. **Soft delete is handled for reads on the top-level model only.** A relation
   loaded through `include` filters itself:
   `include: { branches: { where: { deletedAt: null } } }`.

## The API's two failure shapes

Not invented here — `frontend/lib/graphql/result.ts` is already written against
them.

```jsonc
// success
{ "success": true, "data": { … } }

// an expected refusal — wrong password, spent code, ineligible coupon.
// HTTP 200: the request was fine and the answer is no.
{ "success": false, "error": { "key": "errors.invalidOtp", "path": "code" } }

// an exception — no token, forbidden, the database is down. 4xx/5xx.
{ "success": false, "error": { "code": "NOT_FOUND", "key": "errors.notFound",
                               "message": "Vendor not found", "requestId": "req_…" } }
```

`key` is an i18n key from `messages/*.json`, never prose. Throwing where a
refusal belongs turns a business answer into a 4xx that every form has to
special-case.

## Layout

`src/app.js` builds the application without listening — which is how the whole
test suite runs against the real plugin chain with no socket. `src/server.js`
adds the port and the signal handling.

```
config/      env.js — the only reader of process.env
plugins/     prisma, auth, cors, security, rate-limit, sensible
middleware/  error-handler, request-context
shared/      constants · errors · utils · validators
routes/      index.js → v1/index.js (where modules register)
modules/
  auth/      module 2 — routes · controller · service · repository · schemas · utils
  authz/     module 3 — index (guards) · service · policy · repository · routes
health/      /health, /health/ready
seed/        reference.js + data/
```

There is no `backend/prisma/`, deliberately: there is one datamodel, it lives in
`database/prisma/schema/`, and a second copy would be a bug waiting to diverge.

# @foodora/backend

The FoodOra API. **Fastify · JavaScript · Prisma · PostgreSQL.** No TypeScript,
no NestJS, no Redis, no Docker, no GraphQL.

**Foundation only.** No business module is implemented yet — this is the frame
the 32 modules in
[BACKEND-REQUIREMENTS §3](../docs/FOODORA-BACKEND-REQUIREMENTS.md#3-module-build-order)
mount into, plus the reference seeder §2 called the one blocking prerequisite.
The architecture document is
[`docs/backend/F1-fastify-foundation.md`](../docs/backend/F1-fastify-foundation.md).

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
| `npm test` | 74 assertions, `node:test`, against real PostgreSQL |
| `npm run seed:reference` | reference data — deterministic, idempotent |
| `npm run db:generate` | regenerate the Prisma client |
| `npm run db:validate` / `db:status` | schema valid / migrations applied |
| `npm run check:forbidden` | searches for TypeScript, NestJS, Redis, Docker, GraphQL |
| `npm run verify` | `db:validate` + `check:forbidden` + `test` |

## Endpoints

| Route | |
| --- | --- |
| `GET /` | what this is, and where the rest of it is |
| `GET /health` | liveness — answered from memory, touches nothing |
| `GET /health/ready` | readiness — queries PostgreSQL; **503** when it cannot |
| `GET /api/v1/health`, `/api/v1/health/ready` | the same two, versioned |

Modules mount under `/api/v1`. There are none yet, by instruction.

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
health/      /health, /health/ready
seed/        reference.js + data/
```

There is no `backend/prisma/`, deliberately: there is one datamodel, it lives in
`database/prisma/schema/`, and a second copy would be a bug waiting to diverge.

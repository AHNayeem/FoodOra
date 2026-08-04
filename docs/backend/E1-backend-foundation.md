# E1 — Backend Foundation

The NestJS application exists and runs. No feature module, no authentication, no
frontend change — E1's whole job is to make the next eleven phases a matter of
adding modules rather than deciding architecture.

```bash
cd backend && bun install && bun run db:generate
docker compose -f docker/docker-compose.dev.yml up -d
bun run start:dev        # http://localhost:4000/graphql
```

## What was built

| Brief | Delivered |
| --- | --- |
| Initialize NestJS | Fastify adapter, helmet, CORS allowlist, graceful shutdown, `AppModule` composition root |
| GraphQL | Apollo Server 5 code-first, `schema.gql` emitted and committed, custom scalars + the enum-scalar factory, depth limit, complexity budget, CSRF prevention |
| Prisma | `PrismaService` over the 169-model schema, three client extensions (soft delete, audit, optimistic locking), `TransactionManager` unit-of-work |
| Environment | Zod schema over 90 variables; boot fails on a missing or unsafe one |
| Logging | Pino JSON, redaction at the logger, `requestId` on every line, slow-operation warnings |
| Validation | `ZodValidationPipe` producing `issues[]` shaped for react-hook-form |
| Exception filters | one translation table → `DomainError` → GraphQL `extensions.code` or a REST body |
| Health checks | `/health/live`, `/health/ready`, `/health/deep` |
| Docker | root-context multi-stage image, dev / test / prod compose stacks, Postgres extension init |

Beyond the list, because the first module would otherwise have to invent them:
`RequestContext` (ALS: requestId, actor, locale, country, currency, timezone),
`IdService` (prefixed sortable ids preserving the Phase C `ven_*` / `usr_*`
vocabulary), offset **and** cursor pagination helpers, a per-request DataLoader
registry, a Redis cache with tag invalidation and a stampede lock, and the
`shared/kernel` primitives (`Entity`, `AggregateRoot`, `Result`, `Clock`,
`DomainEvent`).

## Five decisions that depart from the Phase D text

Each is a place the design document said one thing and the implementation does
another, for a reason.

**1. Soft delete refuses `delete` instead of rewriting it.** `main.prisma` §3
describes the extension as turning `delete` into an update. Rewriting an
operation inside a Prisma `query` extension is only possible by calling `update`
on a *captured* client — and that captured client is not the transaction client
when the delete happens inside `$transaction`. The "soft delete" would commit
outside the caller's transaction, which is a data-integrity bug hiding inside a
convenience. So `delete`/`deleteMany` throw on soft-deletable models, and
`softDelete()` / `restore()` run through `getExtensionContext`, which does stay
inside the active transaction. Same invariant, now impossible to get wrong; the
cost is that the hard delete is a loud error rather than quiet magic.

**2. The Docker build context is the repository root.** D10's Dockerfile ran
`bunx prisma generate --schema ../database/prisma/schema` from a `backend/`
context, which no build context permits — Docker cannot copy from above its
root. The image builds with `-f backend/Dockerfile .`, and `.dockerignore` at
the root keeps the layer small.

**3. Debian base images, not Alpine.** Prisma compiles its query engine per
libc, and `binaryTargets = ["native"]` resolves at *generate* time. Generating
on `oven/bun:1-alpine` produces a musl engine that cannot load in the glibc
`gcr.io/distroless/nodejs22-debian12` runtime, and the failure appears at first
query rather than at build. Both stages are bookworm.

**4. Secrets for unbuilt subsystems are required in production only.** D10 marks
`JWT_PRIVATE_KEY` and the S3 credentials as required. Enforcing that at every
boot would stop a developer starting E1 before E2 exists. `validateEnvironment`
grades requiredness by `NODE_ENV`: production refuses to start without them —
and refuses to start with the playground or introspection on — while development
may leave them blank. The list of production-only keys is explicit and
annotated with the phase that starts using each.

**5. An unreachable database does not stop the process.** `PrismaService`
retries, logs, and starts anyway with `/health/ready` reporting `down`. This is
the same reasoning that keeps `/health/live` dependency-free: if a two-second
Postgres failover killed every pod, the failover would become an outage. The
orchestrator withholds traffic instead of restarting.

Two smaller notes. Custom scalars are **not** registered in the driver's
`resolvers` map — that is SDL-first wiring, and in code-first an unreferenced
scalar there fails schema assembly outright; `graphql/scalars.registry.ts` is
the catalogue, and fields reference the instances. And `/health/*` carries its
own exception filter, because terminus signals "not ready" with a 503 whose body
*is* the report, which the global filter would correctly but unhelpfully
normalise into `errors.unexpected`.

## Verified

Run against the compiled build, with Redis up and Postgres deliberately down —
which is also the proof that degradation works.

| Check | Result |
| --- | --- |
| `bun run typecheck` | clean |
| `bun run lint` (incl. layer boundaries) | clean |
| `bun run build` | clean; the generated Prisma client and its engine land in `dist/` |
| `bun run schema:emit` | `schema.gql`, 49 lines, no database needed |
| `GET /health/live` | 200, no dependencies touched |
| `GET /health/ready` | 503 with the per-check report; Redis up, database and migrations down |
| `GET /health/deep` | 503; all three Redis connections up, storage reported separately |
| `query { apiStatus { … } }` | resolves through port → adapter; `status: "down"`, database `down`, redis-cache `up` at 1 ms |
| Unknown field | `BAD_USER_INPUT` + `requestId` |
| Depth limit (`GRAPHQL_MAX_DEPTH=1`) | refused: "nested 2 levels deep; the maximum is 1" |
| Complexity (anon budget 1, cost 2) | refused with `complexity` and `budget` in extensions |
| CSRF (`content-type: text/plain`) | blocked, HTTP 400 |
| `x-request-id` supplied by the caller | echoed back and used on every log line |
| Production boot with playground on | refused, listing all four problems |
| Prisma extensions | 13/13 behaviours asserted directly against the extension handlers |
| Failure detail | no host, port or Prisma text in a probe body |

The extension assertions cover: reads inject `deletedAt: null`; an explicit
`deletedAt` is an opt-out; `count` is filtered; append-only models are untouched;
`findUnique` on a tombstone reads as missing; hard delete refused where
`deletedAt` exists and allowed where it does not; `update` bumps `version`; an
explicit version wins; append-only models have no version; and `createdBy` /
`updatedBy` are stamped only when an actor is in scope.

## Not verified, and why

- **Nothing was run against a real PostgreSQL.** The machine has no Postgres and
  no Docker, so the extensions were asserted against their handlers rather than
  against rows, and no migration has ever been applied. `/health/ready` will
  report `migrations: down` until `bun run db:migrate` runs — that is the probe
  working, not a defect.
- **The Docker image was not built and the compose stacks were not started**
  (no Docker on this machine). The compose files parse; the Dockerfile's
  correctness rests on the two reasoning steps above about context and libc.
- **No tests were written.** Testing is E11. The 13 extension assertions were a
  throwaway harness, not a committed suite.

## What E2 inherits

`ConfigModule` already validates every auth variable and refuses a production
boot without signing keys. `@CurrentUser()` reads the actor from
`RequestContext`; `RequestContextService.setActor()` is what the guard calls.
`UnauthenticatedError` and `ForbiddenError` already map to the right
`extensions.code`. The complexity plugin already budgets anonymous callers
lower than authenticated ones.

E2 adds: `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`, the `@Public()`,
`@Roles()` and `@Permissions()` decorators — deliberately not shipped in E1,
since a decorator with no guard behind it reads as protection while providing
none — and the `auth` module itself.

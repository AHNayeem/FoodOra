# V1 Unit 0 — migrations, backend readiness, frontend GraphQL integration

Done 2026-08-03. Follows `V1-phase1-frontend-analysis.md`. Builds on E1–E3.

Unit 0 is the plumbing every later unit stands on: a database that can be created,
an API a browser can actually reach, and an Apollo client wired into the existing
service seam. **No mock API is replaced yet** beyond auth's own service functions,
and the app's default behaviour is byte-identical to before — every cutover is
behind a flag that starts off.

---

## 1. What changed

| Area     | File                                                            | Change                                                   |
| -------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| database | `prisma/migrations/20260803120000_v1_baseline/`                  | The whole datamodel, engine-generated                    |
| database | `prisma/migrations/20260803120100_v1_partial_unique_indexes/`    | Five partial unique indexes Prisma cannot express        |
| database | `prisma/migrations/migration_lock.toml`, `package.json`, `README.md` | Provider lock, `migrate:baseline`/`migrate:status`, fixed seed pointer |
| backend  | `src/main.ts`                                                   | `x-csrf-token` added to the CORS allow-list              |
| backend  | `src/modules/auth/presentation/cookies.ts`                      | CSRF cookie served at `/` instead of `/auth`             |
| backend  | `scripts/verify-auth.ts`                                        | Two assertions locking the cookie paths in (151 → 153)   |
| frontend | `config/backend.ts`                                             | API origin + one cutover flag per unit                   |
| frontend | `lib/graphql/{client,session,result,cookies,auth.operations,index}.ts` | Apollo client, token lifecycle, error mapping, documents |
| frontend | `components/providers/graphql-provider.tsx`, `app/layout.tsx`   | Provider mounted above the app                           |
| frontend | `services/auth.ts`                                              | Real implementations behind `LIVE.auth`, mocks retained  |
| frontend | `stores/auth.ts`                                                | `signOut` now also revokes server-side                   |
| frontend | `messages/{en,bn,ar}.json`                                      | 20 server error keys, all three locales                  |
| frontend | `scripts/verify-operations.ts`, `package.json`                  | `verify:graphql` — documents validated against the SDL   |
| frontend | `.env.example`, `.gitignore`                                    | Documented configuration                                 |

**Not touched:** every component, every route, every page, every type in `types/`.
`services/auth.ts` keeps all eight of its exported signatures; `stores/auth.ts`
keeps all five of its actions. `signIn(user: User)` still takes a user and returns
void, which is why the twelve call sites needed no edits.

---

## 2. Database

### One baseline, not a V1 subset

The brief asks Phase 2 for "only the tables required for this flow". The baseline is
all 169 tables, and that is a deliberate deviation.

Prisma derives migrations from the whole datamodel. A hand-carved subset is drift the
moment anyone runs a migration command — the engine immediately wants to add the
other 120 tables back, and every subsequent diff is computed against a schema that
does not match the database. Empty tables cost nothing at demo scale. The V1 scope
boundary is enforced by which modules and resolvers exist, which is where a scope
boundary belongs; the database's job is to match its own schema.

`prisma validate` passes. The baseline was produced offline with
`prisma migrate diff --from-empty --to-schema-datamodel`, reproducible via
`bun run migrate:baseline`. It creates the four declared extensions, 104 enums, 333
indexes and 224 foreign keys.

### The five partial unique indexes

Postgres treats NULLs as distinct, so `UNIQUE (a, b)` does not constrain rows where
`b IS NULL` at all. Ten of this schema's composite unique keys include a nullable
column; in five of them the null carries meaning — "platform-wide", "guest", "the
platform's own account" — and the null case is exactly the one that must be unique.

`identity.prisma` already specified two of them in prose. Its prose spells the
columns in snake_case; **this schema does not `@map` field names, so the real columns
are camelCase** and the SQL as written would not have run. Every identifier in the
hand-written migration was checked against the generated DDL.

| Index                               | Without it                                                       |
| ----------------------------------- | ---------------------------------------------------------------- |
| `user_role_assignments_platform_uq` | One account holds the same platform-wide role twice; revoking it once leaves a duplicate still granting everything it carries |
| `user_permissions_platform_uq`      | A duplicated grant and a duplicated denial make "does this account have it" depend on read order |
| `settings_platform_uq`              | Two platform rows for one key; the platform layer is the fallback every other layer resolves to |
| `carts_guest_vendor_uq`             | A guest accumulates unlimited carts per vendor                    |
| `ledger_accounts_platform_uq`       | Two platform cash accounts in one currency, each holding half the balance and neither wrong |

The five left alone are documented in the migration with the reason: an optional SKU,
a review without an order, and a payment intent not yet sent to a provider are all
cases where the null genuinely is not an identity. `RatingAggregate`'s all-time row
is a real gap, deferred to the reviews module rather than pre-empted here.

### `migrate deploy`, not `migrate dev`

Prisma cannot see partial indexes, so `migrate dev` reports them as drift and offers
to reset the database. The workflow is `migrate:deploy` to apply and `migrate:status`
to check; `database/README.md` documents how to author the next migration. This is a
known Prisma limitation, not a defect in the migration.

### The seed pointer was dangling

`package.json#prisma.seed` pointed at `prisma/seed/index.ts`, which does not exist —
`prisma db seed` has never been able to run. It now delegates to the backend's
`seed:reference`, which needs the Nest container and therefore lives there. The demo
seeder arrives with Unit 9.

---

## 3. Two defects that blocked the browser entirely

Both were found by working backwards from "what does the browser actually send".
Neither is visible from the server side, and neither would have shown up in any
existing test.

**`x-csrf-token` was not in the CORS allow-list.** `/auth/refresh` requires the
header; the preflight rejected it. The one request the refresh cookie exists for was
the one request a browser could not make.

**The CSRF cookie was scoped to `/auth`.** `document.cookie` only exposes cookies
whose path is a prefix of the current page's path, so a token scoped to `/auth` is
invisible to a page at `/login` — the credential the client is *supposed* to read was
unreadable. It now goes out at `Path=/`. Widening it costs nothing: path is not what
protects that cookie, which is deliberately script-readable, and the asymmetry the
defence rests on is that a cross-origin page cannot read any of our cookies. The
refresh token keeps its narrow path, which is where the security property lives.

Two assertions in `verify:auth` now cover both cookie paths, including that sign-out
clears the CSRF cookie on its own path — a cookie cleared on the wrong path is not
cleared.

---

## 4. Frontend

### Apollo owns server state; Zustand owns UI state

Per decision 8. `InMemoryCache` becomes the single copy of anything the server sent,
and the stores stop holding duplicates of it as each unit lands. The alternative —
Zustand caching what Apollo already cached — is two caches that disagree.

Client-side only, and that is a real constraint worth recording: a client created at
module scope and used from a Server Component would be shared across requests and
leak one user's cache into another's response. When a Server Component needs data,
that is `@apollo/client-integration-nextjs`, not this instance.

Apollo Client **4.2.9**, whose API differs from v3 in ways that matter here: React
bindings live at `@apollo/client/react`, `setContext` is now `SetContextLink` with
reversed arguments, `onError` is now `ErrorLink`, `rxjs` is a peer dependency, and
`ApolloClient` requires both `link` and `cache` (there is no `uri` shortcut). An
untyped `DocumentNode` types `data` as `{}`, so every document is declared as a
`TypedDocumentNode<Data, Variables>`.

### Tokens

Three links, in order: retry-on-`UNAUTHENTICATED` → attach bearer → HTTP.

The access token lives in a module variable in `lib/graphql/session.ts`, never in
`localStorage`: it is short-lived, and a persisted copy is a copy an XSS can read.
The refresh token is an `httpOnly` cookie the client never sees.

Renewal is **proactive** — 60s before expiry, single-flight, so a screen firing six
queries causes one refresh. The `UNAUTHENTICATED` retry is the backstop for clock
skew, and it fires exactly once: if a fresh token is also rejected the session is
genuinely gone and retrying would spin against a 401.

A page reload therefore starts with a persisted `user` and no token.
`GraphqlProvider` spends the refresh cookie once on mount and installs the account as
the *server* currently describes it — which is how a role change or a suspension
reaches a tab that has been open since before it happened.

A restore that finds no cookie is silent, not a sign-out: the auth store rehydrates
from `localStorage` on its own schedule (`skipHydration`), and signing out on "no
cookie yet" would race it. Only an explicit refusal clears the session, and
`reportSessionLost` is its only source.

### Errors

The API distinguishes an expected refusal (data at HTTP 200 in a `MutationPayload`
whose `error.key` is an i18n key) from an exception (a GraphQL error with a
closed-set `extensions.code`). `lib/graphql/result.ts` folds both into the
`Result<T>` that every service has returned since Phase C, which is what lets a
service body become a two-line map with no component changes.

Keys pass through a **whitelist**. The API's vocabulary is larger than any screen's,
and rendering `errors.statusUnchanged` raw is worse than "something went wrong".
Anything outside the set degrades to `errors.generic` and, in development, says so in
the console — so the next unit finds out it needs a translation instead of shipping
without one. Twenty keys were added to all three locales; `en`, `bn` and `ar` are at
31 each with no gaps.

### Everything is behind a flag

`config/backend.ts` holds one flag per unit, all default-off, so a half-migrated app
is a working app. With no `.env.local` at all the app behaves exactly as the Phase C
prototype did and never touches the network. The file is deleted at the end of V1.

---

## 5. Verified

| Check                                       | Result                                    |
| ------------------------------------------- | ----------------------------------------- |
| `database: prisma validate`                 | passes                                    |
| baseline SQL generated offline              | 169 tables · 104 enums · 333 indexes · 224 FKs |
| partial-index identifiers vs generated DDL  | all 5 tables and 12 column references resolve |
| `backend: typecheck`                        | clean                                     |
| `backend: verify:auth`                      | **153** assertions, 0 failed              |
| `backend: verify:core`                      | 169 assertions, 0 failed                  |
| `backend: schema:check`                     | `schema.gql` unchanged — no schema drift  |
| `frontend: typecheck` / `lint`              | clean                                     |
| `frontend: build`                           | compiled successfully, no warnings        |
| `frontend: verify:graphql`                  | 7 operations validated against the SDL    |
| CORS preflight, `/auth/refresh` + `/graphql`| 204, `x-csrf-token` allowed, credentials on |
| `login` document against the running API    | reached the resolver — schema-valid, failed only on the absent database |
| dev server, flag off                        | `/`, `/login`, `/register`, `/checkout`, `/dashboard`, `/delivery`, `/admin` all 200; sign-in form and demo credentials render |

`verify:graphql` was negative-tested: a one-character typo in a field name failed
three operations and exited non-zero.

## Not verified

**No PostgreSQL and no Redis exist on this machine, and Docker is not installed.**
So:

- the migration has never been applied. `prisma validate` passes and the baseline is
  engine-generated, but "it applies cleanly" is a claim. The first `migrate:deploy`
  is the test;
- `seed-reference.ts` has still never run;
- no sign-in has ever completed. What is proven is the transport: CORS, the selection
  sets, the payload shape and the error mapping. What is not proven is that a real
  credential produces a real session;
- the refresh cookie round trip is untested end to end. Its two failure modes were
  found by reading the spec against the browser's rules, not by observing them.

**Before flipping `NEXT_PUBLIC_BACKEND_AUTH=1`, someone must stand up Postgres and
run `migrate:deploy` then `seed`.** Sign-in cannot work otherwise:
`User.countryCode` is a non-null FK to `countries`.

---

## 6. Known gaps, deliberately left

**Social sign-in has no backend mutation.** E2 shipped password and OTP. With the
flag on, `socialLogin` refuses rather than signing a mock user in — which would give
a signed-in header over an app whose every query is unauthenticated. Either add the
mutation or take the buttons off the sign-in screen; refusing is the honest interim.

**Demo accounts still come from `lib/mock/users.ts`.** Correct either way, because
the Unit 9 seed reproduces exactly those accounts and that password. It becomes a
server query when the seed exists.

**No device is reported on sign-in.** `DeviceInput` is optional and the security
screen degrades gracefully without it. Inventing a persisted install id is a
separate decision.

**No `graphql-ws`, no subscriptions, no BullMQ.** Unit 8 owns realtime, and
`graphql.module.ts` still has no `subscriptions` block.

**`package.json#prisma` is deprecated** and goes away in Prisma 7. A `prisma.config.ts`
stops Prisma auto-loading `.env`, so the move needs explicit env loading and a
re-test of every command — worth doing with the Prisma 7 upgrade, not before it.

**`schema:emit` and `nest start` disagree, and `schema:check` fails after any
`start:dev`.** Found while verifying this unit. `nest-cli.json` enables the
`@nestjs/graphql` plugin with `introspectComments: true`, which turns TSDoc above a
decorated class into a GraphQL description. The plugin is a Nest CLI transformer, so
it applies under `nest start` and `nest build` but **not** under
`bun run scripts/emit-schema.ts`, which executes TypeScript directly. Starting the
dev server therefore rewrites `schema.gql` with descriptions the emit script does not
produce, and the next `schema:check` reports drift that is not drift. Production is
built by `nest build`, so **the deployed server serves descriptions the committed SDL
does not have** — the contract artifact understates the real schema.

Not fixed here, because the options trade off against each other and the choice is
not Unit 0's to make: turn `introspectComments` off (the two paths agree, the
descriptions are lost), run the emit through the CLI (`nest build` then run the
compiled script — slower, another artifact), or make `schema:check` compare structure
and ignore descriptions (the guard stops noticing description changes). Nothing is
broken meanwhile: descriptions do not affect validity, so `verify:graphql` is sound.
The workaround is to re-run `bun run schema:emit` after `start:dev`. `schema.gql` was
left byte-identical to how this unit found it.

**No GraphQL codegen.** Seven hand-written `TypedDocumentNode` declarations are
cheaper than a codegen pipeline. `verify:graphql` catches the drift codegen would
have caught. Past a screenful of operations, `@graphql-codegen/client-preset` reading
`backend/schema.gql` is the answer.

---

## 7. Next: Unit 1

Unit 1 is the first mock replacement proper — catalog reads (`vendors`, `vendorMenu`)
behind a `LIVE.catalog` flag, plus the restaurant/branch/menu/food seed they need.
It needs a live database first, so Unit 0's unverified items become Unit 1's first
task.

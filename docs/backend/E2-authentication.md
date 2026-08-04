# E2 — Authentication

Real tokens, real hashes, real rotation. `frontend/services/auth.ts` keeps every
signature it has: `Promise<Result<User>>`, with `error` as an i18n key. Nothing in
`frontend/` changed — see [Cutover](#what-the-cutover-still-needs).

```bash
cd backend && bun install && bun run db:generate
bun run start:dev          # http://localhost:4000/graphql
bun run verify:auth        # 151 assertions, no database needed
```

## What was built

| Brief | Delivered |
| --- | --- |
| JWT | RS256 access tokens, 15 min, `kid` rotation with the outgoing key honoured, `/.well-known/jwks.json` |
| Refresh Token | Opaque 256-bit, SHA-256 at rest, rotating chain with `parentId`, reuse ⇒ the whole session dies |
| OTP | 6 digits, SHA-256 + server pepper, 5 min, 5 attempts, single-use, three-way rate limit |
| RBAC | `@Roles()` + `RolesGuard`, resolved per request, never read from the token |
| PBAC | Direct grants and denials over role grants, denial always wins, `@Permissions()` + `PermissionsGuard` |
| Google / Apple / Facebook | **Not built** — the brief says "implement later". See [Not built](#not-built-and-why). |

Beyond the list, because the first protected resolver would otherwise have to invent
them: `@Public()`, `@FreshSession()`, `@RateLimit()`, `@VendorScope()`, a Redis
sliding-window limiter, the `MutationPayload` / `UserError` payload types every later
module returns, a DMMF-driven enum codec for the kebab-case ↔ `SCREAMING_CASE` boundary,
session and device management, password change and reset, and the `UNIT_OF_WORK`
contract that lets an application handler declare a transaction without importing
`infrastructure/`.

## The shape of it

```
common/decorators + common/guards          the declarative half, framework-aware, module-free
        │  depends on tokens, not modules
        ▼
shared/contracts   TOKEN_VERIFIER · AUTHORIZATION_STATE · RATE_LIMITER · UNIT_OF_WORK
        ▲
        │  satisfied by
modules/auth       sign-in, tokens, OTP, passwords, sessions
modules/rbac       permission resolution (E3 adds the administrative write side)
```

Guards live in `common/` because every module needs `@UseGuards(JwtAuthGuard)` and a
module may not import another module's `presentation/` — a rule ESLint enforces. So they
depend on contract tokens and `AuthModule` satisfies them. `common/` knows that access
tokens can be verified without knowing what verifies them.

The chain is registered **globally**, in `AuthModule`, in D6's order:

```
RateLimitGuard → JwtAuthGuard → RolesGuard → PermissionsGuard
```

D5's example lists the guards per mutation. Global inverts the failure mode: a resolver
that forgets a decorator is protected, and `@Public()` is the deliberate opt-out.
Forgetting something should lock a door, not leave one open. `VendorScopeGuard` stays
opt-in, since only a handler knows where its vendor id is.

## Ten decisions that depart from the Phase D text

Each is a place D5 or D6 said one thing and the implementation does another.

**1. `refreshToken` is `POST /auth/refresh`, not a GraphQL mutation.** D5 §Mutations
lists it in the schema. D6 §Cookies scopes the refresh cookie to `Path=/auth` — which
means the browser never sends it to `/graphql`, so a `refreshToken` mutation could not
read the credential it needs. The two designs are incompatible and D6's is the one worth
keeping: with no cookie on `/graphql`, that endpoint is not cookie-authenticated and
therefore not CSRF-able, and only two routes need a double-submit token. `logout` exists
in both places on purpose — the mutation is what a signed-in client calls,
`POST /auth/logout` is for the case it cannot serve, an access token that has already
expired.

**2. Authorization is resolved per request, not read from the token.** D6 puts `role` and
`permHash` in the claims. They are still there, and nothing is authorized from them: the
guard resolves the permission set through `AUTHORIZATION_STATE` on every request, from a
5-minute Redis entry. The consequence is the one that matters — revoking a role takes
effect on the next call rather than on the next token — and a stale `permHash` inside a
token can never grant anything. It survives as telemetry: a log line can show that a
token's view of a permission set has drifted from the server's.

**3. The epoch means "every token before now is void", and nothing else.** D6 says the
epoch is bumped by *any* role or permission change. Two problems appeared when that met
the schema. `tokenEpoch` lives on `Credential`, and an account created through phone OTP
has no `Credential` row — so for those users there would be nothing to bump. And
overloading it would sign a user out of an app they were using because somebody granted
them one more permission. So the epoch moves only for a password change, a reset, or a
forced sign-out; role edits delete `perm:<userId>` instead. Given (2), the change is
still live on the very next request.

**4. The permission cache key has no epoch in it.** D6 uses `perm:<userId>:<epoch>` so
invalidation is a counter write. With the epoch no longer moving on role changes that
would not invalidate anything, and `SCAN`-by-pattern is the operation that quietly gets
expensive on a busy instance. One key, one explicit `DEL`.

**5. `primaryRole` is always in the resolved role set.** D6 derives roles purely from
`UserRoleAssignment`. In practice the column and the table can disagree — a seed writes
one, an admin edits the other — and when they do, the frontend's `User.role` (which reads
the column) would show a role the guard does not honour. Trusting the column means the two
cannot contradict each other in the direction that locks a user out of their own app.
It also means an account can be created before the role catalogue is seeded: registration
logs a warning and skips the assignment row rather than failing on the foreign key.

**6. `super-admin` holds a `*` wildcard, resolved in the pure function.** Not in D6.
Without it an unseeded platform has nobody who can seed it, and the alternative —
granting an admin all fourteen roles — makes the assignment table lie about who is what.
Resolved in `resolveAuthorization` rather than special-cased per guard, so "may they?"
has one answer instead of one per call site.

**7. A completed rotation is replayable for ten seconds.** D6 §Rotation says a concurrent
refresh "waits and receives the winner's token", serialised by a Redis lock. A lock alone
cannot do that: the loser wakes up, re-reads a token that is now `usedAt`, and is treated
as a thief — signing out a user for having two tabs open. So the winner's result is
cached against the hash of the token it spent, and a presentation inside the window gets
it back with a freshly minted access token. Outside the window, reuse detection stays
ruthless. `REFRESH_REPLAY_WINDOW_MS=0` disables it.

**8. A public operation degrades to anonymous when authorization cannot be resolved.**
Not in D6, and found by testing: with Postgres down, `apiStatus` — the query whose entire
job is to report that Postgres is down — failed with `SERVICE_UNAVAILABLE` for every
signed-in caller, because the guard tried to resolve their permissions. On a public
operation the actor is an enhancement, so an infrastructural failure now yields anonymous.
On a protected one the same failure propagates: "we could not determine your permissions"
must never resolve to "carry on". A *malformed* token is still refused either way — that
check is local, and quietly downgrading it would hide an expired session behind a page
that renders as though nobody was signed in.

**9. Per-destination rate limits live in the services, not in a guard.** D6's table mixes
per-IP limits with per-account, per-destination and per-session ones. A guard runs before
the arguments are parsed and only ever knows the IP, so the limits that key on an email or
a phone number are applied in `AuthenticationService` / `OtpService` /
`PasswordService`, where the value is known. `RateLimitGuard` keeps the coarse per-IP
request budget — and picks its budget from the mere *presence* of an `Authorization`
header, since it runs before verification. Someone sending a garbage bearer gets 300/min
instead of 60/min from one IP: bounded, and the requests it buys die at signature
verification for a fraction of a millisecond and no I/O.

**10. Passwordless accounts get a sentinel hash, not a nullable column.** `Credential`
answers "what is this account's token epoch?" as well as "what is its password hash?",
and the epoch has to be storable for an account that has neither. `passwordHash = '!'` is
deliberately not a valid Argon2 encoding, `Argon2Hasher.verify` refuses anything that does
not start with `$argon2`, and `findCredential` reports it as no credential at all.
(Django's `!` prefix, for the same reason.)

## Three defects found in E1, and fixed

Building on E1 surfaced three things that were invisible until a request actually touched
a dependency.

**An unreachable database read as a bug.** `error-translator.ts` duck-typed Prisma errors
on `code`, but `PrismaClientInitializationError` puts its code on `errorCode` — and
leaves it `undefined` for a plain connection refusal. So "can't reach database server"
became `INTERNAL_SERVER_ERROR` with a stack trace instead of a retryable
`SERVICE_UNAVAILABLE`. Now matched on the error class, which is the only signal actually
present.

**A cache miss was slow, not fast.** `CacheService` promised that "a cache read that
fails is a cache miss, never a request failure", and kept it only for a *fast* failure.
With Redis unreachable, ioredis spends its whole retry budget — about 17 seconds — before
rejecting, so the call did not fail, it hung. E2 put three Redis lookups on the
authenticated path (rate-limit window, token epoch, permission set), which turned a Redis
outage into an API outage: the `login` mutation exceeded the 30-second request timeout.
Every Redis call now races a 150 ms deadline (`infrastructure/redis/deadline.ts`). The same
mutation, both dependencies still down: **30 s+ → 0.54 s**.

**`/health/*` and `apiStatus` were unauthenticated by accident, not by declaration.**
Global guards made that a 401 for a Kubernetes probe — which restarts every pod in the
fleet. Both now carry `@Public()`, so "anyone may read this" is a statement in the code.

## Verified

`bun run verify:auth` — 151 assertions, in-memory fakes behind the real ports, no
database. What that buys is the point of ports and adapters: reuse detection is a
decision about orderings, and it can be exercised without Postgres precisely because it
never mentions Postgres.

> **148 at the time of writing.** E3 found that `verifyAccessToken` measured expiry against
> the *system* clock while `signAccessToken` used the injected one, so this harness passed
> only during the fifteen real-world minutes following its fixed `FakeClock` instant. Fixed
> with `currentDate` on the verify call, plus three assertions that keep it fixed — see
> [E3 §One defect found in E2](./E3-core-modules.md#one-defect-found-in-e2-and-fixed).

| Area | Asserted |
| --- | --- |
| Argon2id | correct encoding and cost parameters, verify/refuse, corrupt hash is a miss not a crash, sentinel refused, rehash detection at weaker parameters, **and a miss costs the same as a hit within 2×** |
| RS256 | claim round-trip, TTL against the *injected* clock, `kid`, tampered payload refused, missing signature refused, **HS256 alg-confusion forgery refused**, JWKS is RSA/sig/RS256 with no private exponent |
| Secrets | 400 codes all exactly six digits and padded, sha256 stability, the pepper changes the hash, constant-time compare across equal / different / different-length |
| Rotation | chain built with `parentId`, only the SHA-256 stored, 7-day vs 30-day family, lifetime does **not** extend on rotation, spent token marked used |
| Reuse | replay inside the window returns the winner's token and a valid access token; outside it revokes the session as `rotation-reuse`, revokes every token in the chain, marks it in Redis, writes an audit row — **and leaves the user's other session alone** |
| Sign-in | correct password signs in with resolved permissions; unknown account and wrong password give the *same* key; both attempts logged; five failures lock; a correct password is refused while locked and carries a countdown; the lock expires on its own; a weak hash is upgraded **without** bumping the epoch; banned refused; passwordless refused as bad credentials with the real reason recorded for support |
| Registration | taken email refused on `input.email`; a new account is `pending` with the requested self-service role and the request's region; `super-admin` throws |
| Lockout ladder | 4→none, 5→1 min, 8→15 min, 12→1 h, and flat beyond |
| OTP policy | live/consumed/expired/exhausted verdicts with reasons, resend cooldown both sides, phone and email normalisation |
| Authorization | `primaryRole` present with no assignment row, role permissions unioned, scope collected, **denial beats a grant**, expired assignment grants nothing, wildcard satisfies anything, `grantsAll` is all-not-any, fingerprint ignores ordering and separates on boundaries |
| Enum codec | round-trips all fourteen roles, unknown value throws, and vocabulary drift fails the boot check |
| Cookies | `HttpOnly`, `Path=/auth`, `SameSite=Lax`, CSRF cookie readable, both in one header value, no `Domain` on localhost, clearing uses `Max-Age=0`, and `readCookie` decodes |

Live, against the compiled build with Postgres and Redis deliberately down — which is
also the proof that degradation works:

| Check | Result |
| --- | --- |
| `bun run typecheck` / `lint` (incl. layer boundaries) / `build` | clean |
| `bun run schema:emit` | 294 lines, no database needed |
| `{ apiStatus }`, no token | 200 — public |
| `{ me }`, no token | `UNAUTHENTICATED` |
| `{ me }`, malformed token | `UNAUTHENTICATED` |
| `{ me }`, **expired** token | `UNAUTHENTICATED` |
| `{ me }`, token for another audience | `UNAUTHENTICATED` |
| `{ me }`, **valid** token | `SERVICE_UNAVAILABLE` — signature accepted, then the database |
| `{ apiStatus }`, valid token, database down | 200, anonymous — decision 8 |
| `{ apiStatus }`, malformed token | `UNAUTHENTICATED` |
| `GET /.well-known/jwks.json` | 200, one key, `kid=k1`, modulus byte-identical to `openssl rsa -pubout` |
| `POST /auth/refresh`, no cookie | 401, cookies cleared |
| `POST /auth/refresh`, cookie but no CSRF header | 401 |
| `POST /auth/refresh`, matching CSRF, database down | 503 `dependency: database` |
| `POST /auth/logout`, no cookie | 204 with both cookies cleared — idempotent |
| `login` with Redis and Postgres down | 0.54 s, `SERVICE_UNAVAILABLE` |
| Rate limiter with Redis down | fails open, one warning per call |

## Not verified, and why

- **Nothing ran against a real PostgreSQL or Redis.** This machine has neither and no
  Docker. The repositories' SQL is therefore unexercised — specifically the conditional
  `updateMany` predicates (`WHERE used_at IS NULL`, `WHERE consumed_at IS NULL`) that make
  single-use atomic under real concurrency. The fakes assert the *ordering* those
  predicates exist to guarantee; only Postgres can assert the predicates. E11 owns that.
- **The sliding window itself.** `RateLimiterService`'s sorted-set arithmetic needs Redis.
  What was verified is that it fails open when Redis is gone.
- **`Country` must be seeded before `register` works.** `User.countryCode` is a foreign
  key to `Country`, which E3/E12 seed. Until then registration fails on the constraint —
  translated to `BAD_USER_INPUT` / `errors.invalidReference`, which is the constraint
  working, not a defect.
- **No tests were written.** Testing is E11; `verify-auth.ts` is a script with assertions,
  in the shape of E1's extension harness.

## Not built, and why

**Social sign-in.** The brief marks Google, Apple and Facebook "implement later", and they
are genuinely absent rather than stubbed. `SocialIdentity` is in the schema and D6 has the
linking rules; the part with teeth is that an *unverified* email must never be allowed to
claim an existing account, and that wants writing alongside a real provider handshake
rather than against a placeholder.

**Two-factor.** `UserSettings.twoFactor` and `OtpPurpose.two-factor` exist. The
`mfa_pending` intermediate token does not — deliberately not an access token with reduced
scope, because a half-authenticated access token inevitably gets accepted somewhere it
should not be. Building a second token type before anything can enrol would be building
the risky half first.

**Delivery OTP.** The handoff code on `Order.otpHash` is not an authentication factor and
is deliberately unreachable from this module: `OTP_PURPOSES` excludes `delivery` even
though the Postgres enum has it, so a proof-of-delivery code can never be presented to
`verifyOtp`. It lands with E9.

**`loginAlerts` and the reuse notification.** Both need a transport (E8). A first sign-in
from an unseen device and a detected token reuse each produce a structured log line and,
for reuse, an audit row — which is what E2 can honestly provide.

## What the cutover still needs

`frontend/` is untouched: with no seeded accounts there is nothing to sign in to, and
flipping the seam would be unverifiable code. Three things are needed to flip
`services/auth.ts` to `NEXT_PUBLIC_API_MODE=graphql`:

1. **Seeds** (E12) for `Country`, `Currency`, the `Role`/`Permission` catalogue, and the
   Phase C demo accounts with their `usr_*` ids — the ids the prototype's deep links and
   screenshots already contain.
2. **A GraphQL client** holding the access token in memory, refreshing through
   `POST /auth/refresh` with `credentials: 'include'` and the `x-csrf-token` header, and
   retrying once on `UNAUTHENTICATED`.
3. **i18n keys.** Phase C ships `errors.invalidCredentials`, `errors.emailTaken` and
   `errors.invalidOtp`; `settings` ships `errors.wrongPassword` and `errors.samePassword`.
   These are new, in the `auth` namespace, in en/bn/ar: `phoneTaken`, `accountLocked`
   (ICU `{unlockInSeconds}`), `accountSuspended`, `accountNotFound`, `otpExpired`,
   `otpAttemptsExhausted`, `otpTooSoon` (`{retryAfterSeconds}`), `otpNotRequested`,
   `noPassword`, `resetTokenInvalid`, `sessionNotFound`, `refreshInvalid`, `refreshReuse`,
   `phoneMissing`. Every one is listed with its meaning in
   `modules/auth/domain/auth-errors.ts`.

## What E3 inherits

`RbacModule` is where roles and permissions already resolve; E3 adds the write side —
create a role, assign it, the permission matrix — next to the resolver that has to stay
consistent with it, and calls `PermissionResolutionPort.invalidate(userId)` on every
change. `@Roles()` and `@Permissions()` are enforced, so a new admin resolver is protected
by declaring what it needs. The `MutationPayload` interface, `payloadOf()` and
`toPayload()` are what its mutations return. `enumCodec` and `assertVocabularyMatches` are
how its vocabularies cross the Prisma boundary.

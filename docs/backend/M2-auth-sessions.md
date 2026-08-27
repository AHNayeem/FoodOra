# M2 — Authentication & Sessions

**Built 2026-08-27.** Module 2 of the thirty-two in
[BACKEND-REQUIREMENTS §3](../FOODORA-BACKEND-REQUIREMENTS.md#3-module-build-order),
on top of the foundation in [F1](./F1-fastify-foundation.md). Where an older `D*`
or `E*` document in this directory disagrees, it is describing the removed NestJS
backend and this wins.

**Scope: authentication, and deliberately not authorization.** Every access token
this module mints carries `permissions: []`, and `/auth/me` returns
`permissions: []`. Resolving *role grants ∪ direct grants − denials* is module 3's
entire job. What is here answers only "who is this?" — see [§11](#11-what-is-not-here).

---

## 1. What was audited first

The behaviour below is not invented. It was read off three sources, in this order:

| Source | What it settled |
| --- | --- |
| `frontend/services/auth.ts` | the seven operations that exist: login, register, requestOtp, verifyOtp, requestPasswordReset, restoreSession, signOutEverywhere |
| `frontend/lib/graphql/session.ts` + `cookies.ts` | the token model — access token in memory, refresh token as an `HttpOnly` cookie, `csrf` cookie echoed into `x-csrf-token`, `POST /auth/refresh` on page load |
| `database/prisma/schema/identity.prisma` | every table, and therefore every rule: Argon2id, `tokenEpoch`, rotation with reuse detection, `attempts`/`maxAttempts`, `failedCount`/`lockedUntil` |

**No schema change was needed.** The datamodel already carries `User`,
`Credential`, `Session`, `RefreshToken`, `Device`, `SocialIdentity`,
`OtpChallenge`, `PasswordReset`, `LoginAttempt`, `UserSettings` and the
`UserStatus` / `SessionRevokeReason` / `OtpPurpose` / `OtpChannel` enums. STEP 2
said to stop and report a gap rather than migrate around one; there is no gap to
report.

What the audit found that the frontend **does not** have, and which therefore was
not built: an email-verification flow (`emailVerifiedAt` exists, nothing sets it),
a two-factor step (`UserSettings.twoFactor` exists, nothing reads it), a device
list screen, and a reset-password *page* — `/forgot-password` requests a reset and
there is no screen to complete one. See [§11](#11-what-is-not-here).

---

## 2. Architecture

```
backend/src/modules/auth/
├── index.js          the plugin: cookies, wiring, requireUser, mount at /auth
├── routes.js         nine routes and their rate limits
├── controller.js     HTTP only — read request, call service, set cookies, envelope
├── service.js        the rules. Returns { payload } or { refusal }, never a status
├── repository.js     every Prisma statement, ids minted, enums translated
├── schemas.js        request and response JSON Schema
├── errors.js         the closed set of refusal keys
└── utils/
    ├── password.js   Argon2id, the dummy-verify path, the length policy
    ├── tokens.js     opaque tokens, SHA-256, OTP codes, constant-time compare
    ├── cookies.js    the two cookies and the CSRF double-submit
    └── normalize.js  email lower-casing, phone → E.164
```

One `fastify.register(authModule)` line in `routes/v1/index.js`. It takes **no
`prefix`**: the module is `fastify-plugin`-wrapped so `requireUser` reaches the
modules that come after it, and `fp`'s `skip-override` is exactly the flag that
stops Fastify creating the child context a prefix attaches to. The module applies
its own `/auth` on the inner `authRoutes` registration, where it works.

### The service/controller split

`service.js` returns one of two shapes and never a status code:

```js
{ payload: … }            // 200 { success: true,  data: … }
{ refusal: "errors.…" }   // 200 { success: false, error: { key } }
```

and throws an `AppError` for the things that are not answers (no token, a dead
refresh chain, a missing CSRF header). That is F1 §5's contract, and it is the
reason a wrong password does not appear in the error log: **a refusal is data.**

---

## 3. Token and session lifecycle

### The access token

A JWT, HS256, 15 minutes (`JWT_ACCESS_TTL`), signed by the foundation's
`fastify.signAccessToken`. Exactly eight claims:

```json
{ "sub": "usr_01…", "sessionId": "ses_01…", "roles": ["customer"],
  "permissions": [], "epoch": 0, "tokenType": "access", "iat": …, "exp": … }
```

`roles` is kebab-case — `types/user.ts::UserRole`'s vocabulary, never a Prisma
identifier. `epoch` is `credentials.tokenEpoch`, which is what makes a password
change kill tokens that have not expired yet. Nothing else is in there: no email,
no name, no status, no permissions.

`accessTokenExpiresAt` in the payload is decoded back out of the signed token
rather than recomputed. The client renews 60 seconds before it
(`lib/graphql/session.ts`), so a value that disagreed with the token's own `exp`
would surface as intermittent 401s nobody can reproduce.

### The refresh token

**Opaque, not a JWT.** 256 bits of `randomBytes`, base64url, stored only as its
SHA-256 in `refresh_tokens.tokenHash` (`Char(64)`) — which is what the schema's
own comment asks for. Three consequences:

1. it cannot be verified without the row, so revocation actually revokes;
2. `jwtVerify` cannot parse it, so STEP 6's "a refresh token must not be accepted
   as a bearer access token" holds *by construction*. The foundation's `tokenType`
   guard stays anyway, and is still tested, because it is what would catch a later
   module reaching for `signRefreshToken`;
3. it is hashed with SHA-256 and not Argon2id. That is deliberate: 256 random bits
   have no structure to guess, so a slow hash defends against nothing and would
   put ~50 ms on the refresh every page load makes. The *password* is a human's
   choice, and it gets Argon2id.

Lifetime: `AUTH_SESSION_TTL_DAYS` (7), or `AUTH_SESSION_REMEMBER_TTL_DAYS` (30)
when `rememberMe` is set — `sessions.rememberMe`, exactly as the schema describes
it. A chain link never expires later than its session.

### Rotation and reuse detection

Every refresh spends one link and mints the next, with `parentId` pointing back:

```
rft_A ──used──▶ rft_B ──used──▶ rft_C (live)
```

Spending is `updateMany({ where: { id, usedAt: null }, data: { usedAt } })` and the
row count is checked. That single filter is the race guard: two requests carrying
the same token both arrive, exactly one matches, and the loser is treated as a
reuse.

**A reused link kills the whole session** — `revokeReason: rotation-reuse`, every
token on it revoked, 401. There is no way from here to tell a client racing itself
from a replayed stolen token, and the safe reading of that ambiguity is theft. The
client single-flights its refreshes (`session.ts::refresh`) precisely so the benign
case does not arise.

Every refresh failure is a **401**, never a 200 refusal, because `session.ts`
branches on `response.status === 401` to decide the session is gone. A 200 would
leave a signed-out browser wearing signed-in chrome.

### Session revocation

| Trigger | `sessions.revokeReason` |
| --- | --- |
| `POST /auth/logout` | `logout` |
| a replayed refresh token | `rotation-reuse` |
| a completed password reset | `password-change` |
| a refresh whose session had already lapsed | `expired` |
| a refresh by an account that has since been suspended | `admin` |

### Cookies

| Cookie | `HttpOnly` | `Path` | Why |
| --- | --- | --- | --- |
| `foodora_rt` | yes | `/api/v1/auth` | the refresh token; the path stops the browser attaching it to catalog or order requests |
| `csrf` | **no** | `/` | not a secret — the other half of a double-submit pair. The name and the `x-csrf-token` header are copied verbatim from `frontend/lib/graphql/cookies.ts` |

`Secure` follows `AUTH_COOKIE_SECURE`, which defaults to on in production only;
`SameSite` is `lax`. The cookie path is *derived* from `API_PREFIX` rather than
configured separately, because a path that disagreed with the mount would produce
a browser that never sends the cookie and an endpoint that always says "no
session" — the hardest possible way to find out two strings differ.

**CSRF is checked only when the token came from the cookie.** A client that posts
the token in the body has no ambient credential to forge, which is the whole
premise of CSRF. `SameSite=Lax` already blocks a cross-site POST on a current
browser; the double-submit is there for the deployment that has to relax it to
`none` across registrable domains, and it costs one comparison.

---

## 4. Endpoints

All under `/api/v1/auth`.

| Method | Path | Auth | Body | Success payload |
| --- | --- | --- | --- | --- |
| POST | `/register` | — | `{ name, email, phone?, password, role?, marketingOptIn?, rememberMe?, countryCode?, locale?, device? }` | `AuthSession` |
| POST | `/login` | — | `{ email, password, rememberMe?, device? }` | `AuthSession` |
| POST | `/otp/request` | — | `{ destination, channel?, purpose? }` | `{ destination, expiresAt, resendAfterSeconds }` |
| POST | `/otp/verify` | — | `{ destination, code, channel?, purpose?, rememberMe?, device? }` | `AuthSession`, or `{ destination, verified }` |
| POST | `/password/forgot` | — | `{ email }` | `{ email }` |
| POST | `/password/reset` | reset token | `{ token, password }` | `null` |
| POST | `/refresh` | refresh cookie + CSRF, or body token | `{ refreshToken? }` or none | `AuthSession` |
| POST | `/logout` | refresh cookie + CSRF, or bearer | `{ allDevices? }` or none | `{ revoked }` |
| GET | `/me` | bearer access token | — | `User` |

`AuthSession` is `lib/graphql/auth.operations.ts::AuthSessionData`, field for
field:

```json
{ "accessToken": "eyJ…", "accessTokenExpiresAt": "2026-08-27T09:15:00.000Z",
  "sessionId": "ses_01…", "user": { … } }
```

`user` is `types/user.ts::User` — fourteen fields, built by naming each one rather
than spreading the row, and filtered a second time by the response schema. A
`select` that widened by accident still could not leak `status`, `blockReason` or
a hash.

### Registration details

- `role` is a **closed enum of three** — `customer`, `restaurant-owner`,
  `delivery-rider` — matching `services/auth.ts::RegisterInput`. Self-registration
  must never be able to mint `super-admin`.
- The country comes from `AUTH_DEFAULT_COUNTRY` (or `countryCode`), and the
  currency, locale and timezone are read off that `countries` row rather than
  guessed.
- Four rows in one transaction: `users`, `credentials`, `user_settings`,
  `user_role_assignments`. The last is *data*, not authorization — module 3 reads
  that table, and leaving it out would mean module 3 opens by backfilling every
  account this module created.
- A new account is `isVerified: false`, matching Phase 17 (G43) on the frontend.

### OTP details

Purposes are accepted in both vocabularies: the client sends `verify-phone` and
`reset-password`, the schema stores `phone-verify` and `password-reset`, and both
spellings map to the same `OtpPurpose`. Channels are `sms` and `email`, which is
what `OtpChannel` has and what `lib/verification.ts::VerificationChannel` sends.

`login`, `register` and `phone-verify` end in a session; any other purpose returns
`{ destination, verified: true }` and no session. `services/verification.
confirmVerification` throws the session away, which is correct on its side and
free on ours.

An SMS code verifies the number it was sent to — `phoneVerifiedAt` and
`isVerified` are set on success.

---

## 5. `requireUser` — the guard for every later module

`plugins/auth.js::authenticate` is unchanged and still answers only *"is this a
valid, unexpired access token we issued?"*, from the claims, with no database
read. That is not enough to protect a route: the gap is the fifteen minutes a
token stays valid after the account behind it is suspended, deleted or signed out.

`fastify.requireUser` closes it, and reads three things back:

1. **the account** — it exists, is not soft-deleted, and its status is not
   `suspended` or `banned`;
2. **the session** — the `sessionId` claim names a row that is live and belongs to
   this account. This is what makes "sign out" and "sign out everywhere" take
   effect *now* rather than at the next expiry, and it is why STEP 6 says a session
   may not live only in memory. A token with no `sessionId` claim is refused;
3. **the credential epoch** — `credentials.tokenEpoch`, bumped by every password
   change, so a token minted before a reset is refused even though its signature
   and expiry are both fine.

It sets `request.account` (the row) alongside `request.user` (the claims). Two
indexed reads per request; that is the price of revocation being real.

> **Use `requireUser`.** `authenticate` remains for the rare route that wants only
> the claims, and for `optionalAuth`, whose whole point is not to fail. A route
> that guards with bare `authenticate` will let a suspended account through for up
> to fifteen minutes — that is a stated limitation of the primitive, not a bug in
> it.

---

## 6. Security decisions

| Concern | What was done |
| --- | --- |
| Password storage | Argon2id (`@node-rs/argon2`, prebuilt — no compiler in the install path), OWASP m=19456/t=2/p=1. Parameters live inside the PHC hash, so raising them re-hashes on next sign-in |
| Hash leakage | `Credential` is a separate table; every read model is built field by field; the response schema filters a second time. Asserted by a test that greps every body for `passwordHash`, `$argon2`, `tokenHash`, `codeHash`, `blockReason`, `tokenEpoch`, `primaryRole` and the plaintext |
| Account enumeration | Unknown account, soft-deleted account and wrong password all answer `errors.invalidCredentials`. `verifyOrDummy` hashes against a fixed decoy on the "no account" path so the **latency** matches too. `/password/forgot` and `/otp/request` always succeed |
| …where it is not preserved | `/register` says `errors.emailTaken`, and OTP verify says `errors.accountNotFound` **after** the caller has proved they hold the destination. Both are deliberate: a sign-up form that will not say the address is taken is unusable, and by verify time the oracle has already been paid for |
| Brute force | Two layers. `AUTH_RATE_MAX` (10/min per address) on the six credential routes, in-process and therefore per-instance; and the durable one — `credentials.failedCount` / `lockedUntil`, five failures then a 15-minute lock, which survives a restart and a second instance. No Redis |
| Token replay | Refresh rotation with reuse detection (§3). OTP codes are consumed atomically (`updateMany … consumedAt: null`). Reset tokens likewise |
| Wrong token type | An opaque refresh token cannot parse as a JWT; a refresh *JWT* is refused by the `tokenType` guard. Both are tested |
| Authentication bypass | `requireUser` re-reads account, session and epoch (§5) |
| Timing on OTP | `timingSafeEqual` on the digests, not `===` |
| CSRF | Double-submit on the two cookie-driven routes (§3) |
| Secrets in logs | The foundation's `loggerRedactions` already covers the authorization header. OTP codes and reset tokens are logged **only when `NODE_ENV !== production`**, and returned in the body only under `AUTH_ECHO_SECRETS`, which startup refuses in production |
| Audit trail | `login_attempts` gets a row for every attempt, including ones against accounts that do not exist — which is what makes the table answer "is somebody walking the user list". Written fire-and-forget so a failed log cannot 500 a correct sign-in |

### One foundation bug fixed on the way

`plugins/rate-limit.js` returned a response *body* from `errorResponseBuilder`.
`@fastify/rate-limit` **throws** that value (`throw params.errorResponseBuilder(…)`),
so a plain object reached the error handler with no `statusCode`, fell through
every branch of `normalizeError` and was answered **500**. The API said "internal
error" every time it rate-limited. It now returns an `AppError`, and
`npm run auth:flow` asserts the 429, its code and its i18n key.

---

## 7. Error contract

Unchanged from F1 §5. Refusals are HTTP 200 with an i18n key; exceptions are 4xx
with `{ code, key, message, details?, requestId }`.

Every key this module can emit is in `modules/auth/errors.js`, and each is already
in all three locale files under `auth.errors.*` **and** in `RENDERABLE` in
`lib/graphql/result.ts`. Nothing was invented, and no locale file needed a new
string.

| Situation | Key |
| --- | --- |
| wrong password, unknown account, deleted account | `errors.invalidCredentials` |
| account has no password (OTP- or social-created) | `errors.noPassword` |
| suspended **or** banned | `errors.accountSuspended` |
| locked by consecutive failures | `errors.accountLocked` |
| address / number already registered | `errors.emailTaken` / `errors.phoneTaken` |
| malformed address or number | `errors.emailInvalid` / `errors.phoneInvalid` |
| wrong, spent, expired, exhausted, unrequested, too-soon code | `errors.invalidOtp` / `errors.otpExpired` / `errors.otpAttemptsExhausted` / `errors.otpNotRequested` / `errors.otpTooSoon` |
| OTP proved, but no account holds the destination | `errors.accountNotFound` |
| unknown, spent or expired reset token | `errors.resetTokenInvalid` |
| reset to the password already in use | `errors.samePassword` |
| password below the minimum | `errors.passwordShort` |

`suspended` and `banned` share one key because there is no `errors.accountBanned`
in the locale files, and a key nothing can render is worse than one that is
slightly coarse. The distinction survives where it matters — `users.status`,
`users.blockReason`, `account_moderation_events`.

---

## 8. Account states

`UserStatus` has four members and all four are handled.

| State | Sign in? | Answer |
| --- | --- | --- |
| `active` | yes | — |
| `pending` | **yes** | — |
| `suspended` | no | `errors.accountSuspended` |
| `banned` | no | `errors.accountSuspended` |
| soft-deleted (`deletedAt`) | no | `errors.invalidCredentials` — indistinguishable from "no such account" |

`pending` is an *administrative* state, not "has not confirmed their email":
verification is tracked separately in `isVerified` / `emailVerifiedAt` /
`phoneVerifiedAt`, registration creates an account with `isVerified: false`, and
the frontend has no gate that would let somebody verify from a signed-out screen.
Refusing `pending` here would create accounts nobody could ever get into.

No status was invented. The soft-delete filter is the foundation's Prisma
extension doing its job — a deleted account is simply not found.

---

## 9. Configuration

Full list with defaults in `.env.example`. The ones with a decision behind them:

| Variable | Default | Note |
| --- | --- | --- |
| `AUTH_ARGON_MEMORY_KIB` / `_TIME_COST` / `_PARALLELISM` | `19456` / `2` / `1` | OWASP's lower-memory profile |
| `AUTH_PASSWORD_MIN_LENGTH` | `8` | matches `errors.passwordShort` in all three locales and the client-side zod schema. Length only — composition rules shrink the space people actually use |
| `AUTH_LOCKOUT_THRESHOLD` / `_MINUTES` | `5` / `15` | the durable brute-force defence |
| `AUTH_SESSION_TTL_DAYS` / `_REMEMBER_TTL_DAYS` | `7` / `30` | `JWT_REFRESH_TTL` governs only the unused `signRefreshToken` |
| `AUTH_OTP_TTL_SECONDS` / `_MAX_ATTEMPTS` / `_RESEND_SECONDS` | `300` / `5` / `60` | |
| `AUTH_RESET_TTL_MINUTES` | `30` | |
| `AUTH_ECHO_SECRETS` | `false` | returns the OTP code and reset token in the body. **Startup throws if it is on and `NODE_ENV=production`** |
| `AUTH_COOKIE_SECURE` / `_SAMESITE` / `_DOMAIN` | prod-only / `lax` / unset | the cookie *path* is derived from `API_PREFIX`, not configured |
| `AUTH_DEFAULT_COUNTRY` | `BD` | must be a seeded `countries` row; currency, locale and timezone are read from it |
| `AUTH_RATE_MAX` / `_WINDOW_MS` | `10` / `60000` | per address, on the six credential routes |

New runtime dependencies: `@node-rs/argon2` and `@fastify/cookie` (pinned to
`~11.0.2` — 11.1.x pulls `cookie@2`, which declares `node >= 22`, and this package
supports 20.11).

---

## 10. Testing

```bash
cd backend
npm run verify      # prisma validate → check:forbidden → tests → auth:flow
npm test            # 144 assertions, real PostgreSQL
npm run auth:flow   # 51 checks, real socket
```

### `tests/auth-sessions.test.js` — 70 cases

Registration (9), password sign-in (11), access tokens (10), refresh rotation
(11), logout (6), one-time codes (11), password reset (7), and "what must never
leave" (5). Every case drives the real routes through `app.inject()` against real
PostgreSQL with real Argon2id — there is no mocked repository, because the
properties worth testing are properties of *what is written*, and a fake would
only prove the fake agrees with itself.

Accounts carry a per-run email and phone prefix and are hard-deleted afterwards
through `$unfiltered()`; cascades take the credential, sessions, refresh chain,
device, settings and role assignment. `login_attempts` has no foreign key by
design — it records attempts against accounts that never existed — so it is
cleaned by identifier.

The suite runs with `RATE_LIMIT_ENABLED=false` (env's own default for tests, which
the committed `.env` was overriding) and `AUTH_ECHO_SECRETS=1`.

### `scripts/auth-flow.js` — 51 checks

STEP 15's full lifecycle, over a real socket with `fetch` and a cookie jar,
because three things only exist outside the injection path: the cookie
attributes a browser actually receives, the CSRF echo, and the rate limiter.

```
register → cookie attributes → login (wrong, then right) → /me → refresh
→ replay the spent token → session dies → login → logout → refresh refused
→ OTP request/resend/wrong/right → forgot (unknown + known) → reset → old
password dead → suspend → live token dies → 429 on repeated guesses
→ inspect what the database holds
```

It cleans up after itself and exits non-zero on any failure.

### Results, 2026-08-27

| Gate | Result |
| --- | --- |
| `prisma validate` | pass |
| `prisma migrate status` | up to date, 4 migrations, no drift |
| `npm run check:forbidden` | pass — 50 JS files, 14 dependencies, no TypeScript / NestJS / Redis / Docker / GraphQL |
| `npm test` | **144/144** (74 foundation + 70 module 2) |
| `npm run auth:flow` | **51/51** |
| `node src/server.js` | boots, `/health/ready` up, `/api/v1/auth/me` 401, SIGTERM shuts down cleanly |

---

## 11. What is not here

### Not built, because the frontend does not have it

- **Social sign-in.** `social_identities` exists and the sign-in screen has three
  buttons, but there is no provider configuration in this repo to verify a Google,
  Apple or Facebook token against. An endpoint would either trust the client's
  claim about who it is — an authentication bypass — or always fail.
  `services/auth.socialLogin` already refuses when the backend is live rather than
  pretending, which is the honest state.
- **Email verification.** `emailVerifiedAt` is never set. The OTP machinery can
  carry it (`channel: "email"`, `purpose: "verify-phone"`'s sibling) the day a
  screen asks for it.
- **Two-factor.** `UserSettings.twoFactor` exists and nothing reads it.
- **Device and session management screens.** The rows are written — every session
  records its device, IP, user agent and last-seen — but there is no endpoint to
  list or revoke them individually. `allDevices: true` on logout is the only
  bulk operation, because it is the only one the frontend calls.
- **A change-password endpoint for a signed-in user.** `settings.errors.wrongPassword`
  suggests the screen exists on the frontend; it is not wired to `services/auth`,
  so it was left for the module that owns account settings.

### Not built, by instruction

RBAC/PBAC. `permissions` is `[]` everywhere. Module 3.

### Frontend compatibility — read this before flipping the flag

`NEXT_PUBLIC_BACKEND_AUTH=1` currently makes `services/auth.ts` issue **Apollo
GraphQL mutations**. This backend is REST and GraphQL is forbidden, so **the flag
must stay `0`**: turning it on today points the app at mutations that do not
exist. That is `Analysis.md` A1–A4 and
[BACKEND-REQUIREMENTS §4](../FOODORA-BACKEND-REQUIREMENTS.md#4-frontend-contract),
which states it is an open **frontend** decision — keep `lib/graphql/` with a
vendored schema, or excise the layer and the `verify:graphql` gate together. It is
not a decision this module was asked to make, and no frontend file was touched.

What *was* done is make the change small and mechanical when it is taken. The API
already matches the client's contract everywhere it can:

| The client already expects | The API does |
| --- | --- |
| `AuthSession { accessToken, accessTokenExpiresAt, sessionId, user }` | returns exactly that |
| `User` with fourteen fields | returns exactly those |
| refusals as `{ success, error: { key, path? } }` at HTTP 200 | yes |
| every key in `RENDERABLE` | yes, no new keys |
| refresh token as an `HttpOnly` cookie, never in JS | yes |
| the `csrf` cookie and the `x-csrf-token` header | same names |
| 401 from refresh means "the session is gone" | yes |
| `POST …/refresh` with no body | yes |

The remaining delta is transport and one URL:

1. `config/backend.ts` — `AUTH_REST_URL` is `${API_URL}/auth`; the routes are at
   `${API_URL}/api/v1/auth`. One line.
2. `services/auth.ts` — the five Apollo mutations become `fetch` calls to
   `/register`, `/login`, `/otp/request`, `/otp/verify`, `/password/forgot`. The
   `Result<T>` signatures, the mock fallbacks, the forms, the toasts and
   `stores/auth.ts` are all unchanged, because `fromPayload` already unwraps the
   envelope this API sends.
3. `lib/graphql/session.ts` needs no change beyond the base URL.

Permissions will be `[]` until module 3, so every admin surface stays hidden. That
is correct, not a regression — an unresolved permission list must fail closed.

---

## 12. Next

**Module 3 — RBAC / PBAC.** It has what it needs: `roles`, `permissions` and
`role_permissions` are seeded (14 / 20 / 54), `user_role_assignments` is written
by registration, and `request.user` / `request.account` carry the identity to
resolve against. Its job is `permissions` = role grants ∪ direct grants − denials,
into the token claim and the `/auth/me` read model, plus `fastify.authorize` —
which already exists and already reads the claim the same way `lib/rbac.ts` does.

# E3 — Core Modules

Users, roles, permissions, countries, languages, currencies, settings. The
`config/regions.ts` and `config/i18n/config.ts` constants that have decided what
markets and languages exist since Phase C become rows an operator can edit, and
`services/account.ts` / `services/settings.ts` get real endpoints with their
signatures intact. Nothing in `frontend/` changed — see
[Cutover](#what-the-cutover-still-needs).

```bash
cd backend && bun install && bun run db:generate
bun run start:dev            # http://localhost:4000/graphql
bun run verify:core          # 169 assertions, no database needed
bun run seed:reference       # currencies, countries, languages, roles, permissions
```

## What was built

| Brief | Delivered |
| --- | --- |
| Users | Own profile + settings + account closure; admin directory with filter, closed sorts and paging; status changes; role changes; close and reopen |
| Roles | 14 ranked built-ins, custom roles, the permission matrix, assignment with vendor scope and expiry |
| Permissions | A **closed catalogue in code** (`shared/permissions.ts`), reconciled into the table; direct grants and denials per account |
| Countries | Admin-editable, with a currency, timezone, dial code and language set; opening a market is one transaction |
| Languages | Name, endonym and `direction` — the field `<html dir>` reads |
| Currencies | Symbol, format locale and fraction digits — what makes BDT render in Bengali numerals |
| Settings | A declared catalogue with defaults, resolved vendor → country → platform, public/operator split |

Beyond the list, because the modules needed them: the `SESSION_CONTROL` and
`SETTINGS_READER` contracts, `UserSort` as the first closed sort enum, and a
reference-data bootstrap that clears E2's one hard cutover blocker.

## The shape of it

```
shared/permissions.ts     the closed permission catalogue — code is authoritative
shared/contracts          SESSION_CONTROL (new) · SETTINGS_READER (new)
graphql/models/User       moved here from auth/presentation — three modules return it now
        │
        ▼
modules/regions   countries · languages · currencies      publishes REGION_CATALOG
modules/rbac      roles · permissions · assignments       publishes PERMISSION_RESOLUTION
modules/users     profile · settings · directory          consumes all three
modules/settings  platform configuration                  publishes SETTINGS_READER
```

Import direction, in one line: `users → {regions, rbac, auth}`,
`settings → regions`, `auth → {rbac, regions}`. No cycles, and every edge is a
token rather than a class.

## Nine decisions that depart from the Phase D text

**1. The permission catalogue lives in code, not in the database.**

D2 models `Permission` as an ordinary table. Treating it as the source of truth
makes three things impossible: `@Permissions('users:write')` cannot be checked by
the compiler, the admin matrix has no columns until somebody has granted
something, and a renamed slug fails silently — because a permission nobody holds
is a gate nobody passes, so the typo locks the handler for everyone except a
super-admin, in production only.

So `shared/permissions.ts` declares them, `PermissionSlug` is a literal union, and
`syncPermissionCatalogue` reconciles the table from code. What capabilities exist
is a fact about the software; who holds them is a fact about the business, and only
the second belongs in a table an operator edits.

Roles stay open — `Role.isSystem = false` rows are custom, exactly as D2 intends.
A custom role composes catalogue permissions and cannot invent one. That asymmetry
is the design: a new capability needs code behind it to mean anything at all.

**2. The sync never deletes.**

`RolePermission` and `UserPermission` both cascade on delete, so removing a
permission row because its slug left the catalogue would silently revoke somebody's
access as a side effect of a rename. Orphans come back from `permissions` with
`inCatalogue: false` — visibly granted, visibly enforcing nothing — and a human
decides.

**3. Rank, and the three rules that make role administration safe.**

D6 describes RBAC and PBAC but not who may grant what. Without an answer, "assign
role" is an escalation primitive: a moderator assigns themselves `super-admin`, and
the check that would have stopped them is the one they just acquired the power to
skip.

`domain/policies/escalation.policy.ts` is the answer, as pure functions:

- **rank** — you may only act on roles *strictly below* your own highest rank;
- **held permissions** — you may only grant what you hold, because a low-ranked
  custom role stuffed with permissions its author lacked would launder authority;
- **self** — nobody edits their own roles or permissions, including a super-admin,
  so the platform's last administrator cannot lock themselves out.

`setUserPrimaryRole` is bounded from *both* ends — the target's current rank and the
granted role's. Checking only the target would let a moderator promote a customer
to super-admin: the customer is rank 10, so the first check passes.

**4. A suspension ends sessions; a role change does not.**

Two operations, two different answers, and the difference is the point. Suspending
or banning goes through `SESSION_CONTROL`, which revokes the rows, marks them in
Redis **and bumps the token epoch** — without that last step a suspended account
keeps working for the rest of the 15-minute access-token window on every handler not
marked `@FreshSession()`, which is most of them by design.

A role change deliberately does not sign anybody out. A rider promoted to
vendor-manager mid-shift should keep working, and E2's decision to resolve
authorization server-side per request rather than read it from the token is what
makes the new role apply on their very next call. This is the phase where that
decision pays for itself.

**5. Settings are a declared catalogue, not a free key/value table.**

`Setting` in D2 is `key` + `Json`, which is the right storage and no contract. Three
questions have no answer without a catalogue: what does a key resolve to before
anybody configures it, how should the JSON be read, and which keys may a client see.
`modules/settings/domain/catalogue.ts` answers all three, and the default *is* the
last resolution layer — so every declared key resolves against an empty table, an
unreachable Redis and a database that has never been seeded. Configuration that only
works once configured is a landmine under the first deploy.

`isPublic` is a property of the key rather than of the row, so one careless admin
edit cannot widen what `publicSettings` exposes.

**6. `Country.defaultLocale` is derived from the language set, not patched.**

D2 has both `Country.defaultLocale` and `CountryLanguage.isDefault`. Two columns for
one fact drift, and when they do a market renders in a language it does not read. So
`CountryPatchInput` has no `defaultLocale` field: `setCountryLanguages` is how it
moves, `normaliseLanguageSet` enforces exactly one default, and the write updates
both in one transaction.

The generous readings are applied rather than refused, because they are unambiguous —
a single language is its own default, duplicates collapse. What cannot be guessed,
two claimed defaults, is the only thing refused.

**7. Registration resolves its region from the country table.**

E2 read a new account's country, currency, locale and timezone from the request
headers with `DEFAULT_CURRENCY` as the fallback. `REGION_CATALOG` now sits in the
middle, so the country row supplies them — which is what makes the multi-country
claim data rather than configuration. Header hints still win where given, because a
visitor who chose a currency should keep it.

`defaultsFor` never throws. A signup must not fail because reference data is
unreachable; the account gets platform defaults and is editable afterwards, which is
a far smaller problem than a registration form returning 503. Same lesson E2 learned
from `apiStatus`.

**8. The GraphQL `User` type moved out of `auth` into shared schema surface.**

E2 owned it in `auth/presentation/models/`, which was right while `me` was the only
thing returning a user. E3 made that untenable: the admin directory returns users
too, and a module may not import another module's `presentation/` — so the choice was
a second `@ObjectType('User')`, which fails schema assembly, or one type in shared
space. A GraphQL object type that several modules return *is* shared surface, the way
`MutationPayload` and `Page` already are, and later phases only make that truer
(`Order.customer`, `Review.author`, `VendorStaff.user`).

The move is wire-neutral: `type User` in `schema.gql` is byte-identical.

**9. Customer settings belong to `users`; platform settings are their own module.**

Two different things share the word. `UserSettings` is a 1:1 on the user aggregate
that the account page owns; `Setting` is operator configuration with scope resolution
that every later module reads. Putting them together would have meant one module
whose two halves share nothing but a noun.

Related: the notification matrix crosses the wire as a **list**, not a map. The
frontend holds `Record<NotificationTopic, NotificationChannels>`, which GraphQL can
only express as five hard-coded fields — making a sixth topic a schema change plus a
client regeneration. A list keyed by `topic` costs one `Object.fromEntries` and
survives new topics.

## What the server enforces that the UI merely renders

`frontend/services/settings.ts` exports `REQUIRED_NOTIFICATIONS` and the page renders
those controls locked. That is a courtesy. The rule now lives in
`shared/enums/notification-topic.ts` and is enforced on **write and read**:
`enforceRequiredChannels` forces order receipts back on whatever the input said, and
does the same when loading a row written before the channel became required.

It corrects rather than refuses, deliberately. A client posting
`orderUpdates.email = false` — by bug, by a stale form, or by hand — should get its
receipts and a settings object showing the switch still on, not a validation error on
a control the user was never able to touch. The attempt is logged, because a client
repeatedly trying it is either a bug worth finding or a UI lying to somebody.

## One defect found in E2, and fixed

`JoseTokenSigner.signAccessToken` stamps `iat` and `exp` from the injected `CLOCK` — E2's
harness is what caught the original `Date.now()` there. But `verifyAccessToken` left
`jwtVerify` on its default of `new Date()`, so **signing and verification disagreed about
what time it was.**

The symptom was a harness that passed only during the fifteen real-world minutes after its
fixed `FakeClock` instant. It passed at 10:02 UTC and failed at 11:08 UTC with `"exp" claim
timestamp check failed`, from a script whose entire premise is that it does not depend on the
wall clock. E2's write-up reported 148 assertions passing, which was true and would have
stopped being true an hour later.

The fix is `currentDate: this.clock.date()` on the verify call: a token's lifetime is measured
by whatever clock minted it. Three assertions now lock it in — verifies while the injected
clock says it is live, refuses once the clock passes expiry, accepts again when the clock is
wound back — which also turns `clock.advance` into a real test of expiry rather than a no-op.
`verify:auth` is **151** assertions as a result.

Worth noting for later phases: the same inconsistency would have bitten any non-system clock,
including the skew-corrected one a multi-region deployment eventually wants.

## Verified

`bun run verify:core` — **169 assertions**, in-memory fakes behind the real ports.

| Area | What is asserted |
| --- | --- |
| Permission catalogue | no duplicate slugs; `resource:action` shape; every Phase C demo slug present, so the cutover cannot shorten what the account page shows |
| Rank | every `UserRole` has one; an unrecognised role ranks 0; `super-admin` tops the ladder; `super-admin` grants nothing explicitly because the wildcard does it |
| Escalation | a moderator may not administer super-admin, their own rank, or themselves; **every** unheld permission is reported, not the first; a past expiry is refused, including one of exactly now |
| Setting resolution | vendor beats country beats platform; another vendor's row does not leak; a configured `false` beats a `true` default; a configured `0` beats a non-zero one; a type-mismatched row is skipped and the next layer answers; every key resolves against an empty table |
| Scope rules | a platform-only key refuses country scope; an unknown key allows nothing; `null` matches no type including `json`; `NaN` and `Infinity` are not numbers |
| Language sets | a single language defaults itself; two claimed defaults is refused rather than guessed; duplicates collapse last-write-wins; the default sorts first and `sort` is renumbered densely |
| Customer settings | a single toggle leaves its siblings, its topic and privacy untouched; a required channel survives a merge that switches it off, and survives a bad stored row |
| Directory | suspending revokes sessions with reason `admin` and drops the cache; re-suspending is refused and does **not** revoke again; a moderator cannot ban a finance manager; reinstating does not revoke; a role change invalidates the cache and revokes **nothing**; promoting to super-admin is refused |
| Account closure | self-close revokes with reason `logout`, not `admin`; closing twice is refused; a closed account is invisible to a normal read and visible with `includeDeleted` |
| Degradation | with the repository throwing, `defaultsFor` still yields a currency and a timezone; a cached country row supplies the locale rather than the env default; lookup is case-insensitive |
| Codecs | `LTR ↔ "ltr"`, `ORDER_UPDATES ↔ "orderUpdates"`, `PLATFORM ↔ "platform"`; all four E3 vocabularies match their Postgres enums — and drift detection is itself asserted to fail on a mismatch |

Also green: `typecheck`, `lint` (including the layer-boundary rules), `build`, and
`schema:check` against a 1,140-line `schema.gql`. `bun run verify:auth` still passes
151/151 (148 of its own plus the three above), so E2's behaviour survived the region change and
the `User` move.

The literal typing of permission slugs was checked directly rather than assumed:

```
scripts/.slugcheck.ts(3,14): error TS2820:
  Type '"users:wirte"' is not assignable to type '"users:read" | "users:write" | …'.
  Did you mean '"users:write"'?
```

Live, against the compiled build with Postgres **and** Redis down:

| Request | Result |
| --- | --- |
| `{ publicSettings }` | resolves from catalogue defaults, operator-only keys absent |
| `{ settingDefinitions { key } }` | `UNAUTHENTICATED` — protected by default, no decorator needed |
| `{ users { total } }` | `UNAUTHENTICATED` |
| `{ countries { code } }` | `SERVICE_UNAVAILABLE`, `dependency: database` — retryable, not a 500 |
| `register(…)` | `SERVICE_UNAVAILABLE` — the region lookup degraded, then the write failed honestly |
| `/health/live`, `/health/ready` | 200, 503 — still open, still correct |
| `POST /auth/refresh`, `/.well-known/jwks.json` | 401, 200 — E2's paths intact |

## Not verified, and why

**Nothing in E3 has run against a real PostgreSQL or Redis.** This machine has
neither. What that leaves unexercised is specific:

- **Every `where` builder.** `UserRepository.list` compiles filters and closed sorts
  into Prisma queries. The fakes assert the service's decisions, not the SQL.
- **The nullable-member unique constraints.** `UserRoleAssignment` and
  `UserPermission` have `vendorId` inside their unique index, and Postgres treats
  NULLs as distinct — so the platform-wide case is guarded by a **partial unique
  index the migration must add**, and no migration has ever been applied. The
  repositories use `findFirst` with an explicit `vendorId: null` rather than Prisma's
  compound-unique input, which cannot carry a null. Correct by construction;
  unproven by execution.
- **The soft-delete/unique interaction.** `Role.slug` and `(scope, scopeId, key)` are
  unique *across tombstones*, so `createRole` and `upsert` revive rather than collide.
  Reasoned from the extension's source, not observed.
- **`seed-reference.ts` has never been executed.** It typechecks against the generated
  client and its statements are ordinary upserts. That is the whole of the assurance.
- **`FORBIDDEN` from `PermissionsGuard`.** Minting a token needs a user, which needs a
  country row, which needs a database. The permission algebra is asserted in the
  harness; the guard returning 403 for a signed-in actor without a permission is not.

E11 owns the committed suite and is where all of the above gets a container.

## Not built, and why

**The address book.** `frontend/services/account.ts::getAddressBook` reads it and
`Address` hangs off `User`, so it looks like it belongs here. It is written at
checkout, D5 lists `myAddresses` next to the order queries, and E5 owns that path —
splitting the reads from the writes across two phases would leave an address book
nobody can add to. E5.

**Favorites.** Listed against `users` in the seam table, but `services/favorites.ts`
reads a device store today and the interesting question is how a device's list merges
with an account's on sign-in. That is a decision, not a CRUD table.

**`Country.taxRate` / `taxLabel`.** The frontend's `Country` carries both, and
`Country` here does not. A single rate per country is the prototype's simplification:
`TaxRule` is dated and scoped because one order can attract a goods VAT and a
municipal delivery levy at once, and because a rate change must never rewrite the
history of orders priced under the old one. **The frontend must keep its local tax
table until E5**, which is the one place this phase leaves a constant in place rather
than replacing it.

**Feature flags.** `FeatureFlag` exists in the schema and no phase in the brief claims
it. Percentage rollouts and allowlists are an evaluation engine, not a settings row,
and building it unasked would be scope this phase was not given.

**Exchange rates.** `ExchangeRate` is reporting-only by design — an order is priced and
settled in its own currency and never converted (D2). Nothing reads it until E9.

**Erasure.** Closing an account soft-deletes and starts a retention window; nothing
purges. `accounts.retentionDaysAfterClose` is declared and operator-only, because it is
a legal commitment rather than a preference. The purge job is E12's.

## What the cutover still needs

Ordered by what blocks what.

1. **Run `bun run seed:reference`.** This is what clears E2's hard blocker:
   `User.countryCode` is a non-null FK, so no account can exist until a country row
   does. It also writes the role and permission rows that E2's registration currently
   warns about skipping — until then every account has a working role gate and an empty
   permission set.
2. **Run `syncPermissionCatalogue`** (or rely on step 1, which writes the same rows).
   Needed before any direct grant, because `setDirectGrant` refuses a slug with no row
   rather than creating one — a grant should not be able to invent a permission.
3. **The E12 demo accounts.** The Phase C `usr_*` ids, so deep links and screenshots
   still resolve. One of them needs `super-admin`, since rule 3 above means nobody can
   promote themselves into it.
4. **~40 new i18n keys** in en/bn/ar, all listed in the four `*-errors.ts` files:
   `users.errors.*`, `rbac.errors.*`, `regions.errors.*`, `settings.errors.*`. Two keys
   deliberately reuse the existing namespace — `errors.phoneTaken` and
   `errors.phoneInvalid` — because the Phase C forms already render them.
5. **`config/regions.ts` → `countries` / `currencies`.** Field names follow the domain,
   so the map is mechanical: `{ locale: formatLocale }`, and `taxRate`/`taxLabel` stay
   local until E5.
6. **`config/i18n/config.ts` → `languages`.** `localeMeta` becomes the query's result;
   `dirFor()` reads `direction`. `flag` has no column — it is presentation, and an emoji
   is not a fact about a language.
7. **`services/settings.ts`.** `getSettings` → `mySettings`, `updateSettings` →
   `updateSettings` (list-shaped notifications), `deleteAccount` → `closeAccount`.
   `REQUIRED_NOTIFICATIONS` can be deleted once the page reads `requiredChannels` from
   the server, which is one fewer place for the rule to drift. `changePassword` already
   points at E2.
8. **`services/account.ts::updateProfile`** → `updateProfile`. Same `ProfilePatch`
   fields, same `Promise<Result<User>>`.

## What E4 inherits

`payloadOf()` and `toPayload()` for its mutations, `Paginated()` for its lists, and
`UserSort` as the worked example of a closed sort enum — every option index-backed, no
`orderBy: [{ field, direction }]`.

More concretely: `SETTINGS_READER` is how a vendor-scoped setting gets read
(`orders.cancelWindowMinutes` is already declared as per-vendor and waiting for E5), and
`@VendorScope()` plus the `vendorIds` on the resolved actor is how a branch-scoped role
becomes a query filter. `SettingsService.checkScopeId` currently accepts any vendor id
without validating it, because vendors do not exist yet — that is the one loose end E4
should tighten.

---

E1: [foundation](./E1-backend-foundation.md) · E2: [authentication](./E2-authentication.md)

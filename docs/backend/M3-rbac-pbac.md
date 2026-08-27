# M3 — RBAC / PBAC Authorization

**Status: built and verified, 2026-08-27.**
71 new assertions, 215 in the suite, 51 lifecycle checks, no regressions.

Module 3 of the 32 in
[BACKEND-REQUIREMENTS §3](../FOODORA-BACKEND-REQUIREMENTS.md#3-module-build-order),
whose one-line brief is *"resolve `User.permissions` = role grants ∪ direct
grants − denials"*. It turns the authorization data the database phase seeded —
14 roles, 20 permissions, 54 grants — into behaviour the API enforces.

Authentication answers **who are you**; [M2](./M2-auth-sessions.md) owns it and
nothing here changes it. This answers **what may you do**, and where the answer
depends on *which* record, **may you do it to this one**.

---

## 1. What was audited first

### The database

| Model | Column that matters | Read as |
| --- | --- | --- |
| `Role` | `slug`, `builtin`, `rank`, `deletedAt` | the 14 `UserRoleSlug` built-ins plus room for custom roles |
| `Permission` | `slug`, `resource`, `action` | the closed list of 20; `@@unique([resource, action])` |
| `RolePermission` | `(roleId, permissionId)` | 54 rows — what each role grants |
| `UserRoleAssignment` | `userId`, `roleId`, **`vendorId`**, `expiresAt` | a role held by an account, optionally *at one vendor* |
| `UserPermission` | `userId`, `permissionId`, **`effect`**, **`vendorId`**, `expiresAt` | the per-account delta: a grant, or a denial |
| `Vendor` | `ownerId` | ownership |
| `VendorStaff` | `userId`, `role`, `status`, `branchId` | employment; `userId` is nullable — an invitation is not an account |
| `VendorStaffPermission` | `(staffId, permissionId)`, `effect` | the staff delta, copied into `UserPermission` on acceptance |
| `User` | `primaryRole`, `status`, `deletedAt` | `primaryRole` **backs the display field only** |

Three facts decided most of the design:

1. **`vendorId` on both grant tables is the PBAC model.** It is already there,
   with the comment *"this is what makes 'manager of this branch' expressible
   without a second permission system"*. No new model was invented.
2. **`User.primaryRole` is not authority.** `identity.prisma` says the
   authoritative set lives in `roles`. So resolution reads
   `user_role_assignments` and never that column — which also closes an
   escalation path, because a future profile-update endpoint that let the column
   through would otherwise grant roles.
3. **An assignment has one lifecycle column, `expiresAt`.** There is no
   `revokedAt`. "Revoked" is therefore a deleted row, and "invalid" is an
   assignment whose `Role` has been soft-deleted. All three states are tested.

### The frontend

`frontend/lib/rbac.ts` is the surface this has to agree with, and it is already
written: `PLATFORM_PERMISSIONS` is the same 20 slugs in the same vocabulary,
`ROLE_PERMISSIONS` is the same 54 grants, and `ADMIN_ROUTE_PERMISSIONS` maps each
`/admin` section to the permission that opens it. `stores/auth` wraps it;
`components/admin/admin-shell` draws from it.

Two things it establishes that the backend now honours:

- **The empty rows are deliberate.** `customer`, `restaurant-owner`,
  `cafe-owner`, `home-chef`, `cloud-kitchen`, `catering-company` and
  `delivery-rider` hold **no platform permission at all**, because everything
  they do they do to their own records. Granting a restaurant owner
  `orders.view` would grant them *every* order on the platform.
- **Restaurant rights are a different vocabulary.** `lib/staff.ts`'s
  `StaffPermission` (`kitchen.operate`, `menu.manage`, `pos.operate`…) answers
  "what may this person do at this restaurant" and deliberately does not
  collide with `PlatformPermission`. Those slugs are **not** in the
  `permissions` table, so this module scopes vendor access by *membership and
  staff role*, not by a staff permission vocabulary that does not exist yet.
  See §11.

A hidden button is not authorization: everything below is enforced server-side
regardless of what the client renders.

---

## 2. Architecture

```
src/modules/authz/
  index.js       plugin — catalogue, decorators, guards, request.auth
  service.js     resolution: roles, permissions, scopes, the cache
  policy.js      the requirement vocabulary and the four-step decision
  repository.js  every database read authorization makes, and no others
  routes.js      /api/v1/_authz — verification probes, absent in production
```

Registered in `routes/v1/index.js` immediately after module 2 and wrapped in
`fastify-plugin` for the same reason: the guards must reach every module that
mounts below it, and `fp` skips the encapsulation a `prefix` option would attach
to, so the routes apply their own prefix inside.

The split is the one STEP 10 asks for. `service.js` answers *what does this
account hold*; `policy.js` answers *is that enough for this*. A layer that folded
them is the layer that eventually lets a restaurant owner read another
restaurant's orders because they held `orders.view`.

---

## 3. Role resolution

```
User → UserRoleAssignment → Role
```

One query, filtered on three things:

- **`expiresAt`** — `null`, or in the future. Compared in PostgreSQL against a
  timestamp this process supplies, so clock skew cannot revive an expired row.
- **`role.deletedAt IS NULL`** — written by hand, because
  `plugins/prisma.js`'s soft-delete extension states plainly that it cannot
  reach a relation loaded through `select`. Without it a deleted role would keep
  granting.
- **the account itself** — an account that is soft-deleted, `suspended` or
  `banned` resolves to *nothing*, before its grants are even read.

`vendorId` comes back per assignment and is not filtered: a question about one
vendor still needs the platform-wide rows.

Nothing reads `request.user.roles`. That claim exists as identity and is stale by
design — a token minted fifteen minutes ago describing an account whose
assignments may have changed twice since.

---

## 4. Permission resolution

```
User → UserRoleAssignment → Role → RolePermission → Permission     (role grants)
User → UserPermission                                              (direct grants and denials)
```

Two queries. The fold, per scope:

```
effective(scope) = ( ⋃ role grants where row applies to scope
                   ∪ direct grants where row applies to scope )
                   − direct denials where row applies to scope
```

where **a row applies to a scope** when `row.vendorId IS NULL` (platform-wide,
applies everywhere) or `row.vendorId = scope`. That single predicate is the whole
of scope propagation, which is why a vendor-scoped denial cannot leak into
another vendor.

**Output vocabulary.** Slugs exactly as the `permissions` table holds them —
`orders.view` — which is `PlatformPermission` in `types/user.ts`. No Prisma enum
identifier ever reaches the API: `Role.builtin`, `User.status`,
`VendorStaff.role` and `VendorStaff.status` all go through
`shared/utils/enums.js`, whose map is derived from `Prisma.dmmf`. So there is no
`COMPLETED` / `completed` mismatch to introduce.

**Normalisation.** A `Set`, so a permission three roles all grant appears once,
then sorted lexicographically so the same account always produces the same array.

**Denial precedence.** A denial beats a grant, at its own reach — a platform
denial removes the permission everywhere, a vendor denial removes it in that
vendor only. Worth knowing when the tie-break actually fires: **within one scope
it cannot.** The partial unique indexes the schema documents
(`user_permissions_platform_uq` on `(user_id, permission_id) WHERE vendor_id IS
NULL`, and the plain `@@unique` for the vendor case) make a grant and a denial at
the same reach *unwritable*. Precedence therefore only ever decides a
cross-scope collision — a platform denial against a vendor's role grant. The rule
lives in the database where it can, and in `service.js` where it cannot.

**No wildcards.** `lib/rbac.ts` honours `*` and `orders.*` because the frontend's
seeded `usr_admin` carries `permissions: ["*"]`. The `permissions` table has no
such row and cannot — `super-admin` holds all twenty explicitly, which is what
the 54 grants say. So the backend matches exact slugs, and `hasPermission` in
`plugins/auth.js` keeps its wildcard handling for the claim-based path it serves.

---

## 5. Request context

M2's `requireUser` populates **`request.account`** — the account row, after the
account, session and `credentials.tokenEpoch` have all been re-read. That stays
the authenticated identity and this module does not duplicate it.

Module 3 adds **`request.auth`**: the resolved authorization snapshot, set by any
guard that passes, or on demand through `await fastify.resolveAuth(request)`.

```js
request.auth = {
  userId, status, usable,
  roles:       [{ slug, name, builtin, rank, vendorId, expiresAt, grants }],
  vendorIds:   ["ven_…"],          // vendors this account holds a scoped row in
  permissions: ["orders.view", …], // platform scope
  permissionsIn(scope), rolesIn(scope),
  has(p, scope), hasAll([p], scope), hasAny([p], scope),
  hasRole(r, scope), hasAnyRole([r], scope), hasAllRoles([r], scope),
  rankIn(scope),
}
```

`scope` is `null` for platform-wide, or a vendor id. The predicates are
synchronous — the sets are already resolved — so a handler can ask freely.

The service is also reachable off the request path as `fastify.authz`
(`resolve`, `permissionsOf`, `rolesOf`, `vendorAccess`, `riderProfileOf`,
`invalidate`), which is what `modules/auth/service.js` uses to fill the read
model's `permissions`.

---

## 6. The Fastify authorization API

```js
fastify.get("/orders",        { preHandler: fastify.requirePermission("orders.view") }, handler)
fastify.get("/settle",        { preHandler: fastify.requirePermission("payouts.view", "payouts.manage") }, handler)
fastify.get("/queue",         { preHandler: fastify.requireAnyPermission("support.view", "orders.view") }, handler)
fastify.get("/flags",         { preHandler: fastify.requireRole("super-admin") }, handler)
fastify.get("/v/:vendorId",   { preHandler: fastify.requireVendorAccess() }, handler)

fastify.get("/v/:vendorId/menu", {
  preHandler: fastify.requireAuthorization({
    vendor: (request) => request.params.vendorId,
    staffRole: ["owner", "manager"],
  }),
}, handler)
```

| Decorator | |
| --- | --- |
| `requireAuthorization(requirement)` | the general guard; everything else is sugar |
| `requirePermission(...slugs)` | **all** of them, platform scope |
| `requireAnyPermission(...slugs)` | any one of them |
| `requireRole(...slugs)` | any one of them |
| `requireVendorAccess(param = "vendorId", extra)` | membership of the vendor named by a route parameter |
| `resolveAuth(request)` | resolve `request.auth` without a requirement |
| `mayAuthorize(request, requirement)` | the verdict as data, without throwing |
| `authz` | the service itself |

### The requirement

```js
{
  permission:    "orders.view",              // or permissions: [...] — ALL
  anyPermission: ["support.view", "…"],      // ANY
  roles:         ["super-admin"],            // ANY  (role: "x" is sugar)
  vendor:        "ven_…" | (request) => id,  // resource scope
  staffRole:     ["owner", "manager"],       // ANY, at that vendor
  self:          "usr_…" | (request) => id,  // the caller's own resource
  platformScope: true,                       // default — see §7
  hide:          false,                      // deny with 404 instead of 403
}
```

`permissions` is **all**, not any — `plugins/auth.js`'s existing rule, kept for
its existing reason: "any" silently *widens* access the first time somebody adds
a second argument expecting it to narrow. `anyPermission` has to be asked for.

### Two properties worth stating

**Requirements are validated when the route is declared.** `normalise` checks
every slug against the permission and role catalogue read out of the database at
boot, so `requirePermission("orders.veiw")` throws during startup rather than
becoming a route that refuses everyone for ever. An unknown requirement key
throws too, and so does a requirement that requires nothing — which would
authorise everything. (Validation is skipped when the catalogue is empty, so an
unseeded database can still boot and be seeded.)

**A guard authenticates if nobody else has.** It calls `requireUser` when
`request.account` is unset. Writing `[requireUser, requirePermission(…)]` still
works and costs nothing — the guard sees the account already loaded. The reason
it does not simply *require* the pair is that forgetting it would produce a route
that answers 401 to everybody including the super-admin, diagnosed nowhere near
the route that caused it.

---

## 7. Resource scope — PBAC

`authz.vendorAccess(userId, vendorId)` answers *may this account act on this
vendor, and by what right*:

| `via` | from |
| --- | --- |
| `"owner"` | `Vendor.ownerId` |
| `"staff"` | a `VendorStaff` row with `status = active`; carries `staffRole` and `branchId` |
| `"assignment"` | a `UserRoleAssignment` or `UserPermission` carrying that `vendorId` |

`invited` and `inactive` staff grant nothing — the same rule
`lib/staff.ts::effectivePermissions` applies on the merchant dashboard, where a
deactivated manager who kept their rights would be a suspension that suspended
nothing.

### Permission **and** resource

A requirement with a `vendor` runs both checks. The permission check happens *in
that vendor's scope*; the scope check happens against membership. A vendor owner
passes `{ vendor }` and fails `{ permission: "orders.view", vendor }`, because
`restaurant-owner` grants no platform right — which is the product's asymmetry,
not an accident.

### `platformScope`

Default `true`, and it decides one question: must a platform desk be a member of
the vendor it acts on? On this platform, no — `customer-support` holds
`orders.view` precisely so that it can see *every* order, and requiring it to be
staff at the restaurant would break the support desk. So a caller holding the
requirement's permissions **platform-wide** satisfies the scope check without
membership.

Set it to `false` for a route where even an administrator must be a member.
Nothing does today; the flag exists because every future module has to answer
that question and the answer belongs at the route.

A vendor-scoped *denial* still bites: a support agent denied `orders.view` at one
vendor is refused there and admitted everywhere else.

### The caller's own record

`self` short-circuits: if the caller *is* the named account, the answer is yes and
nothing else is asked. A customer reading their own order holds no platform
permission at all, so anything other than a short-circuit would make "your own
data" require an admin right. Everyone else falls through to the permission check
— `{ self: id, permission: "customers.view" }` reads as *your own, or the desk
that may look at anyone's*.

### Riders

`authz.riderProfileOf(userId)` returns the `Rider` row behind an account, which
is the scope root the delivery module will hang its rules on. Nothing more is
implemented, because nothing more is supported by a table with rows in it yet.

---

## 8. 401 vs 403

| Situation | Status | Code |
| --- | --- | --- |
| No token, bad token, refresh token presented as an access token | **401** | `UNAUTHENTICATED` |
| Session revoked, account suspended, banned, soft-deleted, password changed since | **401** | `UNAUTHENTICATED` |
| Authenticated, lacks the permission / role / staff role | **403** | `FORBIDDEN` |
| Authenticated, not a member of the vendor | **403** | `FORBIDDEN` |
| The same, on a route that declares `hide: true` | **404** | `NOT_FOUND` |
| An unknown permission slug in a query | **400** | `BAD_USER_INPUT` |

The blocked-account cases are 401 rather than 403 because `requireUser` refuses
the *identity* before authorization is asked — the caller has no usable session,
which is a sign-in problem, not a rights problem.

### What a refusal says

```jsonc
{ "success": false,
  "error": { "code": "FORBIDDEN", "key": "errors.forbidden", "message": "Not permitted",
             "details": { "required": { "permissions": ["orders.view"] } },
             "requestId": "req_…" } }
```

`details.required` is the **route's own declaration**, which is not a secret —
`lib/rbac.ts` ships the whole permission table to every browser, and a 403 that
will not say what it wanted is a 403 nobody can act on.

What is never in the response: the caller's resolved permissions, the roles
behind them, which of the four checks failed, or any database detail. The reason
goes to the server log at `debug` with the user id and the route.

**A vendor that does not exist and a vendor that is not yours produce a
byte-identical 403**, so a refusal cannot be used to enumerate vendors. `hide`
exists for the case where even that is too much — where "forbidden" would itself
confirm the id is real.

---

## 9. Caching

No Redis (banned) and no cross-process store. `AUTHZ_CACHE_TTL_MS`, default
**5000**, holds resolved snapshots and vendor memberships in a bounded in-process
`Map` (5 000 accounts, oldest evicted first). `authz.invalidate(userId)` drops
both for one account; the module that eventually grants and revokes roles calls
it and the change is immediate.

Three things make it safe rather than merely fast:

1. **It caches a resolution, not a decision.** Every `has` / `hasRole` /
   `authorize` still runs against the sets.
2. **Account state is never cached into a yes.** `requireUser` re-reads the
   account and the session on *every* request and refuses a suspended, banned,
   deleted or signed-out one with a 401 before any guard runs. The worst the
   cache can do is hold a stale permission set for the TTL.
3. **Five seconds is a stated consistency bound**, not a guess — and `0` turns
   the cache off entirely.

The test suite runs with `AUTHZ_CACHE_TTL_MS=0`, so every assertion in it is a
statement about the database rather than about a `Map`. The cache is covered
separately by building a service with a TTL over the same client.

Cost per authorized request, cache cold: **1 + 2** queries (account state, then
the grant graph and the direct layer in parallel), plus **2** more only when a
vendor scope is asked about. The grant graph is one statement, not a walk — which
is the per-request explosion STEP 12 asks to avoid.

---

## 10. Security decisions

- **Nothing client-supplied is authority.** Not the JWT's `roles` or
  `permissions` claims, not headers, not the body, not a query parameter naming
  another account. A token signed with this server's own key carrying
  `roles: ["super-admin"], permissions: ["*"]` is refused every route it asks
  for — tested.
- **The token contract is unchanged (STEP 13).** `permissions` stays `[]` in the
  access token. Putting the set in the claim would make every grant and revoke
  take up to fifteen minutes, and would move the authority from a table into a
  bearer string. It was not changed, and this paragraph is the documented
  trade-off STEP 13 asks for instead.
- **`User.primaryRole` grants nothing.** Setting it to `super-admin` directly in
  the database changes the account's *display* role and not one permission —
  tested, because that column is the obvious target of a future profile-update
  endpoint.
- **Self-registration cannot mint a privileged role.** M2's schema already limits
  it to `customer`, `restaurant-owner`, `delivery-rider`; the test is here
  because it is an authorization property.
- **Fail closed everywhere.** A requirement that requires nothing throws. An
  unknown requirement key throws. An unknown permission slug throws. A guard
  without an account 401s. An unusable account resolves to the empty set.
- **`plugins/auth.js::authorize` was left alone.** It reads the JWT claim, which
  M2 mints empty, so it is fail-closed; one foundation test covers it, and
  removing a decorator this phase does not own would be churn. New routes use the
  guards in §6, and `index.js` says so where somebody choosing between them will
  read it.

---

## 11. Frontend compatibility

Nothing in `frontend/` was changed, and `NEXT_PUBLIC_BACKEND_AUTH` stays `0` —
the REST migration is a frontend phase's call.

One backend-side change makes the two agree: **`User.permissions` in the read
model is now filled** from this module, in `/auth/me`, on sign-in, on
registration and on refresh. It was `[]` and the module checklist tracked it as
the one thing waiting on module 3. The frontend feeds that field to
`lib/rbac.ts::permissionsFor`, so the buttons a browser draws and the requests
the API allows are now the same resolution rather than two implementations that
can disagree. It is a display set; nothing gates on it server-side.

Two gaps recorded, neither a blocker for this module:

- **The staff permission vocabulary has no rows.**
  `types/staff.ts::StaffPermission` — `kitchen.operate`, `menu.manage`,
  `pos.operate`, `reservations.manage`, `reviews.respond`, `finance.view`,
  `staff.manage` — is not in the `permissions` table, which holds only the 20
  platform slugs. `VendorStaffPermission` therefore cannot express a staff delta
  today. Module 16 (Staff) is where that is decided: either those slugs become
  `Permission` rows, or the staff vocabulary stays frontend-side and vendor
  authorization stays membership-and-role based as it is here. Deciding it now,
  with no staff module to try it against, would be a guess.
- **The frontend honours `*` and `orders.*`; the database has no wildcard row.**
  Harmless in the current direction — `super-admin` resolves to all twenty
  explicitly, so `permissionsFor` gets the same answer either way — but an admin
  surface that *writes* permissions must not offer a wildcard, because this
  module would not read it.

---

## 12. Testing

### `tests/authz.test.js` — 71 cases, real PostgreSQL

No mocked authorization data anywhere: the fourteen roles, twenty permissions and
fifty-four grants are read as the seeder wrote them, and the suite asserts those
three counts before anything else so that a run against an empty catalogue
cannot pass every "is refused" case for the wrong reason.

| Group | Covers |
| --- | --- |
| the seeded configuration | 14 / 20 / 54; the catalogue loads; each seeded role resolves to exactly the seeder's set; super-admin holds all twenty |
| role resolution | one role; several roles combined; duplicates normalised; deterministic order; expired; revoked (row deleted); invalid (role soft-deleted); `primaryRole` grants nothing |
| the direct layer | grant adds; denial removes; the same-scope contradiction is unwritable; cross-scope precedence; expired grant and expired denial; unusable and non-existent accounts hold nothing |
| the route guards | 401 unauthenticated; 403 forbidden; ALL-of; ANY-of; role requirement; grant and revoke take effect **on an unchanged token**; suspended → 401; soft-deleted → 401; the refusal body leaks nothing; `/context`; `/check`; unknown slug → 400 |
| vendor scope | owner in / owner out; customer out; active staff in, only at their vendor; invited and inactive refused; removed staff refused; vendor-scoped assignment; scoped permission does not leak to the platform set or another vendor; scoped denial stays put; missing vendor indistinguishable from not-yours; `hide` → 404; permission AND resource; a platform desk is not scoped; a scoped denial overrules a platform desk at one vendor; staff-role narrowing; `/context/:vendorId` |
| own record | own in; someone else's out; the desk with `customers.view` in |
| escalation | registration cannot mint `super-admin`; a validly signed token with forged `roles`/`permissions` is refused everywhere; headers and query parameters asserting roles are ignored; naming another account resolves the caller |
| the token contract | `permissions` still `[]` in the claim; the read model filled from the database on `/me` and on sign-in |
| requirement validation | unknown permission, unknown role, unknown key, empty requirement; the shapes the guards build; skipped on an empty catalogue |
| the cache | off in tests; reuse within TTL; `invalidate`; membership cached under the same key; nothing held at TTL 0; expiry |

Accounts are created with a per-run prefix and hard-deleted through
`$unfiltered()`; vendors, staff and the one custom role are cleaned by hand.

### Results, 2026-08-27

```
npm run verify
  prisma validate            ✓ schemas are valid
  check:forbidden            ✓ 56 JS files, 14 dependencies — no TS/Nest/Redis/Docker/GraphQL
  npm test                   ✓ 215 tests, 30 suites, 0 failures   (144 before + 71 new)
  scripts/auth-flow.js       ✓ 51/51 lifecycle checks over a real socket
```

No existing test changed its expectations. The one M2-adjacent change — the read
model's `permissions` — is additive and its existing assertion ("the user read
model is the frontend's") still passes.

---

## 13. Configuration

| Variable | Default | |
| --- | --- | --- |
| `AUTHZ_CACHE_TTL_MS` | `5000` | how long a resolved permission set may be reused. A consistency bound, not a knob. `0` disables. |
| `AUTHZ_VERIFY_ROUTES` | `!isProduction` | mount `/api/v1/_authz`. Off in production — an endpoint whose purpose is to describe the caller's rights is not one to deploy. |

---

## 14. The verification routes

`/api/v1/_authz`, outside production only. They are probes, not products: none
reads or writes a domain row, and each exists to be refused.

| Route | |
| --- | --- |
| `GET /context` | the caller's own roles, permissions and rank. No `:userId` form — an endpoint that reports somebody else's rights maps the platform's staff for whoever asks |
| `GET /context/:vendorId` | membership plus the effective set inside that vendor |
| `GET /check?permission=&vendorId=` | the verdict as data; asking is not being refused |
| `GET /probe/orders-view`, `/probe/payouts-manage` | one permission |
| `GET /probe/orders-and-refunds` | ALL-of |
| `GET /probe/support-or-orders` | ANY-of |
| `GET /probe/super-admin` | a role |
| `GET /probe/vendor/:vendorId` | membership alone |
| `GET /probe/vendor/:vendorId/orders` | permission **and** scope |
| `GET /probe/vendor/:vendorId/manage` | a staff role |
| `GET /probe/self/:userId` | own record, or the right to see anyone's |
| `GET /probe/hidden/:vendorId` | a refusal that hides the resource — 404 |

---

## 15. What is not here

**Not built, because nothing supports it yet**

- **Granting and revoking.** There is no endpoint that writes a
  `UserRoleAssignment` or a `UserPermission` — that is an admin surface, and
  building it here would be implementing a business module. `authz.invalidate`
  is waiting for it.
- **Custom role management.** `Role.isSystem` and `Role.rank` exist and are
  read; the CRUD that would create a custom role does not.
- **Branch-level scope.** `VendorStaff.branchId` is resolved and reported, and no
  rule reads it, because no module has branches to protect yet.
- **Rider and order scope rules.** `riderProfileOf` exists as the root; the rules
  belong to the delivery module, against tables that currently have no rows.
- **The staff permission vocabulary.** §11.

**Not built, by instruction** — every business module in STEP 19. The
infrastructure supports them; none of their functionality exists.

---

## 16. Next

**Module 4** in
[BACKEND-REQUIREMENTS §3](../FOODORA-BACKEND-REQUIREMENTS.md#3-module-build-order).
Whatever it is, it can now say what it means:

```js
fastify.get("/…", { preHandler: fastify.requirePermission("orders.view") }, handler)
```

and, where the record matters as much as the right:

```js
fastify.get("/vendors/:vendorId/…", {
  preHandler: fastify.requireAuthorization({
    permission: "orders.view",
    vendor: (request) => request.params.vendorId,
  }),
}, handler)
```

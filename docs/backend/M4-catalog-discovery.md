# M4 — Catalog & discovery

Module 4 of [BACKEND-REQUIREMENTS §3](../FOODORA-BACKEND-REQUIREMENTS.md#3-module-build-order).
Depends on module 1 (reference data) for `countries`, and on modules 2 and 3 for
the identity and the rights that decide who may see a storefront that has not
opened yet.

> **The row this module implements**
>
> | # | Module | Depends on | Notes |
> |---|---|---|---|
> | 4 | Catalog & discovery | 1 | Derive `isOpen` (branch hours + timezone) and `distanceKm` (caller coordinates) — **never stored** |

Read-only, by nature rather than by omission: the catalogue is *written* by
onboarding (module 15), the merchant's own profile surface (module 15/21) and the
menu (module 5). This module is the one that answers *what can I order from, near
me, right now* — the directory, the search results page, the cuisine and category
landings, the home rails and one storefront's page.

**The whole of it in one line:** three tables of vocabulary, one flattened
projection of `Vendor` + `VendorBranch`, two fields computed per request, and one
authorization question — *may this caller see a storefront the public cannot?*

---

## 1. What it does, and what it deliberately does not

| Delivered | Where |
|---|---|
| The cuisine grid and the craving rail, with the keywords that make a tile a real query | `GET /catalog/cuisines`, `/catalog/categories` |
| The directory / search results / cuisine landing — one endpoint, fifteen facets, seven sorts, paged | `GET /catalog/vendors` |
| The two home rails | `GET /catalog/vendors/featured`, `/trending` |
| One storefront, with the merchant's and the platform desk's wider view of it | `GET /catalog/vendors/:slug` |
| Type-ahead for the search box | `GET /catalog/search/suggestions` |
| `isOpen`, from the branch's weekly grid read in the branch's own timezone | `modules/catalog/hours.js` |
| `distanceKm`, from the caller's coordinates | `modules/catalog/geo.js` |
| The browse taxonomy, seeded — deterministic, idempotent, reconciling | `npm run seed:catalog` |

| Not here | Whose it is |
|---|---|
| Menus, dishes, options, availability, stock | Module 5 — and the reason `services/catalog.ts::getVendorMenu` / `getPopularItems` / `getFoodBySlug` are still on the mock path |
| Dish results in the search payload (`SearchResults.foods`) | Module 5. §9 sets out what closing it costs |
| Writing any of it — creating a storefront, editing hours, approving a brand | Modules 15 and 21 |
| `SearchQueryLog` | Module 31, which is the module that must honour `saveSearchHistory` |
| Amenities, branch galleries, multi-branch selection | Module 15 (profile), module 6/7 (which branch an order is placed against) |
| Favourites, reviews, coupons on a card | Modules 18, 17 |

Nothing was added to the database. §7.

---

## 2. Architecture

```
GET /api/v1/catalog/vendors
      │
      ├── schemas.js          Ajv: the facet vocabulary, and the response filter
      ├── optionalUser        index.js — requireUser, with the refusal turned into anonymity
      ├── controller.js       builds `viewer` = { userId, canSeeAll, canAccessVendor }
      │                         canSeeAll ← fastify.mayAuthorize({ permission: "restaurants.view" })
      ├── service.js          normalise → filter → read → project → derive → filter → sort → page
      │     ├── hours.js      isOpen, and the fold back to WeeklyHours
      │     └── geo.js        distanceKm
      ├── repository.js       Prisma: where / select / orderBy, and the enum translation in
      └── PostgreSQL
```

Files, all under `backend/src/modules/catalog/`:

| File | Lines | What only it knows |
|---|---|---|
| `index.js` | 101 | assembly, `optionalUser`, and the refusal to start without modules 2 and 3 |
| `routes.js` | 65 | the seven routes and what each requires |
| `controller.js` | 98 | HTTP, and the viewer's rights |
| `service.js` | 579 | the product's rules: visibility, the two paths, relevance, projection |
| `repository.js` | 317 | Prisma vocabulary — `where`, `select`, `orderBy` |
| `schemas.js` | 292 | the wire contract, in both directions |
| `hours.js` | 267 | the local clock, the window arithmetic, `isOpen` |
| `geo.js` | 49 | haversine |
| `../../seed/catalog.js` + `data/catalog.js` | 138 + 176 | the taxonomy, copied from the frontend fixtures |

---

## 3. Entities

Every one already existed in `database/prisma/schema/catalog.prisma`.

| Model | Read for | Notes |
|---|---|---|
| `Cuisine` | the grid, the cuisine facet, text search over cuisine names | seeded by this module |
| `Category` | the craving rail | seeded by this module |
| `CategoryKeyword` | resolving a tile to vendors | seeded; `weight` is left at its column default |
| `Vendor` | the brand half of the read model | `commissionRate` is not selected — §6 |
| `VendorBranch` | the location half — address, hours, fees, radius, timezone | the **primary** branch only |
| `BranchHour` | `isOpen`, and the folded `hours` | several rows per weekday is the point |
| `BranchClosure` | `isOpen` | bounded to a three-day window per query |
| `VendorCuisine` | `cuisineIds`, the cuisine facet | filtered to non-deleted cuisines |
| `VendorDietary` | `dietary`, the dietary facet | |
| `VendorStaff`, `UserRoleAssignment`, `UserPermission` | who may see a hidden storefront | read **through module 3**, never directly |

### The brand/branch split, and why the read model is flat

`catalog.prisma` calls this its "one deliberate structural change": the frontend's
`Vendor` is a single flat storefront, the spec asked for restaurants *and*
branches, and both are honoured by splitting brand from location. This module is
where the two come back together — `service.js::project` is the
`toVendorModel(vendor, branch)` that file names, and it is the reason
`services/catalog.ts` needs no new type.

Two consequences that are rules rather than details:

- **A vendor with no live primary branch is not a listing.** There is no address,
  no hours, no fee and no coordinates, so there is nothing to render. It is
  excluded from every listing by the `where` (`branches: { some: { isPrimary … } }`)
  and is a 404 on the detail route, with a `warn` naming the vendor — a storefront
  minted without a location is an onboarding bug and this module should not paper
  over it.
- **Branch-level facets are asked of the primary branch specifically**
  (`some: { isPrimary: true, … }`), not of any branch. A bare `some` would let a
  second location's free-delivery threshold sell the first one's.

---

## 4. Endpoints

All under `/api/v1/catalog`. Every response is F1's envelope: `{ success: true, data }`
on success, the error contract on a 4xx/5xx. No route in this module returns an
*expected refusal* (`success: false` at 200) — a search with no results is an empty
list, not a refusal.

### `GET /cuisines`

| | |
|---|---|
| Auth | none |
| Authorization | none |
| Query | — |
| Response | `Cuisine[]`, ordered by `sort` then `name` |
| Errors | 500 |

### `GET /categories`

| | |
|---|---|
| Auth | none |
| Authorization | none |
| Query | — |
| Response | `Category[]` with `keywords: string[]`, ordered by `sort` then `name` |
| Errors | 500 |

### `GET /vendors`

The directory, the search results page and both landings.

| | |
|---|---|
| Auth | **optional** (`optionalUser`) |
| Authorization | `restaurants.view` — only for `?includeHidden=true` |
| Response | `Paginated<Vendor>` — `{ items, total, page, pageSize, hasMore }` |
| Errors | 400 (a facet outside its vocabulary; `sort=distance` or `deliverable` without coordinates), 401 / 403 (`includeHidden`), 500 |

| Query | Type | Meaning |
|---|---|---|
| `page`, `pageSize` | int | 1-based; `pageSize` ≤ 100, default 20 |
| `lat`, `lng` | number | the caller's position. Both or neither |
| `search`, `q` | string | free text. **Both are accepted and combined** — the directory calls it `search`, the results page calls it `q` |
| `type` | enum | `restaurant` · `cafe` · `cloud-kitchen` · `home-chef` · `catering` |
| `cuisineId` | id | `cus_…` |
| `cuisine` | slug | resolved to a row; a slug that names nothing narrows to nothing |
| `category` | slug | the tile behaves like a query over its keywords |
| `dietary` | enum[] | **every** tag, not any |
| `maxPrice` | 1–4 | ceiling on `priceLevel` |
| `minRating` | 0–5 | floor on `rating` |
| `maxEta` | int | ceiling on the *low* end of the ETA window |
| `openNow` | bool | derived — §5 |
| `freeDelivery` | bool | the branch has a `freeDeliveryOver` |
| `offersOnly` | bool | the vendor has a `promoLabel` |
| `supportsDelivery`, `supportsPickup` | bool | branch capability |
| `deliverable` | bool | the branch's `deliveryRadiusKm` reaches the caller. Needs `lat`/`lng` |
| `includeHidden` | bool | also `draft` · `pending` · `rejected` · `suspended`. Needs `restaurants.view` |
| `sort` | enum | `recommended` (default) · `relevance` · `rating` · `delivery-time` · `distance` · `price-low` · `price-high` |

### `GET /vendors/featured`, `GET /vendors/trending`

| | |
|---|---|
| Auth | none |
| Authorization | none — a rail never carries a storefront the public cannot order from, whoever asks |
| Query | `limit` (1–100, default 12), `lat`, `lng` |
| Response | `Vendor[]`, by rating |
| Errors | 400, 500 |

### `GET /vendors/:slug`

| | |
|---|---|
| Auth | **optional** |
| Authorization | public for `active`/`paused`; otherwise membership (module 3) **or** `restaurants.view` |
| Params | `slug` — `^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| Query | `lat`, `lng` |
| Response | `Vendor` |
| Errors | 400 (not slug-shaped), **404** for every refusal, 500 |

### `GET /search/suggestions`

| | |
|---|---|
| Auth | none |
| Authorization | none |
| Query | `q`, `limit` (1–20, default 8) |
| Response | `string[]` — vendor names first, then matching cuisine and category names. An empty `q` answers with the category rail |
| Errors | 400, 500 |

---

## 5. The two derived fields

BACKEND-REQUIREMENTS §3 row 4 asks for exactly these two and forbids storing
either. `catalog.prisma` gives the reasons from the schema's side; here is what
the code does with them.

### `isOpen`

`hours.js::isOpenNow`. Six ways a branch is shut, in the order they are asked:

| Condition | Reason logged | Why it is here |
|---|---|---|
| `Vendor.status !== active` | `vendor-<status>` | `paused` is the merchant's own brand-level switch, `suspended` is ours |
| `VendorBranch.status !== active` | `branch-<status>` | one location can be shut while the brand trades |
| `!acceptingOrders` | `not-accepting-orders` | the column's comment: closes it "regardless of opening hours" |
| `pausedUntil > now` | `paused` | the same, with an end time |
| a `BranchClosure` covers the branch's **local** date | `closure` | a holiday, a refit |
| the local clock is outside every window | `outside-hours` | |

The `reason` is for logs and tests. It never reaches the wire: the frontend's
`Vendor` carries a boolean, and a branch that is closed *because it was suspended*
must not announce that to a customer.

The local clock is `Intl.DateTimeFormat` with the branch's `timezone` — the tz
database Node already ships, so DST is handled and no dependency is added.
`hourCycle: "h23"` is load-bearing: without it midnight formats as hour 24 in
several locales and every "is it after opening" comparison inverts once a day.

Window arithmetic:

- a window is **half-open** — open at `openTime`, shut at `closeTime`, so 23:00 is
  when service stops rather than the last minute of it;
- `overnight` is trusted when set and **inferred** when a window's times cross
  midnight. A 23:00–02:00 row with the flag unset is a data error whose only sane
  reading is what the times say, and reading it as "closed all day" would shut a
  branch that is serving;
- an overnight window is also consulted on the **following** weekday, which is how
  01:00 on Saturday is inside Friday's 23:00–02:00 service;
- **every** window is consulted, including the second service of a split day.

`hours` on the read model is the fold back to `WeeklyHours` — seven named days,
because that is what the components index by. **A split day loses its second
window there**, since `types/common.ts::DayHours` holds one pair: the card reads
"12:00–15:00" for a branch whose dinner service the *open/closed* answer still
honours. Stated rather than hidden; §9.

An unknown timezone falls back to UTC and logs a `warn`. A mistyped `timezone`
(`VarChar(64)`, no CHECK) should read as slightly wrong hours, not as a discovery
endpoint that 500s.

### `distanceKm`

`geo.js::distanceKm` — haversine, rounded to one decimal, from `?lat`/`?lng` to
the primary branch's coordinates.

- **Straight-line, not routed.** `deliveryRadiusKm` is documented as a
  straight-line measure, `ZoneArea`'s centroids are the same, and the cards say
  "1.2 km" rather than "6 min by road". A routing provider is module 10's business
  if it is anyone's.
- **One decimal**, because that is what the cards render and because more would be
  a false claim: a branch's coordinates are its front door at best.
- **`null` when the caller sent no coordinates — never `0`.** A zero would read as
  "you are standing in the kitchen". This is the one declared delta from the
  frontend's type; §6.
- `sort=distance` and `deliverable=true` **refuse** (400) without coordinates
  rather than falling back to an arbitrary origin.

### Why two query paths, and what the bound costs

Neither field can be expressed in SQL, so a query that filters or sorts on either
cannot be paged by PostgreSQL:

| Path | When | How |
|---|---|---|
| **paged** | everything asked for is expressible — no `openNow`, no `deliverable`, and a SQL-sortable sort (`recommended`, `rating`, `price-low`, `price-high`) | `WHERE` + `ORDER BY` + `LIMIT/OFFSET`, plus one `count` |
| **scan** | `openNow`, `deliverable`, or `delivery-time` / `distance` / `relevance` | read the filtered candidates up to `CATALOG_SCAN_LIMIT` (500), derive, filter, sort and page in memory |

`delivery-time` is in the second list for a structural reason and not a
performance one: it orders by `etaMinMinutes`, a column on a to-many relation,
which Prisma cannot express in `orderBy`.

The scan is **bounded and reported**. Past the limit the service logs a `warn`
naming the query and `total` counts the scanned window rather than the catalogue —
a truncation nobody can see is a wrong answer that looks right. At this product's
scale (tens to hundreds of storefronts per city) it is never reached; the two
changes that would remove the bound are in §9.

---

## 6. Frontend contract

The seam is `frontend/services/catalog.ts` and `frontend/services/search.ts`, and
the read models are `frontend/types/catalog.ts` **unchanged**. The response
schemas in `schemas.js` are those interfaces field for field, which is what makes
the switch a change of transport and nothing else.

| Frontend | This API |
|---|---|
| `getCuisines()` | `GET /catalog/cuisines` |
| `getCategories()` | `GET /catalog/categories` |
| `getVendors(query)` | `GET /catalog/vendors` |
| `getTrendingVendors(limit)` | `GET /catalog/vendors/trending?limit=` |
| `getFeaturedVendors(limit)` | `GET /catalog/vendors/featured?limit=` |
| `getVendorBySlug(slug)` | `GET /catalog/vendors/:slug` |
| `getVendorCuisines(vendor)` | resolved client-side from `getCuisines()`, exactly as it is today |
| `search(query)` — the vendor half | `GET /catalog/vendors` with the same facets |
| `getSearchSuggestions(q, limit)` | `GET /catalog/search/suggestions` |
| `getVendorMenu`, `getPopularItems`, `getFoodBySlug` | **module 5** |
| `getVendorSlugs()` | stays synchronous and stays on the mock list — it feeds `generateStaticParams` and cannot fetch |

### Three deltas, all deliberate

1. **`distanceKm` is `number | null` here and `number` there.** A caller that sent
   no coordinates is told "unknown" rather than "zero". The frontend never sees a
   null in practice — `services/catalog.ts` always sends `DEFAULT_ORIGIN` — and if
   it switches, the narrowing belongs at the boundary beside the one `etaMinutes`
   already does (`toVendor`).
2. **`commissionRate` is not returned at all.** A negotiated rate is a term of a
   merchant's contract, and a public discovery endpoint carrying it hands every
   competitor the platform's pricing. The frontend's own live selection set
   (`lib/graphql/catalog.operations.ts::VENDOR_FIELDS`) already omits it, and the
   surfaces that legitimately need it — the merchant's statement, admin settlement —
   are module 12's. `lib/settlement.commissionRateFor` already resolves `null` to
   the standard rate for a type, so a card that reads the field gets the right
   answer today.
3. **`Category.keywords` comes back ordered by weight then term**, not in the
   order the fixture listed them. Nothing consumes the order — the frontend
   matches against the array — and `CategoryKeyword.weight` exists precisely to
   make ranking explicit rather than positional.

### The live flag, and why it must be `0`

`NEXT_PUBLIC_BACKEND_CATALOG` must stay **`0`**, for the same reason M2 gives for
`NEXT_PUBLIC_BACKEND_AUTH`: `services/catalog.ts` issues **Apollo GraphQL**
documents through `lib/graphql/execute`, and this API is REST. With the flag on,
every catalog read posts a GraphQL query to an endpoint that does not exist, fails,
and — because `NEXT_PUBLIC_BACKEND_FALLBACK` defaults to on — silently serves the
mock body while logging one `console.error` per read. Working, slower, and
misleading.

`frontend/.env.local` had it at `1`, pointing at the deleted NestJS API (A1/A2 in
`Analysis.md`). **It is now `0`** — a one-line change to an untracked local
development file, and the only frontend change this module makes. No component,
route, type or service body was touched.

What closing the delta needs is a transport swap in `services/catalog.ts` — the
same shape as M2's — and the A4 keep-or-excise decision on `frontend/lib/graphql/`,
which is still a frontend phase's call.

---

## 7. The database

**No schema change. No migration.** Module 4 is implementable entirely against
the schema as committed, which is what the audit asked to be established before
anything was written:

- the brand/branch split already carries every field the flat read model needs;
- `BranchHour` already models a window per row, which is what a split service and
  an overnight service both need;
- `CategoryKeyword` already exists, normalised, "so search can index and score the
  terms" — which is exactly what the category facet does with it;
- `deliveryRadiusKm`, `acceptingOrders`, `pausedUntil` and `BranchClosure` already
  express every way a branch is shut;
- `restaurants.view` is already one of the twenty seeded permissions.

`prisma migrate status` is unchanged at four migrations, and `prisma validate`
passes.

### Reference data this module seeds

`npm run seed:catalog` — `src/seed/catalog.js`, over `src/seed/data/catalog.js`,
which is copied from `lib/mock/cuisines.ts` and `lib/mock/categories.ts`. **66
rows: 8 cuisines, 10 categories, 48 category keywords.**

It is a *second* seeder rather than eleven more tables inside
`seedReferenceData`, and that is an operational choice: module 1's seeder is the
one a production deployment must run before anything works at all (`User.countryCode`
has nowhere to point without it), and keeping that surface exactly as module 1
verified it is worth more than one command instead of two.

It keeps the three properties module 1's has, and adds one:

- **deterministic** — `deterministicId(prefix, slug)`, so `pizza` is the same
  `cat_…` in every database that has run it;
- **idempotent** — upsert on the natural key; the second run changes nothing;
- **safe on a live database** — the `update` half refreshes the definition and
  never touches `deletedAt`;
- **reconciling** — a keyword removed from the source is *deleted*. A tile that
  kept matching on a word nobody can find in the source is worse than one that
  matches on fewer. `category_keywords` is a pure join table with no `deletedAt`,
  so the delete is a real one.

Why this is reference data and not demo data: a cuisine has no owner, no money and
no lifecycle — it is a vocabulary term `VendorCuisine` points at, the way `TaxRule`
is one an order points at. There are still no restaurants, menus or orders in any
seeder.

### Constraints and conventions honoured

| Obligation | How |
|---|---|
| **Soft delete** | the extension filters top-level reads; every nested `include` of a soft-deletable relation carries its own `deletedAt: null`, because the extension cannot see them. A deleted vendor is a 404 for everyone, super-admin included |
| **Enum translation** | `toDbEnum` on everything going into a query, `toApiEnum` on everything coming out. The column reads `cafe`, the client says `CAFE`, the wire reads `cafe` |
| **Money** | `Decimal` → `number` at the boundary only, through `toJsonSafe` |
| **Ids** | `deterministicId` for the taxonomy; `cus_` and `cat_` registered in `id-prefixes.js`. `ven_` and `vbr_` are **not** registered — this module reads storefronts and never mints one, and the registry is the record of what is written, not a wish list |
| **Optimistic locking** | nothing to lock: no write path. The suite asserts `version` is still 0 on every fixture after the whole run |
| **Transactions** | one, in the seeder. All of the taxonomy or none of it — a run that failed halfway would leave a tile matching half its keywords |
| **Raw SQL** | none |

---

## 8. Authorization

Module 3's infrastructure, used and not re-implemented. There is no role check
anywhere in `service.js` — the service is handed three plain values and cannot
reach for a claim:

```js
viewer = { userId, canSeeAll, canAccessVendor(vendorId) }
```

- `canSeeAll` ← `fastify.mayAuthorize(request, { permission: "restaurants.view" })`,
  which resolves `role grants ∪ direct grants − denials` **from the database**;
- `canAccessVendor` ← `fastify.authz.vendorAccess(userId, vendorId)`, which is the
  three memberships the schema models: owner, *active* staff, or a vendor-scoped
  assignment.

A function rather than a resolved list, because the answer is only needed for the
one vendor a detail request names; asking per card would be one query per card.

### Visibility

| Caller | Listing | One storefront |
|---|---|---|
| anonymous | `active` + `paused`, with a live primary branch | the same set; anything else **404** |
| any signed-in account | the same | the same, plus any vendor they are a member of, in any status |
| `restaurants.view` | the same, plus `?includeHidden=true` for all six statuses | any vendor, in any status |
| anybody | — | a **soft-deleted** vendor is 404. Always |

`paused` is listed and shown closed rather than hidden: it is the merchant's own
switch, and a customer is better served by "this place exists and is closed" than
by a restaurant that vanished. `isOpen` is `false` for it, whoever is looking.

### Two refusal shapes, and why they differ

- **`GET /vendors/:slug` refuses with 404, never 403.** A `pending` application's
  slug is a fact about a business that has not opened; a 403 confirms it exists to
  anyone who guessed the name. This is the `hide: true` behaviour module 3
  implements for a route parameter, applied here in the service because the vendor
  is found by slug rather than named by the route.
- **`?includeHidden=true` refuses with 401 or 403**, and names the permission it
  wanted. That hides nothing: the *existence* of hidden storefronts is not a
  secret, only which ones they are, and the refusal names no vendor. It is refused
  rather than silently narrowed, because a caller who asked to see draft
  storefronts and was handed the public list would conclude there are none.

### Optional authentication

`index.js::optionalUser` is `fastify.requireUser` with the exception turned into
anonymity. Neither existing guard fits: `requireUser` throws, so a signed-out
customer could not browse; F1's `optionalAuth` is claims-only, so a suspended
merchant would keep their elevated view for the fifteen minutes the token stays
signed — which is the exact window `requireUser` exists to close.

So an expired, revoked or forged token, a suspended account or a deleted one
**answers the public catalogue at 200**, and nothing is *granted* by the swallow:
every widening depends on `request.account`, which only a successful `requireUser`
sets. The failure is logged at `debug`, so "why can I not see my own pending
storefront" is answerable.

The two routes that can widen run it. The other five do not run it at all.

---

## 9. Known limitations and deferred work

| # | Limitation | The change that closes it |
|---|---|---|
| 1 | Dish results are missing from search. `services/search.ts::SearchResults.foods` has no server behind it | Module 5. Availability is "merchant switch AND (untracked OR in stock)", which is that module's rule, and answering it here would mean implementing it twice |
| 2 | Free text is `ILIKE '%term%'` — a sequential scan | `CREATE INDEX vendors_name_trgm ON vendors USING gin (name gin_trgm_ops)` and the same on `tagline`. `pg_trgm` and `unaccent` are already installed by the baseline migration; the index is a migration this module did not need and therefore did not make |
| 3 | The derived path scans up to `CATALOG_SCAN_LIMIT` and reports a truncated `total` past it | Two changes, together: a generated `isOpen`-adjacent column or a materialised view for the hours arithmetic, and PostGIS (or a `<->` operator on a geometry column) for distance. Both are schema changes with a real dataset behind them, not this module's call |
| 4 | A split service shows only its first window in `hours` | `types/common.ts::DayHours` holds one pair. Widening it to `DayHours[]` is a frontend type change, so it goes with the phase that redesigns the hours card |
| 5 | `featured` and `trending` are reserved slugs — a vendor called `featured` is unreachable | Nothing, unless one appears. The alternatives (`?rail=`, a second prefix) each cost more than this sentence |
| 6 | No HTTP caching headers. The taxonomy changes on a deploy and is re-read per request | `Cache-Control` on the two taxonomy routes. F1 has no convention for it yet, and inventing one in a business module is the wrong place |
| 7 | `Category.parentId` — the two-level browse tree — is read but never used | The column exists for a second level the product does not have |
| 8 | Nothing is written to `SearchQueryLog` | Module 31, which owns `saveSearchHistory` |
| 9 | Multi-branch merchants are projected through their **primary** branch only | Which branch an order is placed against is module 6/7's question; a branch picker is module 15's surface |
| 10 | `NEXT_PUBLIC_BACKEND_CATALOG` stays `0` — the frontend still speaks GraphQL | A transport swap in `services/catalog.ts`, plus the A4 decision on `lib/graphql/` |

---

## 10. Tests

| Suite | What | Assertions |
|---|---|---|
| `tests/catalog-derivation.test.js` | `hours.js` and `geo.js`, no database, frozen clocks | **34** |
| `tests/catalog.test.js` | the routes and the service, against real PostgreSQL | **81** |
| `scripts/catalog-flow.js` | the discovery journey over a real socket, rate limiter on | **49 checks** |

`npm test` — **330** assertions across 50 suites (215 before this module).
`npm run verify` = `db:validate` + `check:forbidden` + `test` + `auth:flow` (51) +
`catalog:flow` (49).

Nothing is mocked. The taxonomy is the one the seeder writes; the storefronts are
rows created for the run and hard-deleted after it through `$unfiltered()`.

**Why both an inject suite and a service suite.** The routes are how the response
schema, the `preHandler` and the error contract get exercised at all. The service
is how the clock gets frozen: `listVendors(query, { now })` takes the instant as an
argument precisely so that "open at 01:00 on an overnight service" is a statement
about the database rather than about whenever CI happened to run.

### The matrix that matters

| Case | Covered by |
|---|---|
| unauthenticated | every public route answers 200; `includeHidden` answers 401 |
| authenticated but unauthorized | a customer: 403 on `includeHidden`, 404 on a pending storefront |
| authorized | `customer-support` (which the seeder grants `restaurants.view`) sees all six statuses |
| correct resource owner | the owner reaches their own `pending` storefront |
| incorrect resource owner | another merchant's owner gets 404, and is told nothing |
| vendor scope, correct | active staff reach it; a vendor-scoped `UserRoleAssignment` reaches it |
| vendor scope, incorrect | the same assignment does not reach a *different* vendor |
| staff scope | `invited` and `inactive` staff grant nothing |
| blocked / suspended account | a suspended owner loses the merchant view within the token's lifetime |
| revoked session | the same, with the access token still signed and unexpired |
| deleted resource | a soft-deleted vendor is 404 for everyone and absent from `includeHidden` |
| privilege escalation | a **validly signed** token carrying `permissions: ["restaurants.view"]` and `roles: ["super-admin"]` is refused — the claim is not a grant |
| role revoked mid-session | deleting the assignment refuses the *same* token on the next request |
| validation | every facet outside its vocabulary, a slug that is not slug-shaped, an undeclared parameter dropped, coordinates required where they are |
| state transitions | there are none to test — this module has no write path. What is tested instead is that reading wrote nothing: `version` is 0 and `updatedBy` is null on every fixture afterwards |
| idempotency | reads are naturally idempotent; the seeder is asserted to be, including reconciling a term added behind its back |

---

## 11. Observability

`fastify.log`, through the request context F1 established. Four events, none of
them per-request noise:

| Level | When |
|---|---|
| `warn` | the derived-filter scan hit `CATALOG_SCAN_LIMIT` — with the sort and the filters that caused it |
| `warn` | a branch's `timezone` is not a zone this runtime knows — with the vendor and branch id |
| `warn` | a vendor has no live primary branch and cannot be rendered — with its slug |
| `debug` | a bearer token was not usable and the request was answered as anonymous |

Nothing logs a query string wholesale, a caller's coordinates or a resolved
permission set. There is nothing sensitive in a cuisine list, and a customer's
position is the one thing a discovery log could leak that they did not publish.

---

## 12. Recommended next

**Module 5 — menu & inventory.** It is the next row in §3, it is what §9 item 1
needs, and it is the other half of every storefront page this module now answers:
`services/catalog.ts` has three functions still on the mock path and they are all
module 5's.

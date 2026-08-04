# V1 Unit 1 — the catalog read side

Follows [Unit 0](./V1-unit0-cutover.md). Replaces the mock catalog in
[`services/catalog.ts`](../../frontend/services/catalog.ts) with seven GraphQL queries,
behind a flag that is off by default.

Scope was fixed by the approval: **the catalog domain only** — restaurants, branches,
categories, menus, foods, variants and add-ons. No cart, checkout, orders, delivery,
payments, notifications or inventory.

---

## 1. What changed

| Area | Change |
| --- | --- |
| `backend/src/modules/catalog/**` | New module: 15 files, Clean Architecture, read-only |
| `backend/src/shared/enums/catalog.ts` | `VENDOR_TYPES`, `DIETARY_TAGS`, `WEEKDAYS`, `VENDOR_SORTS` |
| `backend/src/graphql/scalars.registry.ts` | `VendorType`, `DietaryTag`, `VendorSort` scalars |
| `backend/src/common/pagination/page.types.ts` | `Paginated(classRef, name?)` — so the page type is `VendorPage`, not `VendorModelPage` |
| `backend/schema.gql` | +8 types, +2 scalars, +2 inputs, +7 queries |
| `backend/scripts/seed-demo.ts` | New — demo accounts, then the whole catalog |
| `backend/scripts/seed-order-demo.ts` | New — declared, deliberately empty |
| `backend/scripts/verify-catalog.ts` | New — 107 offline assertions |
| `backend/scripts/data/catalog-demo.json` | Generated from the frontend mock |
| `frontend/scripts/export-catalog.ts` | New — generates the above |
| `frontend/lib/graphql/execute.ts` | New — Apollo in the browser, `fetch` on the server |
| `frontend/lib/graphql/catalog.operations.ts` | New — 9 typed documents |
| `frontend/config/backend.ts` | One flag per backend slice, not one per release |
| `frontend/services/catalog.ts` | Each function branches on `LIVE.catalog`; **every signature unchanged** |

**No component, route, page, hook or TypeScript interface changed.** The only edited
frontend files are `config/backend.ts`, `services/catalog.ts`, the operations barrel,
`package.json` and `.env.example`.

---

## 2. The queries

```graphql
cuisines: [Cuisine!]!
categories: [Category!]!
vendors(query: VendorQueryInput, page: PageInput): VendorPage!
vendor(slug: String!): Vendor
vendorMenu(vendorId: ID!): [MenuSectionWithItems!]!
popularItems(vendorId: ID!, limit: Int = 6): [FoodItem!]!
food(slug: String!): FoodItem
trendingVendors(limit: Int = 8): [Vendor!]!
featuredVendors(limit: Int = 6): [Vendor!]!
```

All `@Public()`. That is load-bearing rather than lax: the landing page, the directory
and a restaurant's menu are what a search engine indexes and what a first-time visitor
sees. The guard chain is global, so *omitting* `@Public()` is what would break the site.

`vendorSlugs` was written and then removed. `getVendorSlugs()` is **synchronous** —
`generateStaticParams` calls it — so it cannot fetch, and making it async would change
a page. Keeping the query would have left surface with no caller.

### The wire shape is the frontend's shape

`hours` is an object of seven named weekdays because `WeeklyHours = Record<Weekday,
DayHours>` and the components index it by key. A list of `{ weekday, open, close }`
would be the better schema and the wrong one. `etaMinutes` is `[Int!]!` because GraphQL
has no tuple; it is narrowed to `[number, number]` once, in `services/catalog.ts`.

---

## 3. Three decisions worth arguing about

### 3.1 `isOpen` is derived, not stored

The mock's `Vendor.isOpen` was a boolean field. A boolean field has to be *written* by
something, on a schedule, in every timezone the platform serves — so
[`policies/opening-hours.ts`](../../backend/src/modules/catalog/domain/policies/opening-hours.ts)
derives it instead, and four things make that more than a comparison:

- **The branch's timezone, not the server's.** A Dhaka kitchen closes at 23:00 Dhaka
  time whether the API runs in Dhaka or Frankfurt.
- **Several windows per day.** A split lunch/dinner service is two rows for one weekday,
  which a single `DayHours` cannot express. The table is the truth; `toWeeklyHours`
  projects the frontend's shape out of it, showing the first sitting.
- **Windows that cross midnight.** A 23:00–02:00 service is open at 00:30 — and at 00:30
  the *current* weekday's rows say nothing about it, because the window belongs to
  yesterday. This is the classic version of this bug and it has its own assertion.
- **Reasons other than the clock.** The merchant's kill switch, a pause, a dated closure
  and a suspended status each close a branch the grid says is open.

The seeder maps a mock `isOpen: false` onto `acceptingOrders: false`, so the seeded
directory looks like the mock one instead of a vendor the mock showed as closed
appearing open because its grid happens to cover right now.

### 3.2 `distanceKm` is a property of a *pair*

`catalog.prisma` refuses to store it — "DERIVED, NEVER STORED" — because how far a
restaurant is depends on who is asking. So `VendorQueryInput` takes an `origin` and the
service computes a haversine distance; with no origin the field is `0`.

Until the app has geolocation, `services/catalog.ts` passes a constant
(`DEFAULT_ORIGIN`, Gulshan 1) so the cards read as they always have. The mock's fixed
`distanceKm: 1.2` values were standing in for exactly this.

### 3.3 Filtering and sorting happen in the application layer, above a capped read

Three of the six list operations cannot be expressed in the query, and the reason is the
brand/branch split the schema chose deliberately:

- `openNow` is the whole `isOpenNow` computation. Not a `WHERE` clause.
- `sort: "delivery-time"` orders by `etaMinMinutes`, which is on `vendor_branches` —
  Prisma cannot `orderBy` a to-many relation's column.
- `sort: "distance"` orders by a value that does not exist until the origin is known.

So the repository narrows what SQL can narrow (type, cuisine, name/tagline search,
status, tombstones) and returns a **capped candidate set** — `CANDIDATE_CAP = 500`,
rating-first so a truncated set holds the best rows — which
[`policies/listing.ts`](../../backend/src/modules/catalog/domain/policies/listing.ts)
finishes.

**Above the cap, `total` is a floor and late pages may be short, and the service logs a
warning saying so.** The fix when a market outgrows 500 active vendors is a materialised
listing projection (denormalised ETA and fee, a PostGIS point), not more application-layer
sorting. Every sort ends in an `id` tie-break, so two identical requests agree and page 2
cannot drop a row page 1 showed.

---

## 4. Seed data, in three files

The split is along *can you delete it*:

| Script | Contents | Safe to re-run? |
| --- | --- | --- |
| `seed:reference` | currencies · countries · languages · roles · permissions | Yes — upserts, never deletes |
| `seed:demo` | the 4 demo accounts, then the whole catalog | Yes — upserts on primary keys |
| `seed:order-demo` | carts · orders · deliveries | **Declared, empty.** See below |

Reference data is load-bearing: `User.countryCode` is a non-null FK onto `countries`, so
an empty reference set means no account can be created by any means. A production install
runs the first and neither of the others.

`seed:order-demo` is separate because it is the only one that is genuinely dangerous to
re-run. A catalog row describes a thing that exists, so upserting it twice is harmless.
An order is a **financial document** with a ledger entry, a payment intent and an
append-only event log behind it — `stock_movements` and `order_events` are append-only
precisely to stop history being rewritten. Whatever it grows into has to reconcile rather
than upsert, and mixing that with a catalog upsert would make the safe seeder inherit the
unsafe one's caveats. It exits 0 so a bring-up script that calls all three does not fail
on the one waiting for its unit.

### The data is generated, not transcribed

`frontend/bun run export:catalog` writes `backend/scripts/data/catalog-demo.json` from
`lib/mock/*`: **23 vendors · 50 sections · 75 dishes · 7 option groups · 18 options · 8
cuisines · 10 categories · 4 accounts.**

`seed-reference.ts` copies its five countries by hand and says why — the two packages do
not share a build. That argument holds for a dozen rows and not for a thousand values: a
thousand hand-copied values is a thousand chances for the seeded catalog to differ from
the mock in one price or one slug, which surfaces as a UI that changes when the flag is
flipped. What the seeder owns is the *structure* — splitting a flat `Vendor` into a brand
and a branch, folding `WeeklyHours` into rows, deriving a timezone from `countries` —
because that belongs next to the schema.

The mock's ids are used verbatim (`ven_bella_napoli`, `sec_bella_pizzas`,
`food_pizza-margherita`) rather than minted, so a re-run updates in place and any cart a
browser has in `localStorage` still names dishes that exist.

### The demo accounts are the one thing here that is not catalog data

`Vendor.ownerId` points at `usr_owner`, and the vendor dashboard loads "my restaurant"
through it — a catalog seeded without those accounts has a dangling owner on the one
storefront anybody demonstrates. They are hashed with Argon2id through the container's
own hasher (not a pasted hash, which silently stops matching when `argon2.memoryCost`
changes) and **a re-run does not reset a password**, because somebody demonstrating the
platform may have changed it.

This also unblocks Unit 0's outstanding item: with `seed:demo` run,
`NEXT_PUBLIC_BACKEND_AUTH=1` has real accounts to sign in as.

---

## 5. Frontend

### Two transports, one function

The catalog's callers are mostly **Server Components** (landing page, directory,
restaurant detail, QR menu) with two client components (`admin/live-ops`,
`dashboard/menu-manager`). One `services/catalog.ts` serves both, and the right answer
differs per side:

- **Browser → Apollo.** The Unit 0 decision holds: Apollo owns server state, Zustand owns
  UI state. `fetchPolicy: "cache-first"`.
- **Server → `fetch`.** A module-scope Apollo client on the server is shared between
  concurrent requests, so its cache would leak one visitor's data into another's response.

`lib/graphql/execute.ts` branches on `typeof window` and reaches `./client` — a
`"use client"` module — through a lazy `import()` that only ever runs in the browser.
`services/catalog.ts` imports `./execute` and `./catalog.operations` **directly rather
than through the `lib/graphql` barrel**, because the barrel re-exports the client.

No caching in `execute`. These are POST requests, which Next neither memoizes nor caches,
and that is the behaviour to want: `isOpen` is derived per request, so a cached listing is
a listing that lies about which kitchens are taking orders. The cache worth having is
`catalog:rails` in Redis — one cache, server-side, shared by every reader, 15 minutes.

### Independent flags per slice

```ts
LIVE = { auth, catalog, cart, orders, delivery, notifications }
```

A single `NEXT_PUBLIC_BACKEND=1` would mean the first slice with a problem takes every
other slice down with it. `catalog` does not depend on `auth`: the catalog is public, and
a catalog that only worked once somebody had signed in would be the wrong shape of
dependency.

### Failures are loud

The mock layer cannot fail, so the catalog services have no error channel in their
signatures — `getVendors()` returns a page, not a `Result`. Inventing one would change
every call site. So a live catalog that cannot be read **throws**
`GraphqlTransportError`, whose message names the flag and the URL. See §8 for what that
looks like on screen, which is not good enough yet.

---

## 6. Verified

Everything below was run.

| Check | Result |
| --- | --- |
| `database: prisma validate` | valid |
| `backend: typecheck` · `lint` | clean |
| `backend: verify:auth` | 153 assertions, 0 failed |
| `backend: verify:core` | 169 assertions, 0 failed |
| **`backend: verify:catalog`** | **107 assertions, 0 failed** |
| `backend: schema:check` | up to date, 35164 bytes |
| `frontend: typecheck` · `lint` | clean |
| `frontend: verify:graphql` | 16 operations validated (7 auth + 9 catalog), 0 failed |
| `frontend: build`, flag **off** | ✓ compiled in 7.3s, no warnings |
| `frontend: build`, flag **on** | ✓ compiled in 7.5s — no route prerenders catalog data, so a build needs no API |
| dev server, flag **off** | 8/8 routes 200; "Bella Napoli", "Burger Lab", "Margherita DOP" all render |
| `CatalogModule` boot | the three `assertVocabularyMatches` calls pass against the real Prisma DMMF |

### Against the running API (no database)

| Query | Result |
| --- | --- |
| `cuisines` | `SERVICE_UNAVAILABLE` / `dependency: database` at path `["cuisines"]` — schema-valid, reached the resolver |
| `vendors` with type + search + openNow + distance sort + origin + page | same — the whole argument surface parsed and reached the resolver |
| `vendors(query: { type: "brasserie" })` | `BAD_USER_INPUT`, `Expected VendorType to be one of: restaurant \| cafe \| cloud-kitchen \| home-chef \| catering` |
| a 300-character `search` | `errors.invalidInput`, issue at `query.search` |
| `origin: { lat: 900 }` | `errors.invalidInput`, issue at `query.origin.lat` |

### Server-Component transport, flag on

Serving the production build with the API up and no database produced
`GraphqlTransportError` for `TrendingVendors`, `Vendors` and `VendorBySlug` — which is
the proof that mattered: **`services/catalog.ts` ran inside the server bundle, took the
`fetch` branch, and reached the real API.** The lazy `import("./client")` did not drag
Apollo into the server graph.

### The 107 assertions

`bun run verify:catalog` covers, with no database:

- **"HH:mm" parsing** (9) — including that midnight is `0` and not a falsy null.
- **The weekly grid** (6) — split services, null windows, missing weekdays, Monday-first
  key order.
- **Local moment** (6) — the same instant is Tuesday 00:30 in Dhaka and Monday 19:30 in
  London.
- **`isOpenNow`** (16) — inside/before/after, overnight in both directions, a close time
  before the open time without the flag, only *yesterday's* overnight window carrying
  over, kill switch, live and expired pause, suspended status, three closure cases, the
  Dhaka/London split, and no hours at all.
- **Distance** (5) — Gulshan 1 → Banani is 1.8 km, → Dhanmondi 27 is 5 km, symmetry, and
  no origin meaning `0` rather than `NaN`.
- **Ordering** (9) — all four sorts, the fallback, `id` tie-breaks, `openNow` semantics.
- **The directory through the real `CatalogService`** (28) — an in-memory repository
  behind the real port, exercising pagination (first/last/past-the-end, every vendor
  visited exactly once), search by name and tagline, case-insensitivity, whitespace-only
  search not reaching the database, each filter, filters composing, origin and distance
  sort, rail clamping, and the rails cache being written once.
- **The seeder's input** (26) — every referential and column-width constraint Postgres
  would enforce, asserted against the generated dataset: dangling sections, dishes in
  another vendor's section, unknown cuisines, `VarChar(40)` on every id *including the
  ones the seeder derives*, unique slugs and emails, vocabulary membership, all seven
  weekdays present, every time parseable, two-entry ETAs, `spicyLevel` in 0–3, and every
  image an `https` URL within `VarChar(500)`.
- **Vocabulary drift** (2) — the three catalog enums against Postgres, plus a deliberate
  mismatch to prove the check fails.

---

## 7. Not verified

**This machine has no PostgreSQL, and Docker is not installed.** Redis *is* installed
(`/opt/homebrew/bin/redis-server`) but was not started.

So, unchanged from Unit 0 and now the blocking item:

- The migration has still never been applied.
- `seed:reference` has still never run; `seed:demo` has never run.
- **No catalog query has ever returned a row.** The SQL — the `where` builders, the
  four-level nested `include`, the partial unique index behind "exactly one primary
  branch" — is typechecked and nothing more.
- No sign-in has ever completed.
- The **browser** transport (Apollo, `cache-first`) is typechecked but never executed;
  its two call sites are behind authenticated routes.

Standing up Postgres would close all of it. It needs `brew install postgresql@17`, which
is a change to the machine and therefore the user's call.

---

## 8. Known gaps

**A live catalog with the API down renders chrome and nothing else.** There is no
`error.tsx` anywhere in `app/`, so when a streamed segment throws, the shell has already
flushed: the response is **200** with a header and footer and an empty middle. The error
*is* loud in the server log and correctly attributed, but the page does not say so. The
fix is one new file (`app/error.tsx`, ~30 lines using existing i18n keys and tokens) —
left out because it is new UI, and "do not change any UI" is the standing rule.

**Category tiles lose their CMS overrides while the flag is on.** Since C26 categories
are CMS documents, so an operator can rename or reorder a tile on their own device
(`options.ctx`). With `LIVE.catalog` on, `getCategories` reads the API and ignores those
options. Nothing is lost in *translation* — category names carry no `fallbacks` key, so
the `translate` option never resolved anything for them either — but the editor is inert
until the CMS module makes `Category` writable.

**`FoodItem.isAvailable` is the merchant's switch only.** The schema documents the rule as
`isAvailable AND (inventory is null OR inventory.inStock)`. The second half needs the
inventory module, which is explicitly out of scope, and half a stock rule is worse than
none: it would read as enforced while a branch with no `InventoryItem` row silently
bypassed it.

**No `FoodCategory` links.** The mock maps categories to dishes by keyword, not by id, so
there is nothing to seed into the join table. Category-scoped coupons and offers need it;
whoever owns them owns populating it.

**Zod bound messages are prose, not i18n keys.** The pipe's convention is that a Zod
message is a key the frontend renders. `VendorQuerySchema`'s bounds use Zod's defaults
("Too big: expected string to have <=120 characters") because no UI control can produce a
300-character search or a latitude of 900 — the top-level `errors.invalidInput` *is* a key,
and adding three more that nothing renders would be worse.

**`bun run start:dev` still rewrites `schema.gql`, and it bit again during this unit.**
`nest-cli.json` enables the `@nestjs/graphql` plugin with `introspectComments: true`, a
Nest CLI transformer that `bun run scripts/emit-schema.ts` does not get — so the running
server writes a *different* file and the next `schema:check` fails on drift that is not
drift. Reported in Unit 0 with three options and still open; the sharpest fix is that
**the server should not write a committed artefact at all** — give `autoSchemaFile` an
in-memory or scratch path unless an emit flag is set, leaving `schema:emit` as the only
writer. Out of Unit 1's scope (it is `graphql.module.ts`, not catalog), so it is left for
a decision. Workaround: re-run `bun run schema:emit` after `start:dev`.

---

## 9. Bring-up, once a database exists

```bash
# Postgres + Redis by whatever means (Docker compose file is in docker/)
cd database && bun run migrate:deploy
cd ../backend && bun run seed:reference && bun run seed:demo
cd ../backend && bun run start:dev

cd ../frontend
cp .env.example .env.local          # then set NEXT_PUBLIC_BACKEND_CATALOG=1
bun run dev
```

The eight checks that then become possible, in order: `cuisines` returns 8 rows ·
`/restaurants` lists 23 vendors · a search narrows it · each filter narrows it · page 2
holds different vendors than page 1 · `/restaurants/bella-napoli` renders its hero, hours
and menu · the Margherita's Size group shows Regular and Large · images load from the same
Unsplash URLs the mock served.

---

## 10. Next: Unit 2

Not started, and waiting on approval. The natural next slice is search
(`services/search.ts` still reads `lib/mock/vendors` and `foods` directly, and
`category_keywords` was seeded specifically to serve it), or cart and checkout if the
demo script matters more than discovery.

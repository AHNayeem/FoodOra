# V1 Unit 2 — the cart

**Status:** done, 2026-08-04. Builds on [Unit 1](./V1-unit1-catalog.md).

Scope was fixed by the approval: **the cart domain only** — cart, cart items, add, remove,
update quantity, clear, vendor validation, variant selection, add-on selection. No checkout,
orders, delivery, payments, notifications or wallet. Four cross-cutting items were approved
alongside it and are covered here too: Redis caching for catalog reads, env-configurable
search limits, distance behind a routing interface, an error boundary, and request timeouts
with graceful fallback.

---

## 1. The headline: there is a database now

Unit 1 shipped with one caveat above all others — *no catalog query had ever returned a row*.
That is closed. PostgreSQL is up, the baseline migration is applied, both seeders have run,
and every claim below was checked against real data.

Two things were discovered in the first ten minutes of having a database, and neither could
have been found without one:

### The migrations were in the wrong directory

`database/prisma/migrations/` — the documented layout for a multi-file schema — is **not**
where Prisma 6.19 looks when `schema` points at a folder. It resolves migrations to
`<schemaFolder>/migrations`, i.e. `prisma/schema/migrations/`, while printing the
conventional label `prisma/migrations` in its output. The result was the worst possible
failure mode:

```
No migration found in prisma/migrations
No pending migrations to apply.
```

`migrate:deploy` reported success, applied nothing, and left `_prisma_migrations` empty. A
deploy pipeline would have gone green against an empty database. The migration files moved
to `prisma/schema/migrations/`; their contents are untouched, so the baseline is still
exactly as generated.

### `cart_items.id` collided across baskets

The schema declares the cart-line id as a global primary key with the composite line id
(`food id + sorted option ids`) as its value. That value is only unique *within* a basket.
Two customers who both order a large Margherita compute the identical
`food_pizza-margherita|marg_large`, so the upsert that is supposed to merge a line found the
*other person's* row and incremented it — one basket silently grew, the other stayed empty.

Storage now keys lines as `<cartId>#<lineId>` while the wire keeps the bare line id, so
`types/cart.ts::CartLine.id` is unchanged. A composite `@@id([cartId, id])` is the better
schema and is also a migration that changes `cart_item_options`' foreign key; that is worth
doing when the orders unit is already touching these tables.

This is the clearest argument for the live harness that exists: no in-memory fake can
reproduce it, because a `Map` keyed per owner already has the scoping the database does not.

---

## 2. What the cart is

Five operations, all `@Public()`:

| Operation | Frontend seam |
| --- | --- |
| `myCart(guestKey)` | `stores/cart.ts` rehydration |
| `addToCart(input)` | `stores/cart.ts::add` / `confirmSwitch` |
| `updateCartItem(input)` | `stores/cart.ts::setQuantity` |
| `removeCartItem(input)` | `stores/cart.ts::removeLine` |
| `clearCart(guestKey)` | `stores/cart.ts::clear` |

Public because **a basket predates a customer**. The prototype lets an anonymous visitor
browse, configure a dish and fill a cart, and only asks who they are at checkout. Public
does not mean unowned: every operation resolves an owner first, and precedence runs one way
only — an authenticated request uses the actor's id and **ignores `guestKey` entirely**. If
the key could override the actor, anyone could read a basket by replaying a key they had
seen; if it merely supplemented the actor, a customer signing in on a second device would
find their cart empty because the key belongs to the first browser.

A request with neither is `UNAUTHENTICATED`, not an empty cart — "you did not say who you
are" and "your basket is empty" are different facts.

---

## 3. Three decisions worth arguing about

### The client may not state a price

`AddToCartInput` has no `unitPrice`, no `basePrice`, no option `name` and no `priceDelta`,
even though the frontend knows all of them. The server takes `foodId` + `optionIds` and reads
the rest from the stored rows.

The realistic threat is not a hostile customer editing a request. It is a **menu that changed
between the page render and the click**: Phase C built the line from the `FoodItem` the page
was rendered with, which is correct right up until a merchant repriced a dish two minutes
ago — at which point the basket holds yesterday's price and nothing in the system disagrees.
Rebuilding from stored rows also makes the snapshot meaningful: `cart_items.basePrice` is the
price as it really was when the item went in, which is what a later dispute is about.

### The store stays authoritative for what the user sees

`stores/cart.ts::add` is still synchronous and still returns `{ conflict }` on the same tick,
because six components depend on that. Every mutation is *echoed* to the server rather than
awaited. The division:

- the client owns **responsiveness** — no spinner on a quantity stepper;
- the server owns **truth** — real prices, validated options, one vendor per basket, and a
  basket that survives a new device.

Reconciliation happens on the next read (`hydrateFromServer`, on mount), not on the click. So
for a few seconds after a failed mirror the local cart can be ahead of the server. For a
basket that is an acceptable trade and the same one every optimistic UI makes; it stops being
acceptable at checkout, which is why **checkout must price the server's cart, not the store's**.

A server cart of `null` does *not* clear the local one. That asymmetry is deliberate: `null`
is equally consistent with "a mirror failed earlier" and "this account has no basket", and of
the two possible mistakes, keeping a basket the customer built beats deleting it.

### A closed restaurant does not block an add

`isOpen` is not checked. Browsing a closed kitchen and building a basket for later is normal,
the shipped UI permits it, and openness is a checkout-time question. What *is* checked is that
the vendor is still active and listable — via the same `CatalogReaderPort` the directory uses,
so a basket cannot hold a storefront the directory refuses to show.

---

## 4. Vendor conflict, without guessing

A cross-vendor add is refused with `cart.errors.vendorConflict`, naming both vendor ids so the
"start a new cart?" prompt needs no second round trip. The client — which has already shown
that prompt since Phase C — re-sends with `replaceExisting: true`.

The server refuses by default rather than trusting the client to have asked. A cart holding
two vendors' dishes cannot be delivered, and it would be discovered at checkout.

Discarding the old basket **soft-deletes** the cart row and hard-deletes its items, which the
schema licenses: `carts` has `deletedAt`, `cart_items` does not. That has a consequence the
repository has to handle — a tombstoned cart still occupies its `(userId, vendorId)` unique
slot, so returning to a vendor must *revive* that row rather than insert a second one. Getting
it wrong produces a unique violation that only appears for customers who came back.

---

## 5. The cross-cutting items

### Redis caching for catalog reads

The rule: **a read is cacheable when its response is a function of stored rows alone.**

Cached — `catalog:rails` (cuisines + categories, 900s), `catalog:menu:<vendorId>` (300s, the
module's most expensive query: four levels of join, run on every restaurant page view and QR
scan), `catalog:food:<slug>` (300s).

Not cached, with reasons:

- **Vendor listings.** The response is a function of filters, a sort, a page *and the caller's
  coordinates*, so a correct key is the cross-product. Worse, `isOpen` changes on the minute,
  so the entries hit most often are the ones most likely to be wrong.
- **Vendor detail.** Same problem in miniature. A `VendorRecord` does not retain the inputs
  (`acceptingOrders`, `pausedUntil`, the closure list) needed to recompute `isOpen` after a
  cache read, so caching it means serving a stale kill switch — the one field a restaurant
  flips *because* it must be obeyed immediately.

A TTL of `0` means **do not cache**, honoured on read as well as write, so a suspected
staleness bug can be bisected in production without a deploy. `invalidateVendor` exists and
nothing calls it: Unit 2 is the cart, and menu editing belongs to the merchant unit.

### Configurable limits

`CANDIDATE_CAP = 500`, `MAX_RAIL_SIZE = 50` and the TTLs were honest constants with comments
arguing for their values. What made them wrong was the *location*: each is a property of the
deployment — catalogue size, how often merchants edit during service, how much staleness the
business accepts — and a value that varies per deployment should not need a redeploy.

New: `CATALOG_CANDIDATE_LIMIT`, `CATALOG_RAIL_LIMIT`, `CATALOG_RAILS_TTL_SECONDS`,
`CATALOG_MENU_TTL_SECONDS`, `CART_MAX_LINES`, `CART_MAX_LINE_QUANTITY`, `CART_TTL_HOURS`. The
domain constants survive as the defaults, so the policy still states its own assumptions and a
test has a number to reach for without a `ConfigService`.

### Distance behind a routing interface

`shared/contracts/routing.contract.ts` publishes `ROUTING_PROVIDER`;
`HaversineRoutingProvider` implements it. Two design points matter more than the extraction:

**The port is matrix-first.** `distanceKm(origin, destinations[])` returns an aligned array.
A scalar `distanceKm(from, to)` port looks cleaner and would force every future provider into
one HTTP call per row — a 500-vendor listing becomes 500 billed requests. All four named
providers have a matrix endpoint precisely because this is the shape callers need.
`CatalogService.withDistance` now makes **one** call per listing.

**It is async even though haversine is not**, because every other implementation is. A
synchronous port would make the first real provider a breaking change at every call site,
which is what this seam exists to prevent.

`ROUTING_PROVIDER` accepts `haversine | google | osrm | mapbox | openrouteservice`, and
selecting an unimplemented one **aborts the boot** rather than quietly returning great-circle
distance. A config that claims `google` while computing a straight line is a lie a delivery
fare will be built on; in a river delta the two differ by a factor of three.

### Error boundary

`app/error.tsx`. Without it, a Server Component that throws *after* the shell has streamed
produces **HTTP 200 with a header, a footer and nothing between** — loud in the server log,
silent on screen, and invisible to monitoring that watches status codes.

It is deliberately dependency-free: no `useTranslations` (a missing provider is exactly what
throws up here), no data fetching, no store access. An error boundary that can itself fail is
not a boundary. The copy is English, which is a knowing trade against a translated message
that depends on the provider that just crashed.

One honest limit: the boundary is a client component, and React recovers a post-shell error by
shipping an error row in the RSC payload and rendering the boundary **on hydration**. So the
initial HTML still carries a 200 with an empty middle; a real browser shows the fallback, a
crawler or a JS-disabled client does not. Verified both ways — see §6.

### Timeouts and graceful fallback

Every operation carries `AbortSignal.timeout(NEXT_PUBLIC_BACKEND_TIMEOUT_MS)`, default 5s, on
both transports. A request with no deadline is not patient, it is a page that never renders.
Five seconds is chosen against the alternative rather than a latency target: the API's own
budget is 30s, but nobody waits 30s for a restaurant list — by then the visitor has gone and
the request is only still open to be billed for.

Beyond the deadline, a failed catalog **read** falls back to the Phase C mock layer
(`BACKEND_FALLBACK`, default on). This is a real trade:

- **For:** the mock layer is a complete, coherent catalogue that ships in the bundle. During a
  demo it is the difference between a hiccup and a dead site.
- **Against:** it hides breakage — a wrong `NEXT_PUBLIC_API_URL` looks like a working app.

Two things pay for it: every fallback logs `console.error` with the operation name, and it is
confined to **reads**. Cart mutations never fall back. A write that "succeeded" locally while
failing server-side is a customer who believes their basket is saved and finds out at
checkout, and no amount of graceful degradation is worth that.

---

## 6. Verified

**`bun run verify:cart` — 79 offline assertions.** Pure decisions through the real
`CartService` against in-memory ports: line identity (including that option *order* cannot
change a line), pricing (including `0.1 + 0.2`, and that the free-delivery threshold is `>=`
not `>`), option validation, the single-vendor rule, the cart cap counting configurations
rather than units, quantity-zero collapsing into a removal, and owner isolation.

**`bun run verify:cart:live` — 47 assertions against real PostgreSQL.** The things that only
exist once Postgres is underneath. Notably:

- Two guests adding the *identical* configuration get two rows and two baskets — the
  regression for §1's collision.
- Two concurrent adds both land (5 + 1 + 1 = 7). Under read-modify-write one increment is
  lost; `{ increment }` makes the database serialise them.
- A tombstoned cart is **revived, not duplicated**, under a real `userId` — which is where
  `@@unique([userId, vendorId])` actually applies. The guest tests do not exercise it at all:
  a guest cart has `userId IS NULL`, and Postgres treats NULLs as distinct, so the constraint
  permits any number of guest rows per vendor. That gap was in the harness until it was found.
- Deleting a cart item cascades to `cart_item_options` with no orphans.

**Against the running API** (guest path, over GraphQL): an add returns a correctly priced line
(720 + 120 = 840, subtotal 1680, delivery free above ৳800); a required option group omitted →
`optionGroupRequired` with `{group: "Size", min: 1}`; an option id from another dish →
`unknownOption`; a cross-vendor add → `vendorConflict` naming both vendors; the same add with
`replaceExisting: true` switches the basket; quantity 0 removes the line and `myCart` then
returns `null`; a `unitPrice` argument is not expressible (`Field "unitPrice" is not defined by
type "AddToCartInput"`); no owner → `UNAUTHENTICATED`.

**Unit 1's eight verification items, now against real rows:** 23 vendors paginating with a
stable order across 5 pages, search (`napoli`, `burger`), filters (`type: cafe` → 6,
`cuisineId: cus_italian` → 2), `openNow` (1 of 23 at 09:23 — the rest open at 10:00), restaurant
detail with weekly hours, menu detail four levels deep with option groups, and images as
seeded `https` URLs.

**Caching:** with the keys flushed, one menu read writes `catalog:menu:ven_bella_napoli`
(TTL 300s) and `catalog:rails` (900s); a `food` read adds `catalog:food:pizza-margherita`. The
cached and uncached responses are **byte-identical**, which is what proves the date revival.
With both TTLs set to `0`, four cached reads write **zero** keys and still return correct data.

**Routing:** `ROUTING_PROVIDER=google` refuses to boot with the message naming the port;
`haversine` boots and logs `Routing provider: haversine (great-circle distance — a label, not
a delivery distance)`.

**Frontend:** typecheck, lint, and `verify:graphql` — **21 operations validated against the
emitted `schema.gql`, 0 failed**. Builds clean with the flags off and on. With catalog + cart
live against real Postgres, all 8 routes 200 and the seeded data renders (`Bella Napoli`,
`Burger Lab` on `/restaurants`; `Margherita DOP` on the detail page).

**Fallback, both ways.** With the API killed and fallback on: all four catalog routes still
200 **with a working restaurant list**, and the server log carries one
`[catalog] … fell back to the mock layer` line per failed read. With `BACKEND_FALLBACK=0`: the
initial HTML is a 200 with an empty middle plus React's flight error row
(`10:E{"digest":…}`), and headless Chrome renders `Something went wrong in the kitchen` with
the Try again button — so the boundary works for a real user, and the status code is unchanged.

---

## 7. Not verified

- **The authenticated cart over GraphQL**, because `login` currently throws — see §8. The
  authenticated *path* is verified through `CartService` against real Postgres (§6), so what
  is untested is the token→actor→cart hop, not the cart's ownership rules.
- **Guest-cart adoption on sign-in.** There is no `mergeGuestCart`, so signing in with a guest
  basket leaves it behind the guest key. Deliberately deferred: adoption is five lines plus a
  policy question about what happens when the account already has a cart for another vendor —
  which is the vendor-conflict prompt again, with no user in front of it to answer.
- **Cart expiry.** `expiresAt` is stamped on every write and nothing sweeps it.
- **Concurrency beyond two simultaneous adds.** No load test.

---

## 8. Known gaps, in priority order

1. **`login` throws `INTERNAL_SERVER_ERROR`.** `setAuthCookies` receives an undefined Fastify
   reply: `graphql.module.ts` builds its context as `({ req, reply }) => ({ req, reply })`, and
   the driver does not supply `reply` under that name, so
   `auth.resolver.ts::completeAuth` → `cookies.ts:99` does `undefined.header(...)`. Every
   sign-in fails. Outside the cart domain, so untouched — but it blocks the demo's first step
   and every authenticated flow after it. **This is the next thing to fix, before any unit.**
2. **`start:dev` still rewrites `schema.gql`**, and it also exhausted the Node heap during this
   session's editing (`Ineffective mark-compacts near heap limit`). The sharpest fix is
   unchanged: point `autoSchemaFile` at a scratch path unless an emit flag is set, leaving
   `schema:emit` the only writer.
3. **`cart_items` should get a composite primary key** (`@@id([cartId, id])`) when the orders
   unit next touches these tables, retiring the `<cartId>#<lineId>` prefix.
4. **Vendor detail is uncacheable** as currently shaped. Widening `VendorRecord` to retain the
   availability inputs would let a cached copy recompute `isOpen`, which is the natural next
   caching step.

---

## 9. Bring-up

```bash
# Postgres: this machine already has Postgres.app on :5432. Redis via Homebrew.
brew services start redis
createdb -h localhost -O foodora foodora     # once; role `foodora` password `foodora`

cd database && bun run migrate:deploy        # migrations now live in prisma/schema/migrations
cd ../backend && bun run seed:reference && bun run seed:demo
bun run build && bun run start               # not start:dev — see gap 2

cd ../frontend
cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_BACKEND_CATALOG=1
NEXT_PUBLIC_BACKEND_CART=1
EOF
bun run dev
```

Gates:

```bash
cd backend  && bun run typecheck && bun run lint \
            && bun run verify:auth && bun run verify:core \
            && bun run verify:catalog && bun run verify:cart \
            && bun run verify:cart:live && bun run schema:check
cd database && bun run validate
cd frontend && bun run typecheck && bun run lint && bun run verify:graphql
```

---

## 10. Next

Unit 3 is unstarted and needs approval. The two candidates:

- **Fix `login`, then checkout.** Checkout is the first operation that genuinely requires an
  account, and it is where the server's cart becomes the source of truth for money. It needs
  gap 1 closed first.
- **Search.** `services/search.ts` still reads `lib/mock/vendors` and `lib/mock/foods`
  directly, and `category_keywords` was seeded specifically to serve it.

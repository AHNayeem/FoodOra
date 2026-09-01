# Module 6 — Cart

**Status:** done, 2026-09-01. Builds on [M5](./M5-menu-inventory.md), [M4](./M4-catalog-discovery.md),
[M3](./M3-rbac-pbac.md), [M2](./M2-auth-sessions.md) and [F1](./F1-fastify-foundation.md).

Six endpoints at `/api/v1/cart`. Fastify, JavaScript, Prisma, PostgreSQL. No migration, no
schema change, no new permission.

---

## 1. What this module is

The customer's basket, server-side: **who owns it, what may go in it, what it costs and
whether it is still orderable.** It answers `types/cart.ts::CartVendor` / `CartLine` — the
shapes `stores/cart.ts` already holds — and the operations `services/cart.ts` already makes.

**It does not:**

- **price an order.** `subtotal` and `count`, from stored snapshots, and nothing else. No
  delivery fee, no tax, no coupon, no tip, no total — BACKEND-REQUIREMENTS §3 row 7 gives all
  of it to checkout, and the vendor's `deliveryFee` / `minOrder` / `freeDeliveryOver` travel
  with the cart as **terms** because `types/cart.ts::CartVendor` carries them. See §8;
- **reserve stock.** `InventoryItem.reserved` is read and honoured and **never written** —
  the module's most consequential decision, argued in §9;
- **create, edit or read a menu.** Module 5 owns that, and this module *calls* it:
  `deriveItemAvailability` decides whether a dish may go in and `checkSelection` decides
  whether the modifiers on it are orderable. Neither rule is written twice;
- **mint storefronts or dishes.** `ven_`, `vbr_`, `food_`… are still module 15's and module
  5's. `cart_` is the one prefix this module adds;
- **adopt a guest basket on sign-in.** Named and deferred — §14;
- **touch modules 1–5.** No file outside `src/modules/cart/` changed except six: the id-prefix
  registry, `config/env.js`, `plugins/cors.js`, the v1 route table, `package.json`, and two
  assertions in `tests/seed.test.js` that a fourteenth test file turned red (§13).

---

## 2. Architecture

```
routes/v1/index.js
  └── modules/cart/index.js          assembly, `optionalUser`, CART_PREFIX
        ├── routes.js                6 endpoints, one preHandler hook
        ├── controller.js            HTTP → plain values → envelope
        ├── service.js               ownership, menu integration, transactions
        ├── repository.js            every Prisma statement, no rules
        ├── lines.js                 line identity + arithmetic, no database
        └── schemas.js               JSON Schema in and out
```

The split modules 2–5 keep. `lines.js` is this module's `availability.js`: pure, covered
entirely by `tests/cart-lines.test.js` with no PostgreSQL at all.

---

## 3. The domain, from the schema

Every field below is `orders.prisma`'s, not invented here.

| Table | What this module writes | What it leaves alone |
| --- | --- | --- |
| `carts` | `id`, `userId` \| `guestKey`, `vendorId`, `branchId`, `currency`, `fulfillment`, `expiresAt`, `deletedAt`, `version` | `addressId`, `scheduledFor`, `notes`, `tip`, `couponId` — checkout's (module 7) and coupons' (module 17) |
| `cart_items` | `id` (composite), `cartId`, `foodId`, `name`, `image`, `basePrice`, `unitPrice`, `quantity`, `note` | — |
| `cart_item_options` | `groupId`, `optionId`, `name`, `priceDelta` | — |
| `inventory_items` | **nothing** | `onHand`, `reserved` — read only. §9 |

Three constraints do real work and are worth stating:

- **`@@id([cartId, id])` on `cart_items`** — DSC-1, closed by the database phase. The line id
  is unique *within a basket*, which is the only scope in which it means anything. It was a
  global primary key once and two customers who both ordered a large Margherita computed the
  identical value, so an upsert found the other person's row. There is **no `<cartId>#` prefix**
  in this module: the constraint enforces what the convention only asked for;
- **`@@unique([userId, vendorId])`** and the partial index **`carts_guest_vendor_uq`** — one
  identity, one basket per vendor. Neither knows about `deletedAt`, which is why §6 revives;
- **`carts.deletedAt` exists and `cart_items.deletedAt` does not** — so discarding a basket is
  a tombstone *plus* a hard delete of its lines. The asymmetry is the schema's.

---

## 4. Ownership

```
authenticated actor  →  userId    (the X-Cart-Key header is ignored entirely)
no actor, a key      →  guestKey  (16–60 chars of [A-Za-z0-9_-])
neither              →  401 UNAUTHENTICATED
```

A basket predates a customer: the prototype lets an anonymous visitor browse, configure a dish
and fill a cart, and only asks who they are at checkout. So the routes take no session — and
precedence runs **one way only**. If the key could override the actor, anybody could read a
basket by replaying a key they had seen. If it merely supplemented the actor, a customer
signing in on a second device would find their basket empty, because the key belongs to the
first browser.

A request naming nobody is `UNAUTHENTICATED`, **not** an empty cart: "you did not say who you
are" and "your basket is empty" are different facts, and a client that conflates them shows an
empty cart to somebody who has one.

Possession of the key **is** the claim to the basket, exactly as with any anonymous session
cookie — `lib/cart-key.ts` says so. Acceptable for a basket, where there is nothing to spend;
not acceptable for an order, which is why checkout will require an account.

### Isolation is a shape, not a check

`repository.js::ownerWhere` builds the owner clause and **every** read and write carries it.
There is no place in this module where a row is fetched by id and then compared to an owner,
because that is the shape that eventually forgets. Customer B's line id simply does not resolve
inside customer A's basket.

Consequences, all tested:

| Attempt | Result |
| --- | --- |
| Read another customer's cart | Your own cart, or `null`. Theirs is not a candidate. |
| `PATCH` another customer's line | `errors.itemNotFound` — indistinguishable from a typo |
| `DELETE` another customer's line | Your own cart back, unchanged; theirs untouched |
| `DELETE /` while holding their key | Only your own basket clears |
| Sign in while a guest key is in the header | The header is ignored; you get your account's basket |

**No new permissions**, per §13 of the brief: a cart is a customer-resource boundary, not a
permission. `requireVendorAccess` appears nowhere — vendor staff have no route into a
customer's basket at all, which is stronger than a rule saying they may not use one.

---

## 5. API

| Method | Path | Body | Answers |
| --- | --- | --- | --- |
| `GET` | `/api/v1/cart` | — | the cart, or `null` |
| `POST` | `/api/v1/cart/items` | `{ foodId, optionIds?, quantity?, note?, replaceExisting? }` | the cart |
| `PATCH` | `/api/v1/cart/items/:lineId` | `{ quantity }` | the cart, or `null` if emptied |
| `DELETE` | `/api/v1/cart/items/:lineId` | — | the cart, or `null` if emptied |
| `DELETE` | `/api/v1/cart` | — | `null` |
| `POST` | `/api/v1/cart/validate` | — | `{ valid, issues[], cart }` |

Six operations, not CRUD: they are exactly `stores/cart.ts::add` / `setQuantity` /
`removeLine` / `clear`, the read `hydrateFromServer` makes on mount, and the pre-checkout check
module 7 needs. **No cart id in any path** — a customer has one basket and the server knows
which, so an id would be a second way to name a thing that can only be named one way, and the
first place an ownership check gets forgotten.

`POST /validate` rather than `GET`, because a validation is a statement about the menu *now*
and a 200 a browser or a CDN kept for thirty seconds is a customer told their basket is fine
after the dish sold out.

### The guest key is a header, and there is no `headers` schema

`X-Cart-Key`, allow-listed in `plugins/cors.js` so a browser preflight passes. A header because
`lib/cart-key.ts` keeps the key in `localStorage` and **argues against a cookie** — a cookie
goes to every route including the ones with no business knowing it — and because it has to
arrive on `GET` and `DELETE` as well as on the two routes with a body.

It is validated by `schemas.js::isUsableGuestKey`, a function, **not** by a `headers` JSON
Schema. That is worth a paragraph because the schema is the obvious shape and it is a trap:
F1 configures Ajv with `removeAdditional: "all"`, which is right for a body and catastrophic
for headers — a `headers` schema declaring only `x-cart-key` **deletes every other header**,
`authorization` included, so the module silently stops seeing sessions at 200. Five lines that
break authentication with no error anywhere. The next module to want a header validated should
read this first.

### Refusals

`refuse(key, path)` at HTTP 200, F1 §5's contract. Three keys are reused from
`menuBuilder.errors.*` because the fact is the same one seen from the customer's side; six are
**new, added to all three locale files** (`en`, `bn`, `ar`) in this module's change.

| Condition | `key` | `path` |
| --- | --- | --- |
| No such dish, or no such line | `errors.itemNotFound` | `foodId` / `lineId` |
| 86'd, section off, menu off, storefront hidden | `cart.errors.itemUnavailable` | `foodId` |
| Fewer portions left than asked for | `cart.errors.outOfStock` | `quantity` |
| Modifiers not orderable | `cart.errors.selectionInvalid` | `options.<groupId>` |
| A second restaurant | `cart.errors.vendorConflict` | `vendorId` |
| `CART_MAX_LINES` configurations | `cart.errors.cartFull` | `items` |
| `CART_MAX_LINE_QUANTITY` of one | `cart.errors.quantityLimit` | `quantity` |

Adding the six was not optional: `messages/*.json` had a `cart` namespace with **no `errors`
at all**, because the prototype's basket refuses nothing — it is a Zustand store that cannot
fail. A refusal whose key has no translation renders as "something went wrong", which is the
same as not explaining it.

They are **not** in `RENDERABLE` in `lib/graphql/result.ts`, for the reason M5 left the menu
keys out of it: that file belongs to the GraphQL client whose fate audit A4 has to decide, and
widening a whitelist for a transport this API does not speak would be the wrong edit. The
cutover wires it.

---

## 6. Cart lifecycle

```
no basket ──add──▶ live basket ──add from another vendor──▶ refused
                        │                                     │ replaceExisting: true
                        │                                     ▼
                        │                          old tombstoned, lines deleted
                        │                          new created *or revived*
              last line removed / cleared / expired
                        ▼
                    tombstone ──add again──▶ revived, same row
```

**Revive, never insert.** `@@unique([userId, vendorId])` and `carts_guest_vendor_uq` do not
know about `deletedAt`, so a tombstoned basket still occupies its slot. An `INSERT` there is a
unique violation that only ever appears **for customers who came back** — the worst possible
test gap, and the one V1 found the hard way. `repository.js::findSlot` uses `$unfiltered`
because the soft-delete extension hides exactly the row it exists to find.

**Removing the last line discards the basket**, so `GET` then answers `null`. That is what
`stores/cart.ts::removeLine` does — it sets `vendor: null` when the lines run out — and it is
what stops an emptied basket from blocking the next restaurant.

### Expiry

`carts.expiresAt` is stamped by every write (`CART_TTL_HOURS`, default 72) and **honoured on
read**: an expired basket reads as absent, and returning to it revives the row rather than
inserting a second. There is no sweeper — a background job is not this module's — but a column
that is written and never read is a column that means nothing, and an expired basket must not
reach checkout. V1 stamped it and nothing ever looked at it.

---

## 7. Line identity — the merge rule

`lines.js::makeLineId` is `lib/cart.ts::makeLineId`, term for term:

```
lineId = [foodId, ...sorted(unique(optionIds))].join("|")
```

- **identical configurations merge** — a second "large Margherita, extra basil" computes the
  same id and increments the line already there. That is `stores/cart.ts::mergeLine` on the
  client and an upsert on the server, and the two agree because they compute the same string;
- **different configurations do not** — burger + cheese and burger without are different ids
  and different lines, which is what a kitchen ticket needs;
- **sorted and de-duplicated**, never the client's array order. `["cheese","bacon"]` and
  `["bacon","cheese"]` are the same burger; an id that depended on click order would stack a
  basket with duplicates the merge was supposed to prevent;
- **never a client-generated key.** The client sends `foodId` + `optionIds`; the server
  computes the id. §8 of the brief asks for exactly this.

### The overflow form

`cart_items.id` is `VARCHAR(120)`. A minted food id is 31 characters and a minted option id is
30, so the natural form fits a dish plus **two** modifiers and overflows on the third — and
"burger, cheese, bacon, jalapeño" is an ordinary order. The prototype never hit this because
its fixture ids are words (`food_pizza-margherita|marg_large`).

Past the column's width the option list collapses into `foodId|~<sha256 of the sorted ids, 32
hex>`. It keeps every property the natural form has — same selection, same id; different
selection, different id — and loses only human readability, which nothing depends on. The
alternatives were worse: refusing a third topping is a product regression, and digesting
*always* would discard the documented contract and the only form the client can compute for
itself. `~` rather than `#` because a line id travels in a URL path and `#` starts a fragment
that never reaches the server.

---

## 8. Prices

**Snapshots.** `orders.prisma` decides it on the column — *"Snapshots, so a menu edit never
silently reprices a live basket"* — so `cart_items.basePrice` / `unitPrice` and
`cart_item_options.name` / `priceDelta` are written once, from stored menu rows, when the line
goes in.

**The client may not state a price.** `POST /items` has no `unitPrice`, no `basePrice`, no
option `name`, no `priceDelta` and no `vendorId`. The first four because the server reads them
from stored rows; the last because `FoodItem.vendorId` already says which restaurant a dish
belongs to and asking the client to repeat it creates a pair that can disagree. The body
schema is `additionalProperties: false` **and** F1's Ajv runs `removeAdditional: "all"`, so a
`unitPrice` in the request is deleted before the handler runs — dropped rather than refused,
which is the stronger of the two: there is no code path in which a client price exists.

The realistic threat is not a hostile customer editing a request. It is a **menu that changed
between the page render and the click**: the client builds its line from the `FoodItem` the
page was rendered with, which is correct right up until a merchant repriced the dish two
minutes ago. Rebuilding from stored rows is also what makes the snapshot mean something — it is
the price as it really was, which is what a later dispute is about.

**A price that changes afterwards is reported, never applied.** `POST /validate` answers
`price-changed` with **both** numbers and mutates nothing. Silently repricing a basket is the
behaviour the snapshot exists to prevent; silently refusing one at checkout is the behaviour a
customer calls support about.

**Arithmetic is `Decimal`**, converted once at the API boundary (`main.prisma` §5). `0.1 + 0.2`
is `0.3` here in a way it is not in `lib/cart.ts` — which is right to use floats, because it
renders a total nobody is charged.

### What is deliberately not priced

`subtotal = Σ unitPrice × quantity` and `count = Σ quantity`, which is `lib/cart.ts::
cartSubtotal` and `cartCount`. **No** `deliveryFee`, `tax`, `discount`, `tip` or `total` on the
cart. A fee computed here would be a second pricing engine that module 7 would have to agree
with, and two engines that agree today are two engines that disagree after the first promotion.

`services/cart.ts::ServerCart` declares a `deliveryFee` because V1's GraphQL cart computed one;
this API's `vendor` block carries `deliveryFee`, `minOrder` and `freeDeliveryOver` as the
branch's stored **terms**, which is what `lib/cart.ts::deliveryFeeFor` needs for the
client-side arithmetic it already does. Terms are data; a fee is a decision.

---

## 9. Reservation semantics — `InventoryItem.reserved` is **not** written here

The brief's §9 asks this module to decide rather than assume, and the decision is: **cart
operations never write `reserved`.** Stock is *read* — `available = onHand − reserved`, module
5's subtraction — and honoured before a line goes in or a quantity goes up.

The evidence, in the order it should be weighed:

1. **The schema says what the column is.** `catalog.prisma`, on `InventoryItem.reserved`:
   *"Held by **unfulfilled orders** — available = onHand − reserved."* The brief says the
   existing database is the source of truth. A basket is not an order.
2. **The cart's client is fire-and-forget.** `stores/cart.ts` mirrors every mutation without
   awaiting it and `services/cart.ts` returns `unavailable` when a write does not land. A
   reservation taken by a request whose release may never arrive is stock lost with nothing to
   find it by.
3. **`Cart.expiresAt` has no sweeper.** Reserving on add, with nothing to release an abandoned
   basket, is precisely the *"accidental stock-locking system"* §9 warns against. Honouring
   expiry on read (§6) fixes the basket; it does not un-hold a portion.
4. **A guest needs no account.** Anyone with a 32-character key could hold a restaurant's whole
   shelf, indefinitely, at no cost and under no identity. That is a denial-of-service with a
   `POST` body.
5. **M5 said "modules 6 and 8"**, not "module 6". M5 §1: *"what holds a portion is a cart line
   (module 6) or an unfulfilled order (module 8)"*, and §15 suggested this module would be the
   one to write it. That reading is superseded here by 1–4 and by the column's own comment,
   which is the more authoritative of the two. **Module 8 is the writer**: an order exists,
   belongs to an account, has a lifecycle with terminal states, and therefore has somewhere to
   release from.

### What follows from it, stated plainly

- Two customers may hold the last portion in two baskets. Both validate. The race is settled at
  order placement, where there is something to hold it against — and module 8 inherits the
  guarded `UPDATE ... WHERE onHand >= ?` that `menu/repository.js::adjustStock` already is.
- The stock check on add is **advisory**: it compares against the balance *now*, and other
  baskets are not counted. A basket is a wish.
- `tests/cart.test.js` asserts `onHand` and `reserved` are byte-identical across add, quantity
  change, removal and clear, and that no cart operation writes a `StockMovement`.
  `scripts/cart-flow.js` re-reads both columns straight from the tables afterwards.

Module 8 will find the subtraction in place and adds a writer, not a rule.

---

## 10. Transactions and concurrency

Every mutation is one `$transaction`. The boundaries:

| Operation | Inside one transaction |
| --- | --- |
| add | discard the other vendor's basket → create *or revive* this one → count lines → upsert the line → enforce the caps → restamp the cart |
| quantity | guarded `updateMany` on `(cartId, lineId)` → restamp |
| remove | delete the line → discard the basket if it was the last → restamp |
| clear | discard every live basket the owner holds |

**Quantity moves by `increment`, never read-then-write.** Two adds of the same configuration
arriving together must sum. A read, a `+1` in JavaScript and a write loses one; a single
guarded `UPDATE` holds the row lock and cannot. This is the cart's version of the race
`menu/repository.js::adjustStock` describes, and `cart-flow.js` states it over a real socket:
5 + 1 + 1 = 7.

**The caps are enforced *after* the increment**, which looks backwards and is the only correct
order. Checking first is a read-then-write: two adds that each see 98 both write and the line
lands at 100. Incrementing first serialises them, the loser sees the real post-increment
number, and it throws `Refused` **inside** the transaction so the whole thing rolls back —
including its own increment. Nothing partial survives. Tested: a refused add leaves the line at
exactly what it was.

One cap is deliberately not serialised. `CART_MAX_LINES` counts distinct configurations, and
after an upsert an insert is indistinguishable from an increment, so a racing pair can both see
`maxLines − 1` and both insert. The cap guards against a script, not against money, and one
line over it is not worth serialising every add in the system. Stated here rather than
discovered later.

---

## 11. Validation

`POST /validate` returns a **report** at `success: true` and **mutates nothing** — §12 asks for
exactly that, and the reason matters: a validation that repaired the basket would remove a dish
while the customer was looking at it, and the customer is the one who decides whether an order
without the sea bass is still the order they wanted. Checkout reads this and blocks; repairing
is a separate, explicit act.

Machine-readable codes, not i18n keys, for the reason `options.js::checkSelection` gives: a
report answers "is this still orderable" with a *list*, and every finding at once beats the
first failure.

| Code | Means | Carries |
| --- | --- | --- |
| `cart-empty` | no basket, or no lines | — |
| `vendor-unavailable` | the storefront left the directory | `vendorId` |
| `item-gone` | deleted, or its section/menu was | `lineId`, `foodId` |
| `item-unavailable` | 86'd, section off, menu off, sold out | `lineId`, `reason` |
| `insufficient-stock` | fewer left than the line holds | `requested`, `available` |
| `option-gone` | a chosen modifier left the menu | `lineId`, `optionId` |
| `selection-invalid` | the group's rules changed under it | `groupId`, `violation` |
| `price-changed` | the snapshot and the menu disagree | `storedUnitPrice`, `currentUnitPrice` |

One statement reads every dish (`findFoodsForCart`), because a validation issuing one query per
line would be slowest for exactly the customers who filled a basket.

---

## 12. Frontend contract

`NEXT_PUBLIC_BACKEND_CART` **stays `0`**, for the reason modules 2, 4 and 5 gave: this API is
REST and `frontend/services/cart.ts` still issues GraphQL through `lib/graphql/cart.operations.ts`.
The cutover is audit item A4's, and it is a frontend phase's call.

What a cutover would change, and nothing more:

| Frontend | Today | After |
| --- | --- | --- |
| `services/cart.ts` | 5 GraphQL documents | 6 `fetch` calls to `/api/v1/cart` |
| `guestKey` argument | a field in every operation | the `X-Cart-Key` header |
| `ServerCart.deliveryFee` | computed by the server | `lib/cart.ts::deliveryFeeFor(cart.vendor, cart.subtotal)` |
| `CartRefusal.key` | `cart.errors.*` with no translation | translated in all three locales (this module added them) |
| `RENDERABLE` in `lib/graphql/result.ts` | missing the cart and menu keys | the cutover's edit |

`stores/cart.ts` needs **no change at all**: every action keeps its signature, `add` stays
synchronous, the line ids the store computes are the ids the server computes, and
`hydrateFromServer` already replaces local state with the server's lines and prices.

One shape the frontend gains: `POST /validate`, which the prototype has no equivalent of and
checkout needs.

---

## 13. Verification

```bash
cd backend && npm run verify
```

= `db:validate` + `check:forbidden` + `test` + `auth:flow` + `catalog:flow` + `menu:flow` +
**`cart:flow`**.

```
✓ 91 JavaScript files, 14 dependencies — no TypeScript, NestJS, Redis, Docker or GraphQL.
# tests 550   # pass 550   # fail 0
✓ 51/51 checks passed      (auth:flow)
✓ 49/49 checks passed      (catalog:flow)
✓ 54/54 checks passed      (menu:flow)
✓ 51/51 checks passed      (cart:flow)
Database schema is up to date!   (4 migrations, no drift)
```

**460 assertions before this module, 550 after** — 17 in `cart-lines.test.js` (pure) and 73 in
`cart.test.js` (routes, real PostgreSQL), plus 51 flow checks over a real socket with the rate
limiter on and the menu built through **module 5's own API**, so the flow is two modules
integrating rather than this one and a fixture it wrote itself.

### The two existing assertions that changed, and why

Adding a fourteenth and fifteenth test file changed how Node's runner schedules them, and two
assertions in `tests/seed.test.js` turned red — deterministically, and not because of anything
this module writes:

- `prisma.role.count()` and `prisma.rolePermission.count()` were **global** counts, while
  `authz.test.js` legitimately creates a fixture role with one grant and removes it in its
  `after` hook. Whether the two files overlapped was a function of how many files the runner
  had to schedule.
- Both are now scoped to `isSystem: true`, which is what the seeder writes and what the
  assertion was always about. Nothing else in either file changed, and the suite is green three
  runs in a row.

This was a latent ordering bug in the existing suite, exposed rather than caused here.

---

## 14. Known limitations and deferred work

| # | Limitation | Why it is not fixed here |
| --- | --- | --- |
| L1 | **No guest-cart adoption on sign-in.** Signing in leaves the guest basket behind the key. | Five lines plus a policy question with no user in front of it to answer: what happens when the account already has a basket for another vendor? That is the vendor-conflict prompt, unprompted. Module 7 owns the moment a customer identifies themselves. |
| L2 | **No expiry sweeper.** `expiresAt` is honoured on read, not swept. | A background job is infrastructure, not this module. Expired rows are invisible and revived in place, so they cost storage and nothing else. |
| L3 | **`reserved` is still unwritten.** | Module 8, deliberately — §9. |
| L4 | **`CART_MAX_LINES` is not race-proof.** Two concurrent adds can both insert past it. | §10. Serialising every add to enforce a script-guard is the wrong trade. |
| L5 | **The stock check is advisory.** Other baskets are not counted. | The direct consequence of §9, and the correct behaviour for a basket. |
| L6 | **A line id past 120 characters loses its readable form.** | The column's width. §7 argues the three alternatives. |
| L7 | **`Cart.notes`, `tip`, `addressId`, `scheduledFor`, `couponId` are never written.** | Checkout's (module 7) and coupons' (module 17). Writing them here would be inventing a contract. |
| L8 | **`fulfillment` is always `delivery`.** | Pickup is a checkout choice in the shipped UI; the column defaults correctly and module 7 sets it. |
| L9 | **No `POST /items/bulk`.** A reorder is `clear` then N adds. | That is what `stores/cart.ts::replaceWith` already does, awaited in sequence. A bulk route would need its own partial-failure contract. |
| L10 | **The cart is never repaired automatically.** | §11 — deliberate, and the customer's decision. |

**Intentionally deferred**, i.e. named and not started: guest-cart adoption (L1), scheduled
baskets, saved/named baskets, cross-device notifications when a basket's price changes, cart
abandonment analytics, and dine-in rounds (`dinein.prisma` reuses `CartSelectedOption` and is
its own module).

---

## 15. Recommended next

**Module 7 — Checkout.** It is the module this one hands off to, and the handoff is deliberate:
`POST /validate` is the gate it must pass before pricing, the cart's `subtotal` is the only
number this module computes and the one checkout starts from, `Cart.addressId` / `scheduledFor`
/ `tip` / `couponId` are columns waiting for their writer, and `commissionRate` is snapshotted
at placement per BACKEND-REQUIREMENTS §3 row 7. It is also the module that must decide L1,
because signing in to check out is the moment a guest basket needs an owner.

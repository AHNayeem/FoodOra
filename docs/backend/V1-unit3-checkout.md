# V1 Unit 3 — checkout

**Status:** done, 2026-08-04. Builds on [Unit 2](./V1-unit2-cart.md).

Scope was fixed by the approval: **three blocking fixes first, then checkout**. The
governing constraint on the checkout itself was stated in one sentence and it shaped
everything below — *the checkout response must be generated entirely from server-side data;
prices, discounts, taxes, delivery fees and totals must never be trusted from the client.*

Frontend components, routes, hooks and TypeScript interfaces are unchanged. No orders
lifecycle beyond `placed`, no payment capture, no delivery, no notifications.

---

## 1. The blocking work

### 1.1 The GraphQL auth context — worse than reported

Unit 2 reported this as "`login` throws `INTERNAL_SERVER_ERROR`". That was the visible
symptom of something broader: **every authenticated GraphQL operation was broken**, and had
been since Unit 0.

```ts
// before — graphql.module.ts
context: ({ req, reply }: { req: unknown; reply: unknown }) => ({ req, reply }),
```

`@nestjs/apollo` hands the context factory straight to `@as-integrations/fastify`, whose
contract is two **positional** arguments:

```ts
type ApolloFastifyContextFunctionArgument = [request: FastifyRequest, reply: FastifyReply];
```

So the destructuring above read `req` and `reply` off the *FastifyRequest*. Fastify v4
dropped `request.req` (it is `request.raw` now) and never had `request.reply`, so both were
`undefined` and nothing threw at the boundary. Two failures downstream:

- `auth/presentation/cookies.ts` called `undefined.header(...)` on sign-in → the reported
  `INTERNAL_SERVER_ERROR`;
- `common/guards/execution-request.ts::requestOf` returned `undefined`, so
  `JwtAuthGuard` read the `Authorization` header off nothing and **refused every
  authenticated operation** — and `RateLimitGuard` silently gave every request the
  anonymous budget.

It went unnoticed because everything integrated up to that point was `@Public()` and read
no cookies. The Express driver *does* pass `{ req, res }`, which is where the object shape
comes from and why the mistake is easy to make on Fastify.

```ts
// after
context: (request: FastifyRequest, reply: FastifyReply) => ({ req: request, reply }),
```

**Verified end to end** against the running API: sign-in returns both cookies in one
`Set-Cookie` (the array form Fastify needs, so neither is dropped); `me` and `mySessions`
answer with a bearer token and are refused without one; `POST /auth/refresh` rotates the
token; a rotated token is refused after the replay window; a request without the CSRF header
is refused; `logout` clears both cookies with `Max-Age=0`.

One thing that looked like a bug and is not: replaying a *just-rotated* refresh token
returns 200. That is the documented 10-second replay window (`REFRESH_REPLAY_WINDOW_MS`)
that exists so two tabs refreshing at once do not look like a stolen token. Confirmed it
closes — the same token 12 seconds later is 401.

### 1.2 The dev workflow — three defects, not one

**`schema:check` had never once done its job.** Two bugs compounded:

1. `emit-schema.ts` set `process.env.GRAPHQL_SCHEMA_EMIT` *below* its `import { AppModule }`
   line. `@nestjs/config`'s `forRoot()` reads `.env`, validates it and caches the result
   **while the module graph is being imported** — the call sits in a `@Module({ imports })`
   decorator argument, which JavaScript evaluates at import time. The assignment was always
   too late, silently.
2. The script let `autoSchemaFile` overwrite `schema.gql` in place and then compared
   "before" with "after" — which cannot distinguish *generated and identical* from *never
   generated at all*.

So nothing was ever generated, `before === after` always held, and the check printed
`✓ schema.gql is up to date` no matter what the code said. Found by deleting `schema.gql`
and watching the script report success while producing nothing.

The fix: the environment is set before a **dynamic** `import()` of `AppModule`, generation
always goes to a scratch file, and the committed SDL is only written after a real
comparison. A missing generation is now an error with the reason in it.

**Boot no longer writes the committed SDL at all.** `GRAPHQL_SCHEMA_EMIT` defaults to off,
so only `schema:emit` / `schema:check` may write it. This was the reported symptom —
`start:dev` rewriting a reviewed artifact on every recompile — and the underlying cause was
that the two writers disagreed: `nest start` compiles through the `@nestjs/graphql` CLI
plugin, whose `introspectComments` lifts JSDoc into schema descriptions, while `schema:emit`
runs under bun with no such transform. Whichever ran last won.

`introspectComments` is now off, because its `typeFileNameSuffix` list (`.input.ts`,
`.model.ts`) does not match this project's plural convention (`cart.inputs.ts`,
`cart.models.ts`) — it was lifting JSDoc from exactly one accidental file, `page.input.ts`,
and leaving ninety others alone. That one description is now written explicitly. Verified:
the schema the built server serves is byte-identical to the committed file.

**The heap exhaustion was measured, not guessed.** Watching `nest start --watch` across
eight real edits: the watcher settles at ~43 MB, peaks at **~680 MB** during a recompile
(~470 MB on the initial full compile), and the app child holds 107–171 MB. No monotonic
growth — so it was not a leak. On this 8 GB machine Node's default heap ceiling is only
**2 096 MB**, and that is what a recompile spike plus the app plus a Next dev server
reached. `start:dev` now sets `--max-old-space-size=4096` explicitly and adds
`--preserveWatchOutput` so the log survives a rebuild. Verified: boots, restarts on change,
leaves `schema.gql` untouched, serves 200s.

If it recurs, the sharper fix is `nest start -b swc` — dramatically lighter than `tsc -w`,
at the cost of two dev dependencies and no type-checking in the watch loop (which
`bun run typecheck` already covers).

### 1.3 The cart key workaround is now registered, not just commented

`docs/backend/deferred-schema-changes.md` is new: a register of schema changes that are
known to be needed, deliberately deferred, and **not optional**. An entry lands there only
when application code is working around the schema, which means there is a defect held shut
by a convention rather than by a constraint.

**DSC-1** is the `cart_items` composite primary key. The entry carries the defect, the
current workaround and what it costs, the target Prisma models, the backfill SQL with its
two ordering traps, the five files that change with it, the trigger condition (the orders
unit's first migration touching these tables), and the note that `frontend/` changes
nothing. `TEMPORARY` markers in `line-id.ts` and `orders.prisma` point at it by id.

It charged interest immediately, which is worth recording: guest-cart adoption (§4) has to
*copy* lines rather than reassign `carts.userId`, because `cart_items.id` is prefixed with
the cart id and the rows cannot simply change parents. Once `@@id([cartId, id])` lands, that
method gets shorter.

---

## 2. The rule the whole unit is built around

Not one price, discount, tax rate, delivery fee or total is read from the request. The
complete list of what a client may say about an order's money is **two things**:

| The client sends | What the server does with it |
|---|---|
| `tipPercent` | multiplies it by **its own** subtotal, and refuses it above `CHECKOUT_MAX_TIP_PERCENT` |
| `couponCode` | looks the code up in `coupons` and prices the rule itself |

Everything else is a choice with no monetary content (delivery or pickup, an address, a
tender, a time) or a fact about the customer (name, phone, a note for the kitchen). There is
no `subtotal`, `deliveryFee`, `discount`, `tax`, `taxRate`, `tip`, `total` or `unitPrice`
field anywhere in `PlaceOrderInput` — not even as an ignored one. A client that tries is
refused by GraphQL itself:

```
Field "subtotal" is not defined by type "PlaceOrderInput".
```

**`frontend/services/orders.ts::placeOrder` still accepts a whole `OrderPricing`,** because
V1 may not change that interface — and it sends **one** member of it, `couponCode`. The seam
looks like it hands over a priced order and does not.

### Why the client still computes a total

Because it must. `checkout-view.tsx` updates the summary the instant a tip preset is tapped,
and a round trip per tap would be a worse product. So the client's arithmetic is a
**display** and the server's is a **price**.

That makes "correct" insufficient on its own: a server that priced correctly and
*differently* from the screen would still be a bug, because the customer would watch a
number change when they pressed the button. So `verify:checkout` transcribes
`frontend/lib/checkout.ts::computeTotals` and asserts the two produce identical totals, tax,
delivery and tip across eight baskets — including a fee-charged basket, a pickup, a
discount larger than the basket, and `333.33 × 3` for the rounding.

### The order of operations, and the three parts that are decisions

```
subtotal    = Σ unitPrice × quantity                    (stored line snapshots)
discount    = min(coupon discount, subtotal)
deliveryFee = 0 on pickup or a waiver, else the vendor's (threshold applied first)
taxable     = subtotal − discount
tax         = taxable × rate                            (from tax_rules)
tip         = subtotal × tipPercent
total       = taxable + deliveryFee + tax + tip
```

- **Tax is on the discounted subtotal and not on the delivery fee.** A coupon reduces the
  taxable amount, which is how consumption tax works nearly everywhere. Whether delivery is
  taxable genuinely varies by jurisdiction — `tax_rules.appliesTo` anticipates that — and V1
  resolves only the `order-subtotal` rule, which is what the prototype has always applied.
- **The tip is a fraction of the *undiscounted* subtotal.** A courier's tip should not shrink
  because the customer had a voucher.
- **Cashback is not subtracted.** It is credited to the wallet after the order, so it leaves
  the total alone. Subtracting it *and* paying it out would count it twice.

All three match what Phase C shipped, because changing them changes what customers are
charged.

---

## 3. Tax comes out of the database

`tax_rules` was unseeded — E5 owned it, and checkout cannot price an order without it. One
rule per market is now written by **`seed:reference`**, not `seed:demo`, and the distinction
matters: a production install runs only the reference seeder, and a market with no row
silently *undercharges every order in it*.

| Market | Label | Rate |
|---|---|---|
| BD | VAT | 5% |
| US | Sales Tax | 8.75% |
| GB | VAT | 20% |
| AE | VAT | 5% |
| DE | VAT | 19% |

Copied from `frontend/config/regions.ts` exactly, because the frontend still computes the
total it displays. `effectiveFrom` is the Unix epoch so no clock skew or backdated order can
land before the rule that governs it.

Resolution narrows **vendor → city → country**, with `priority` breaking a tie at the same
level, and is done in code over one indexed read rather than as three queries with a
fallback chain. The rate and label are **snapshotted onto the order**, so a rate change next
year does not rewrite last year's receipts.

**No rule configured means no tax** — not a guessed rate. That is the same answer the
frontend gives for a country missing from its table, and inventing a number would charge a
customer money on the strength of a guess.

---

## 4. Checkout requires an account, and adopts the basket

`checkoutSummary` is `@Public()`: a quote prices a basket and writes nothing, so an anonymous
visitor is entitled to one — and needs one, because the checkout screen is reachable before
signing in.

`placeOrder` is not, and the requirement comes from the schema rather than from preference:
**`orders.userId` is the only owner column and there is no `guestKey` on that table.** A
guest order would have no owner — invisible to `myOrders`, unattributable in support,
impossible to refund to anybody. `config/backend.ts` predicted this in Unit 2: *"Checkout is
what will require an account."*

That creates the problem Unit 2 left open, and now it matters: a customer who fills a basket
anonymously and signs in to pay would find it empty, because the basket belongs to a
`guestKey`. So `placeOrder` accepts that key and **adopts** the basket onto the account —
the `mergeGuestCart` Unit 2 recorded as a gap, arriving where it belongs, because checkout is
the moment identity first exists.

The collision policy is that **the account's own basket wins**. If the signed-in customer
already has a live cart, the guest one is left untouched: the alternative is the
vendor-conflict prompt with nobody in front of it to answer, and silently discarding the
identified customer's basket in favour of a browser key's would be the wrong one to lose.

Adoption is expressed entirely through the cart repository's own public methods
(`openCart` → `addQuantity` → `clear`) rather than as an `UPDATE carts SET userId`, because
two constraints make the direct write wrong: `@@unique([userId, vendorId])` counts tombstones,
and `cart_items.id` carries the cart-id prefix. Both are handled correctly by methods that
already exist.

---

## 5. Coupons: priced server-side, mirrored from the frontend engine

Phase C21 built a good coupon engine and put it in the browser. It cannot be what an order
is priced from — a coupon's rule is stored data — so `domain/policies/coupon.ts` is a
deliberate **mirror** of `frontend/lib/coupons.ts`: same refusal order, same ceilings, same
rounding, same treatment of cashback.

The refusal order is not arbitrary. What is wrong with the *coupon* first (spent, capped, not
started, expired, wrong currency), then what is wrong with the *basket* (wrong vendor, wrong
dishes, not your first order, too small), then kind-specific conditions. The first failure
wins, so the customer is told the one thing they could change — which is why `vendorOnly`
beats `minOrder`: "add ৳1,000 more" is useless advice for a code that will never work here.

Two things exist only on the server:

- **`totalLimit` — the platform-wide cap.** A browser cannot know how many other customers
  have spent a code, so the mock has no cap at all. This is what stops a leaked code costing
  an unbounded amount.
- **Usage counted from real orders.** `coupon_redemptions` has a composite foreign key onto
  `coupon_claims`, so writing one means owning the claim lifecycle — the promotions unit's
  job. `orders.couponId` is a column *this* module writes, so it is the honest source for
  "has this been used", and it settles a question a counter column leaves open: **a cancelled
  or rejected order does not consume a coupon.** Nobody was fed and nobody was charged, so
  the ticket goes back in the wallet.

Eight coupons are seeded from `frontend/lib/mock/coupons.ts` — same ids, same codes, same
rules, windows stamped as day offsets so a demo opened next month still has live tickets.
Two are deliberately unusable (`HELLO-15` expired two days ago, `NAPOLIRIDE` starts in two)
so the expired and not-yet-started refusals are reachable on purpose. The campaign coupons
minted from the C20 offer seed are **not** ported: that means porting `offers`, which is the
promotions unit's job.

**A coupon the server will not honour fails the order, not just the discount.** Placing it
anyway would charge the customer more than the screen showed them, silently, at the moment
they committed. The refusal carries the reason so the client can drop the coupon and
re-price.

---

## 6. Three more decisions worth stating

**A closed kitchen blocks an order for *now* and allows a scheduled one.** Unit 2
deliberately let a customer fill a basket at a closed restaurant, because browsing at
midnight and ordering at noon is normal. Checkout is where `isOpen` finally means something —
an order placed into a closed kitchen sits unanswered while the customer watches a countdown
that means nothing. A scheduled order is exempt, because that is precisely the case where
"closed now" is irrelevant.

**The order number is a row lock, not a clock.** `frontend/services/orders.ts` derived it
from `Date.now()` in base 36, which collides for two customers in the same millisecond
against a `@unique` column. `number_sequences` is incremented with
`UPDATE … RETURNING` inside the same transaction, so Postgres serialises it. Format is
`FO-000123` — digits only, because base 36 produces `8F3A21`, and this value gets read aloud
to a restaurant over the phone.

**The hand-off code is server-issued, hashed at rest.**
`frontend/lib/delivery.ts::otpFor` derived it from the order id, which meant anyone holding
an order number held the code — that file predicted its own replacement. Now: `randomInt`,
four digits, returned **once** in the placement response, SHA-256 in `orders.otpHash`, and
the readable copy in Redis with a `CHECKOUT_OTP_TTL_HOURS` expiry so the customer's tracker
can show it again. Losing Redis costs a display, not a delivery — the rider's verify path
compares against the hash. This is the Unit 0 standing rule applied: a stolen `orders` table
must not be a list of live codes.

---

## 7. Everything verified

```
verify:checkout        ✓ 141 assertions, 0 failed          (offline, real CheckoutService)
verify:checkout:live   ✓  87 assertions, 0 failed          (real PostgreSQL)
verify:cart            ✓  79      verify:cart:live   ✓ 47
verify:catalog         ✓ 108      verify:auth        ✓ 153      verify:core ✓ 169
verify:graphql         ✓  24 operations                     (frontend documents vs schema)
typecheck · lint · schema:check · prisma validate — all clean, both repos
```

Beyond the harnesses, against the running API:

- **Auth**: login → cookies → `me` → `mySessions` → refresh → rotation → reuse refused →
  CSRF refused → logout clears. §1.1.
- **A client cannot state a price**: GraphQL rejects `subtotal` on `PlaceOrderInput`.
- **The quote equals the order**: `checkoutSummary` said 1932, `placeOrder` charged 1932.
- **Coupon arithmetic on real rows**: `BELLALUNCH` on a ৳1,680 basket → 15% capped at ৳250,
  tax on ৳1,430 = ৳71.50, total ৳1,669.50. `LOYAL-5` → ৳84 cashback and the total unchanged.
- **`usageLimit` enforced from orders**: the fourth use of a limit-3 coupon is refused; then
  cancelling one of the three lets it through again.
- **The OTP**: a four-digit code returned, a 64-char hex digest stored, and the digest does
  not contain the code.
- **The basket is consumed**: `myCart` is null after ordering, and a second checkout is
  refused as `cartEmpty`.
- **Concurrency**: two simultaneous checkouts get distinct references.
- **`Decimal(14,2)` round-trips** including a 15% tip on three units.
- **The frontend's own documents** — `ADD_TO_CART`, `CHECKOUT_SUMMARY`, `PLACE_ORDER`,
  `ORDER_BY_ID`, printed from `lib/graphql/*.operations.ts` — all succeed against the live
  API, which closes the gap between "a query I wrote by hand" and "what the app sends".

The database is left at 0 orders / 0 carts. The only non-owned row the live harness touches
is `vendor_branches.acceptingOrders`, restored in a `finally` so a crash cannot leave a
restaurant closed.

---

## 8. What is deliberately not here

No payment capture, no `payment_intents`, no ledger entries, no wallet debit, no
`coupon_redemptions` row, no notifications, and no order transitions beyond `placed`. Card
and wallet orders are marked `paid` exactly as the prototype marks them, which is honest
about what it is: a demo tender, not a gateway.

A half-built one of each would be worse than none — an order referencing a `PaymentIntent`
nothing can settle is harder to unpick than an order referencing no payment at all.

`checkoutSummary` is a **query**, though PHASE 4 lists "Apply Coupon" as a mutation.
Applying a coupon changes no server state: the evaluation is a pure function of the coupon's
row, the basket and the clock, and nothing is consumed until an order exists. A mutation
would have to write the code onto the cart — inventing state the frontend does not read
back, since `checkout-view.tsx` holds the applied coupon in component state — or write
nothing at all, which is a query wearing the wrong verb.

The `carts` table has `fulfillment`, `tip`, `couponId` and `addressId` columns that this unit
does not write, for the same reason: the frontend keeps those choices in component state
until the click, so the quote is a pure function of (cart, choices) and nothing is persisted
mid-checkout.

---

## 9. Gaps, in priority order

1. **A category-scoped coupon is refused rather than granted.** V1's checkout cannot resolve
   which browse categories a basket's dishes belong to, so `categorySlugs` is empty and the
   `categoryOnly` rule always refuses. Refusing is the conservative direction — it never
   gives money away — and no seeded coupon is category-scoped. Resolving it needs a
   `food_items` → `categories` read, which the promotions unit needs anyway.
2. **`orders.couponId` has no index.** Coupon usage is counted with two `count`s against
   `orders`, and the foreign key alone does not create an index in Postgres, so those are
   sequential scans. Fine at demo scale; a one-line migration when the orders unit next
   migrates. Registered as **DSC-2**.
3. **A guest can preview a first-order coupon they could not spend.** `checkoutSummary` has
   no account to count against, so per-customer rules are given the benefit of the doubt in
   a quote. Enforced for real at `placeOrder`, which always has an actor — but the quote can
   show a discount the order then refuses.
4. **The tip fraction is only as good as the client's own two numbers.** It is derived as
   `pricing.tip / pricing.subtotal` in `services/orders.ts`, because `PlaceOrderInput` has no
   `tipPercent` and V1 may not change it. A client with an inconsistent `pricing` sends a
   wrong fraction — bounded by `CHECKOUT_MAX_TIP_PERCENT`, so the damage ceiling is a 100%
   tip rather than an arbitrary charge. The clean fix is a `tipPercent` on the frontend
   interface, which is a Phase-C-interface change and therefore not V1's.
5. **`estimatedDeliveryAt` is a placeholder.** Placement + 40 minutes, overwritten when the
   restaurant accepts and commits to a preparation time. The same fiction
   `services/orders.ts` has always told, and it stops being one in Unit 5.
6. **The server transport attaches no bearer token.** `lib/graphql/execute.ts` only adds it
   on the Apollo (browser) path. Every authenticated operation today is called from a client
   component, so nothing is broken — but a Server Component calling an authenticated
   operation would silently be anonymous.

---

## 10. Next

Unit 4 is the restaurant side of the lifecycle: accept, reject, start cooking, food ready —
the transitions `frontend/lib/order-machine.ts` already models and the kitchen board already
renders. It is the natural next unit because the order it moves now exists, and because
every transition needs the same thing this unit built: a server that owns the state rather
than trusting what the client says it is.

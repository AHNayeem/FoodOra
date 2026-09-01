# FoodOra — Implement Backend Module 6: Cart

You are working on the **FoodOra** backend.

**Module 5 — Menu & Inventory is now complete, verified end to end, and documented.**

The next task is:

> **Module 6 — Cart**

Before changing anything, inspect the repository and all existing FoodOra contracts. Do not assume the frontend mock behavior is automatically the correct backend behavior.

---

## 1. Non-negotiable constraints

Backend stack:

* Fastify
* Prisma
* PostgreSQL
* JavaScript only

Forbidden:

* TypeScript
* NestJS
* GraphQL
* Redis
* Docker

Also:

* Do not rewrite the backend foundation.
* Do not rewrite Modules 1–5.
* Do not introduce a second auth/RBAC system.
* Do not redesign the database unless absolutely required.
* Do not implement checkout/payment/order logic that belongs to later modules.
* Do not modify frontend/database folders unless strictly necessary.
* Do not claim completion without real PostgreSQL verification.
* Follow the architecture and conventions established by F1, M2, M3, M4 and M5.

The existing backend is REST-based even if parts of the frontend still contain legacy GraphQL/mock contracts.

---

# 2. First inspect the existing system

Before implementing anything, inspect:

1. `FOODORA-MASTER-MODULE-CHECKLIST`
2. `Analysis.md`
3. `FOODORA-DATABASE-DESIGN.md`
4. `backend/F1-fastify-foundation.md`
5. `backend/M2-auth-sessions.md`
6. `backend/M3-rbac-pbac.md`
7. `backend/M4-catalog-discovery.md`
8. `backend/M5-menu-inventory.md`
9. Prisma schema
10. all existing cart-related models/migrations
11. `lib/cart*`
12. cart stores/state
13. cart services
14. cart-related frontend components
15. menu/inventory helpers from Module 5
16. existing order/checkout domain types
17. existing ID-prefix conventions
18. existing test and flow conventions

Pay particular attention to the existing cart schema because the previous database work already addressed the **cart item ID collision / re-keying issue**.

Do not undo that fix.

---

# 3. Determine the actual Cart domain

Establish from the existing schema and frontend implementation:

* cart/basket identity
* customer ownership
* vendor/restaurant ownership
* branch relationship
* cart items
* quantity
* selected modifiers/options
* item price
* modifier price
* subtotal
* availability
* stock relationship
* timestamps
* active/expired/cleared state if modeled
* any existing reservation fields
* checkout handoff fields

Use the existing database as the source of truth.

Do not invent fields simply because a typical food-delivery cart would have them.

---

# 4. Cart ownership and isolation

A cart must belong to the correct customer/session according to the existing domain model.

Verify:

* customer can access their own cart
* customer cannot access another customer's cart
* unauthenticated access behaves according to the existing FoodOra design
* vendor users cannot manipulate customer carts unless explicitly supported
* cross-vendor cart behavior follows the existing product rules
* branch/vendor mismatches are rejected where required

Do not rely only on an ID check.

Every resource must be resolved within the appropriate ownership scope.

---

# 5. Cart operations

Implement the operations required by the existing frontend/domain contract.

At minimum, determine whether the existing model requires:

* get cart
* add item
* update item quantity
* remove item
* clear cart
* update selected options/modifiers
* validate cart
* recalculate cart
* create/retrieve basket
* remove unavailable items
* refresh prices/availability

Do not blindly implement generic CRUD.

The API should expose meaningful cart operations consistent with the existing application.

---

# 6. Menu → Cart integration

Cart items must be validated against the actual Module 5 menu domain.

When adding an item:

1. Verify the food item exists.
2. Verify it belongs to the expected vendor/menu context.
3. Verify the item is currently usable.
4. Verify the requested quantity is valid.
5. Validate selected modifier groups/options.
6. Validate required selections.
7. Validate min/max selections.
8. Verify selected options belong to the correct modifier groups.
9. Verify inactive options cannot be added.
10. Resolve the current price from the authoritative menu data.
11. Resolve modifier pricing from authoritative data.
12. Persist the appropriate cart representation/snapshot.

Do not trust client-supplied prices.

---

# 7. Price integrity

This is critical.

The client must never be able to manipulate:

* item unit price
* modifier price
* subtotal
* total

Server-side calculations must use authoritative database/domain values.

Determine from the existing schema whether cart prices are:

* live-derived
* snapshotted
* both

Follow the existing design.

If the schema contains price snapshots, make the snapshot semantics explicit and test them.

If prices change after an item has been added, determine the intended behavior from the existing frontend/database design rather than inventing a policy.

---

# 8. Modifier/cart-item identity

Inspect how the frontend currently represents:

> same food item + different modifier selections

These may need to be separate cart lines.

For example:

* Burger + Cheese
* Burger + No Cheese

must not accidentally collapse into the same cart line if the existing domain treats them as different selections.

Likewise:

* identical food + identical modifier selection

should follow the existing intended merge behavior.

Use a deterministic representation/comparison strategy.

Do not depend on JavaScript object ordering or client-generated arbitrary IDs.

---

# 9. Inventory / reservation integration

Module 5 deliberately left:

`InventoryItem.reserved`

without a writer until Module 6/8.

Now determine whether Module 6 is the correct point at which cart operations should write reservation state.

**Do not automatically assume that adding to cart means reserving stock.**

Inspect:

* `Analysis.md`
* database design
* frontend cart behavior
* order/checkout design
* inventory semantics
* any existing `reserved` field documentation

Determine the intended reservation lifecycle.

If the design says cart addition reserves stock, implement it transactionally.

If reservation belongs to checkout/order creation instead, leave `reserved` untouched and document why.

Do not create an accidental stock-locking system.

---

# 10. If cart reservation is required

If the existing design requires cart-level reservations, implement them safely.

Requirements:

* reservation increment/decrement must be atomic
* quantity changes must correctly adjust reservation
* removing an item releases reservation
* clearing a cart releases reservation
* failed operations must not leave partial reservations
* reservations cannot exceed available stock
* concurrent carts competing for the last units must behave deterministically
* stock must never become negative
* reservation must not exceed available quantity
* transaction rollback must restore the previous state

Test concurrent access to the same inventory item.

For example:

> Stock = 1
> Customer A adds quantity 1
> Customer B simultaneously adds quantity 1

Exactly one operation should succeed if reservation semantics require exclusive stock reservation.

If the existing design intentionally does **not** reserve during cart, test and document that behavior instead.

---

# 11. Cart recalculation

Create a server-authoritative cart calculation path.

Calculate from trusted data:

* line quantity
* item unit price
* modifier adjustments
* line subtotal
* cart subtotal

Do not implement:

* final checkout totals
* payment processing
* order totals
* delivery fee calculation

unless the existing architecture explicitly assigns a portion of those calculations to Cart.

Those belong to later modules.

The cart should provide the correct handoff into checkout.

---

# 12. Cart validation

Provide a way to validate the current cart before checkout if required by the existing design.

Validation should detect things such as:

* item no longer exists
* item became unavailable
* menu became unavailable
* section became unavailable
* modifier became unavailable
* modifier selection became invalid
* quantity exceeds available stock
* price changed
* vendor/branch context changed
* cart contains invalid/incompatible items

Return structured validation errors consistent with the existing backend error contract.

Do not silently mutate the cart during validation unless the existing design explicitly requires it.

---

# 13. Authorization

Reuse Module 2 authentication and Module 3 authorization infrastructure.

Do not create new permissions unless the existing design explicitly requires them.

Cart ownership is primarily a customer-resource boundary.

Ensure:

* customer A cannot read customer B's cart
* customer A cannot mutate customer B's cart
* invalid/foreign IDs do not leak information
* appropriate 404/403 semantics follow the conventions established by M3–M5

Preserve the project's existing distinction between:

* resource does not exist / is outside scope
* authenticated but unauthorized

---

# 14. API design

Follow the REST conventions established by Module 4 and Module 5.

Use the existing `/api/v1` structure.

Do not blindly choose endpoint names.

Inspect the existing routes and use a consistent style.

Possible operations may include:

* cart retrieval
* item addition
* item quantity update
* item removal
* cart clearing
* cart validation

But only expose operations actually supported by the domain.

Keep:

* routes thin
* controller responsibilities small
* business logic in service/domain
* Prisma access in repository
* reusable pure calculations/rules in domain helpers

Follow the Module 5 structure where appropriate.

---

# 15. Transactions and concurrency

Cart mutation must be transactionally safe.

Identify every operation involving multiple writes.

Examples:

* adding item + reservation
* quantity change + reservation delta
* removing item + reservation release
* clearing cart + releasing multiple reservations

Do not use a fragile:

`read → calculate → write`

pattern where concurrent requests can corrupt stock/reservation.

Use PostgreSQL/Prisma transaction semantics appropriately.

Add a concurrency test for the most important stock/cart race.

---

# 16. Testing requirements

Create a dedicated Module 6 test suite and flow command following the established project conventions.

The tests must run against **real PostgreSQL**.

### Cart creation/retrieval

Test:

* empty cart
* existing cart
* correct customer ownership
* foreign customer rejection
* vendor/branch context

### Add item

Test:

* valid item
* invalid item
* unavailable item
* invalid quantity
* valid modifiers
* missing required modifier
* invalid modifier
* inactive option
* wrong modifier group
* wrong vendor
* price integrity

### Update quantity

Test:

* increase
* decrease
* zero/negative quantity behavior
* unavailable stock
* reservation behavior if applicable
* atomicity

### Remove item

Test:

* successful removal
* foreign cart rejection
* reservation release if applicable
* nonexistent item behavior

### Clear cart

Test:

* successful clear
* all relevant reservations released if applicable
* repeated clear is safe

### Recalculation

Test:

* correct item subtotal
* modifier pricing
* quantity multiplication
* server-authoritative prices
* price change behavior according to the existing design

### Validation

Test:

* valid cart
* unavailable item
* invalid modifier
* stock shortage
* price change
* invalid cart state

### Authorization

Test:

* own cart
* another customer's cart
* vendor isolation
* invalid/foreign resource IDs

### Concurrency

If reservation is part of Cart:

* two customers competing for last stock
* exactly one reservation succeeds
* reservation never exceeds stock
* failed transaction leaves no partial reservation

If reservation is deliberately deferred:

* explicitly verify that Cart does not mutate `reserved`
* verify this matches the documented domain design

---

# 17. Regression testing

After Module 6 is complete, run the complete existing verification suite.

At minimum:

* database validation
* forbidden technology check
* all backend tests
* `auth:flow`
* `catalog:flow`
* `menu:flow`
* new `cart:flow`
* Prisma/schema status
* existing foundation checks

Module 6 must not break Modules 1–5.

---

# 18. Documentation

Create:

`backend/M6-cart.md`

Document:

1. module purpose
2. scope
3. cart domain model
4. API routes
5. ownership rules
6. menu integration
7. modifier handling
8. price calculation
9. reservation semantics
10. transaction/concurrency behavior
11. validation behavior
12. frontend contract
13. verification commands
14. verification results
15. limitations
16. intentionally deferred checkout/order responsibilities

If Cart does **not** write `InventoryItem.reserved`, explicitly document why.

If it **does**, document the exact reservation lifecycle.

---

# 19. Checklist update

Update the master checklist only after implementation and verification.

For:

**Cart**

the Backend column may become `[x]` only after:

* routes are implemented
* Prisma integration works
* authorization is verified
* cart calculations are verified
* concurrency behavior is verified where applicable
* real PostgreSQL flow passes

The existing Frontend `[x]` and Database `[x]` statuses must not be changed unnecessarily.

Update:

> Backend business modules: `5 of 32` → `6 of 32`

and identify:

> next module = Module 7

Do not mark anything else complete merely because it was touched during implementation.

---

# 20. Important architectural rule

Do not turn Module 6 into Checkout.

The boundary should remain clear:

**Module 5**

Menu → items → modifiers → availability → stock

↓

**Module 6**

Customer cart → cart lines → selections → quantities → cart validation → reservation semantics if designed here

↓

**Later checkout/order modules**

Pricing finalization → delivery fee → discounts → payment → order creation

Do not prematurely implement later-module business logic.

---

# 21. Definition of Done

Module 6 is complete only when:

* [ ] Existing cart schema/domain fully inspected
* [ ] Existing cart frontend contract inspected
* [ ] Cart ownership implemented
* [ ] Cart retrieval implemented
* [ ] Add item implemented
* [ ] Quantity update implemented
* [ ] Remove item implemented
* [ ] Clear cart implemented where required
* [ ] Modifier selections correctly handled
* [ ] Server-authoritative pricing implemented
* [ ] Menu/inventory integration implemented
* [ ] Reservation semantics correctly implemented OR explicitly deferred according to the existing design
* [ ] Authorization verified
* [ ] Cross-customer isolation verified
* [ ] Cross-vendor/branch rules verified
* [ ] Transaction boundaries verified
* [ ] Concurrency behavior verified
* [ ] Real PostgreSQL tests pass
* [ ] Existing Modules 1–5 regression tests pass
* [ ] Forbidden technology check passes
* [ ] `backend/M6-cart.md` created
* [ ] Master checklist updated accurately
* [ ] No unrelated module implemented

---

# 22. Final report

When finished, provide:

### Module

`Module 6 — Cart`

### Implementation

* number of routes
* route list
* services/domain logic
* repository changes
* Prisma models used
* migrations, if any

### Cart semantics

* ownership model
* price model
* modifier-line behavior
* reservation behavior
* concurrency behavior

### Verification

* exact command(s)
* total assertions
* flow checks
* PostgreSQL status
* authorization results
* concurrency results
* regression results

### Files changed

List important files only.

### Checklist changes

Show exact before → after changes.

### Limitations

List only genuine, intentional limitations.

### Final rule

**Do not stop at implementation.**

Execute:

> inspect → design from existing schema/contracts → implement → test → find failures → fix → rerun → verify against real PostgreSQL → regression test → document → update checklist

A feature is `[x]` only when the behavior has actually been verified end to end.

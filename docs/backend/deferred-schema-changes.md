# Deferred schema changes

Schema changes that are **known to be needed, deliberately not yet made, and not
optional**. This is not a wish list. An entry lands here only when the current schema is
being worked around in application code, which means there is a defect held shut by a
convention rather than by a constraint.

Every entry states the trigger condition — the point at which deferring stops being
cheaper than doing it. An entry is closed by writing the migration and deleting the
`TEMPORARY` markers it names, in the same change.

| Id | Table | Working around | Trigger | Status |
|----|-------|----------------|---------|--------|
| DSC-1 | `cart_items` | Global `@id` on a per-cart value | The orders unit's first migration touching cart/order tables | **Closed** 2026-08-27 |
| DSC-2 | `orders` | No index on `couponId`, which checkout counts by | The next `orders` migration, or the first performance complaint | **Closed** 2026-08-27 |

**Both entries are closed. Nothing is currently deferred.**

Closed by `20260827120000_v2_gap_closure`, whose trigger condition — the first
migration touching cart and order tables — is exactly what the database
finalisation phase turned out to be. See
[`FOODORA-DATABASE-DESIGN.md`](../FOODORA-DATABASE-DESIGN.md) §1 and §9.

### What actually happened, per entry

**DSC-1.** `cart_items` now carries `@@id([cartId, id])` and `cart_item_options`
carries `@@id([cartId, cartItemId, optionId])` with a composite foreign key onto
its parent. The standalone `@@index([cartId])` is gone — the composite key's
leading column serves it. The `TEMPORARY` marker on `CartItem.id` is deleted.

The migration was **verified against real data**, which is the part that could
not be done when this entry was written: a database was built from the V1
baseline, seeded in the prefixed shape *including the exact collision this entry
describes* — two guests, the same dish, the same configuration, one global id —
and migrated. Both baskets survived with the prefix stripped.

Two corrections to the plan sketched below, both found by running it:

1. **Both old primary keys must be dropped before any row is rewritten**, not
   after. Stripping the prefix makes `cartA#line1` and `cartB#line1` both become
   `line1`, so the rewrite transiently violates the very keys being replaced.
   The original plan swapped constraints after the backfill and would have
   failed on any database holding two carts with a common configuration — the
   same case the entry exists for.
2. A second pass is needed for children whose parent was *already* un-prefixed
   (written by an older build, or by a re-run): they still need their `cartId`,
   and the guarded `substring` join skips them. Orphans are deleted rather than
   failing the deploy — a basket is disposable, which this entry already said.

The `DELETE FROM cart_items` shortcut was **not** needed.

**DSC-2.** `orders` now carries `@@index([couponId, status])`, composite for the
reason given below: both of checkout's counts filter on `status`, and it is the
same index the promotions unit wants for campaign performance. A second index
`([settlementRef, vendorId])` was added alongside for the settlement read.

### The code that was to change with DSC-1

The "Code that changes with it" table below names five files under `backend/`.
**All of them have been removed with the NestJS backend**, so there is nothing
left to unwind — the workaround they implemented no longer exists in any form.
What the new backend must do instead is simply use the composite key:
`where: { cartId_id: { cartId, id } }`. Verified through the generated Prisma
client, including that an upsert on it touches one basket only.

`frontend/` changed nothing, exactly as predicted: the wire id has always been
the bare composite value.

---

<details>
<summary>Historical record — the entries as written, with their original plans</summary>

---

## DSC-1 — `cart_items` needs a composite primary key

**Opened:** V1 Unit 2 (2026-08-04) · **Scheduled:** with the orders/checkout migration

### The defect

`cart_items.id` is declared `@id @db.VarChar(120)` and holds the composite cart-line id —
`foodId|sortedOptionIds` — which is the right *value* under the wrong *scope*. That value
identifies a configuration within one basket; the column identifies a row across the whole
table. Two customers who both order a large Margherita compute the identical id, so an
upsert keyed on it finds the other person's row.

This was not theoretical. `verify:cart:live` reproduced it against real PostgreSQL on the
day the database first ran: guest A's cart reached quantity 2 while guest B's stayed empty.
No in-memory fake could have caught it, because a `Map` per owner already has the scoping
the table lacks.

### The current workaround

Rows are stored under `<cartId>#<lineId>`; the wire keeps the bare line id, so
`types/cart.ts::CartLine.id` never changed. The conversion lives in
`backend/src/modules/cart/domain/policies/line-id.ts` — `storedLineId()` in,
`toWireLineId()` out, `lineIdFits()` guarding the width.

It is correct and it is verified. What it is not, is enforced:

1. **The database permits the collision.** Only the cart module prevents it. Raw SQL, a
   bulk import, or a second writer reintroduces it silently, and the failure is not an
   error — it is one customer's food in another customer's basket.
2. **The key eats the column.** 120 characters minus a 40-character cart id and a
   separator leaves ~79 for the configuration, so `lineIdFits` can refuse a basket the
   intended schema would accept. A dish with many add-ons is the realistic case.
3. **One id has two representations,** converted at every boundary. A missed conversion
   produces a line that cannot be updated or removed, because its key matches nothing.

### The change

```prisma
model CartItem {
  /// Unique within the cart, which is the only scope in which it means anything.
  id     String @db.VarChar(120)
  cartId String @db.VarChar(40)
  // …unchanged…

  options CartItemOption[] @relation("CartItemOptions")

  @@id([cartId, id])
  @@index([foodId])
  @@map("cart_items")
}

model CartItemOption {
  /// Carried so the foreign key can reference the composite parent key.
  cartId     String @db.VarChar(40)
  cartItemId String @db.VarChar(120)
  // …unchanged…

  cartItem CartItem @relation("CartItemOptions", fields: [cartId, cartItemId], references: [cartId, id], onDelete: Cascade)

  @@id([cartId, cartItemId, optionId])
  @@index([optionId])
  @@map("cart_item_options")
}
```

The `@@index([cartId])` on `cart_items` goes away — the composite primary key's leading
column already serves every `WHERE cartId = …` lookup the module makes.

### Backfill

Existing rows carry the prefix and must be stripped, children first, in one transaction:

```sql
ALTER TABLE cart_item_options ADD COLUMN "cartId" VARCHAR(40);

UPDATE cart_item_options o
   SET "cartId" = i."cartId",
       "cartItemId" = substring(i.id FROM position('#' IN i.id) + 1)
  FROM cart_items i
 WHERE o."cartItemId" = i.id;

UPDATE cart_items
   SET id = substring(id FROM position('#' IN id) + 1)
 WHERE position('#' IN id) > 0;
```

Then swap the constraints. Two notes for whoever writes it:

- **Order matters.** The children must learn their new parent key before the parents are
  rewritten, or the foreign key has nothing to point at mid-migration.
- **`position('#' IN id) > 0` is the guard,** not a bare `substring`. A row already
  without a prefix — written by an older build, or by this migration re-run — must be
  left alone rather than beheaded.

Baskets are disposable, so a shortcut is legitimate if the backfill turns awkward:
`DELETE FROM cart_items` before the constraint swap costs customers an unsaved basket and
nothing else. That is a judgement call for whoever runs the deploy; it is *not*
acceptable once `orders` reference these rows, which is exactly why this entry's trigger
is the orders unit.

### Code that changes with it

| File | Change |
|------|--------|
| `backend/src/modules/cart/domain/policies/line-id.ts` | Delete `storedLineId`, `toWireLineId`, `SEPARATOR`; `lineIdFits` compares against the full 120 |
| `backend/src/modules/cart/infrastructure/prisma-cart.repository.ts` | `where` clauses become `{ cartId_id: { cartId, id } }`; `toState` stops stripping |
| `backend/src/modules/cart/application/cart.service.ts` | The width check may move back out of the transaction — it no longer needs the cart id |
| `backend/scripts/verify-cart-live.ts` | The owner-isolation section asserts the constraint instead of the convention |
| `database/prisma/schema/orders.prisma` | Remove the `TEMPORARY` note on `CartItem.id` |

`frontend/` changes **nothing**. The wire id has always been the bare composite value;
that is the property the workaround was chosen to preserve, and it is what makes this
migration a backend-only concern.

### Why not now

The migration rewrites the primary key of two tables and the foreign key between them.
The orders unit will already be altering `orders`, `order_items` and their relationship
to the cart, so doing this inside that migration costs one review of one change instead of
two of two — and avoids a schema-only deploy whose entire content is "make a prefix
unnecessary". Deferring is cheap precisely because the workaround is verified. It stops
being cheap the moment a second writer touches `cart_items`, which is the other trigger.

---

## DSC-2 — `orders.couponId` needs an index

**Opened:** V1 Unit 3 (2026-08-04) · **Scheduled:** the next `orders` migration

### The defect

Checkout enforces both coupon limits by counting orders:

```ts
this.db.order.count({ where: { couponId, userId, status: { in: SPENT_STATUSES } } })
this.db.order.count({ where: { couponId,         status: { in: SPENT_STATUSES } } })
```

`orders.couponId` is a foreign key, and **Postgres does not create an index for a foreign
key** — only for a primary key or a unique constraint. So both counts are sequential scans
over `orders`, on the hot path of every checkout that carries a code.

### Why it is counted from orders at all

Because `coupon_redemptions` — the table designed for this — has a composite foreign key onto
`coupon_claims`, so writing a redemption means owning the claim lifecycle, which belongs to
the promotions unit. `orders.couponId` is a column checkout *does* write, so it is the honest
source for "has this been used" until that unit exists. See
[V1 Unit 3 §5](./V1-unit3-checkout.md).

### The change

```prisma
model Order {
  // …
  @@index([couponId, status])
}
```

Composite rather than on `couponId` alone: both counts filter on `status`, so the index that
serves them is the one that carries it. It is also the index the promotions unit will want
for "how did this campaign perform", which is the same query without the `userId`.

### Why not now

At demo scale `orders` holds tens of rows and the scan is free. It is a one-line schema
change with no data migration, so there is nothing to be gained by rushing it into its own
deploy — and something to be gained by letting the orders unit, which will be altering this
table anyway, carry it. The trigger is that migration or the first time a coupon-heavy
checkout is measurably slow, whichever comes first.

</details>

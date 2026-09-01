# M5 — Menu & inventory

**Module 5 of 32**, from [`FOODORA-BACKEND-REQUIREMENTS.md`](../FOODORA-BACKEND-REQUIREMENTS.md) §3.
Depends on module 4 (catalog & discovery), module 3 (RBAC/PBAC) and module 2 (auth
& sessions). Built and verified **2026-09-01**.

> §3 row 5 states the whole module in a line:
> **availability = merchant switch AND (untracked OR in stock)**

**Verification:** `npm run menu:flow` — 54 checks over a real socket — plus 130 of
the suite's 460 assertions. `npm run verify` is green end to end.

| | |
|---|---|
| Prefix | `/api/v1/menu` |
| Routes | 28 — 3 public, 5 read-with-membership, 20 write |
| Source | [`backend/src/modules/menu/`](../../backend/src/modules/menu/) |
| Prisma models | `Menu`, `MenuSection`, `FoodItem`, `FoodDietary`, `FoodCategory`, `FoodOptionGroup`, `FoodOption`, `InventoryItem`, `StockMovement` |
| Migrations | **none** — see §7 |
| Tests | `tests/menu.test.js` (86), `tests/menu-rules.test.js` (44) |
| Flow | `npm run menu:flow` (54) |

---

## 1. What it does, and what it deliberately does not

**It does:** a vendor's boards (`Menu`, one per `MenuKind`), the headings on them
(`MenuSection`), the dishes (`FoodItem`) with their dietary tags, browse-category
links, prices, prep times and SKUs, the modifier groups and options a dish is
customised with, the stock behind a dish and the append-only movement log that
explains every balance. It answers the customer's menu in
`types/catalog.ts::MenuSectionWithItems[]` — the shape
`services/catalog.ts::getVendorMenu` already consumes — and the merchant's board in
`types/menu.ts::MenuBoardSection[]`.

**It does not:**

- **mint storefronts, branches or staff rows.** Module 15 (onboarding) mints a
  vendor; module 16 mints staff. This module hangs a menu off a storefront that
  already exists and reads `VendorStaff` to decide who may edit it. `ven_` and
  `vbr_` are still absent from `id-prefixes.js`, as M4 left them;
- **price an order.** `POST …/selection` returns `basePrice + Σ priceDelta` so a
  caller can check its own arithmetic, and says in the code that quantity, tax,
  coupons and currency are modules 6 and 7;
- **reserve stock.** `InventoryItem.reserved` is read and reported and never
  written here: what holds a portion is a cart line (module 6) or an unfulfilled
  order (module 8). The subtraction `available = onHand − reserved` is in place so
  those modules add a writer rather than a rule;
- **write `FoodNutrition` or `FoodAllergen`.** Both are `FoodItem`'s relations and
  neither is in `types/catalog.ts::FoodItem`; the AI module writes nutrition
  independently, per `catalog.prisma`. See §11;
- **touch modules 1–4.** No file outside `src/modules/menu/` changed except three
  lines: the id-prefix registry, the v1 route table and `package.json`.

---

## 2. Architecture

```
routes/v1/index.js
  └── menuModule                      { prefix: "/menu" }   ← plain plugin, not `fp`
        ├── repository.js             every Prisma statement, no rules
        ├── availability.js           derived: stock state, availability, menu windows
        ├── options.js                modifier rules, authoring and selection
        ├── service.js                the domain — refusals, ownership, projections
        ├── controller.js             HTTP; resolves the caller's vendor membership
        ├── schemas.js                JSON Schema in and out
        └── routes.js                 28 routes and their guards
```

Two files carry no I/O at all and are covered with no database:
`availability.js` and `options.js`. That split is why `tests/menu-rules.test.js`
can state 44 rules as assertions about values, and why module 6 can call
`checkSelection` from the cart instead of writing the modifier rules a second time.

The module is **not** `fastify-plugin`-wrapped, for module 4's reason: it decorates
nothing, so it takes the encapsulation a plain plugin gets and a `prefix` option
actually applies. It **refuses to boot** without `requireVendorAccess` and
`authz`, because half of it would silently answer "public only" otherwise.

---

## 3. The one rule the whole module turns on

`catalog.prisma` says it on the column and BACKEND-REQUIREMENTS says it in §3:

```
FoodItem.isAvailable  — the merchant's 86 switch. A person flicked it.
read model isAvailable = switch AND (inventory is null OR inventory.inStock)
                                AND section.isActive AND menu.isActive
```

So `isAvailable` is **two different fields with one name**, and the module projects
a dish two ways:

| | `isAvailable` | also carries |
|---|---|---|
| **customer's menu** (`GET /vendors/:id`) | the **derived** answer | — |
| **merchant's board** (`GET /vendors/:id/board`) | the **raw column** | `live`, `suppressed`, `outOfStock`, `stockState`, `reason` |

That asymmetry is deliberate and matches `frontend/lib/menu.ts::isLive`, which
reads `item.isAvailable` as the switch and ANDs it with the section and the stock.
Getting it backwards produces both classic bugs at once — a sold-out dish a
customer can order, and a switch the merchant cannot flick because the screen
thinks it is already off.

`stockState` is `types/menu.ts::StockState` and comes from `lib/menu.ts::stockStateOf`
term for term:

```
no row, or trackStock = false        → "untracked"
onHand − reserved ≤ 0                → "out"
0 < available ≤ lowStockAt (>0)      → "low"
otherwise                            → "in-stock"
```

**`untracked` is an answer, not a default.** Most of a menu is cooked to order;
reporting "0 left" for a dish nobody counts would take the whole menu off sale.

---

## 4. Endpoints

`vendorId` is in **every** path, including the ones that would not need it for
REST's sake. The reason is authorization: module 3's guard is declarative and reads
the vendor out of the path, so a non-member is refused **before any row is read**,
by the same guard on every route. The alternative — resolve the row, then check its
vendor — puts the decision inside twenty-two handlers. The pair still has to agree,
and `service.js` checks that it does (§6).

### Public — no session

| Method | Path | Answers |
|---|---|---|
| GET | `/vendors/:vendorId` | `MenuSectionWithItems[]` — `?kind=` (default `delivery`), `?includeUnavailable=` (default `true`) |
| GET | `/vendors/:vendorId/items/:itemId` | one `FoodItem` |
| POST | `/vendors/:vendorId/items/:itemId/selection` | is this modifier selection orderable, and what does it cost |

A menu that only worked once somebody had signed in would be the wrong shape for a
food platform — the same argument `config/backend.ts` makes about the catalog.
These three are guarded by *what they return*: the derived read model, filtered by
the response schema, with no stock counts, no `sku`, no switched-off sections.

### Membership — any active member

| Method | Path |
|---|---|
| GET | `/vendors/:vendorId/board` — the same rows unfiltered, `?kind=` or `?menuId=` |
| GET | `/vendors/:vendorId/menus` — `?kind=` |
| GET | `/vendors/:vendorId/inventory` — paginated |
| GET | `/vendors/:vendorId/items/:itemId/inventory` |
| GET | `/vendors/:vendorId/items/:itemId/inventory/movements` — `?limit=` |

### Authoring — owner or `manager`

| Method | Path |
|---|---|
| POST / PATCH / DELETE | `/vendors/:vendorId/menus[/:menuId]` |
| POST | `/vendors/:vendorId/menus/:menuId/sections` · `…/sections/order` |
| PATCH / DELETE | `/vendors/:vendorId/sections/:sectionId` |
| POST | `/vendors/:vendorId/sections/:sectionId/items` · `…/items/order` |
| PATCH / DELETE | `/vendors/:vendorId/items/:itemId` |
| POST | `/vendors/:vendorId/items/:itemId/option-groups` |
| PATCH / DELETE | `/vendors/:vendorId/option-groups/:groupId` |
| POST | `/vendors/:vendorId/option-groups/:groupId/options` |
| PATCH / DELETE | `/vendors/:vendorId/options/:optionId` |
| PUT | `/vendors/:vendorId/items/:itemId/inventory` |

### Service — owner, `manager`, `kitchen` or `cashier`

| Method | Path | Why wider |
|---|---|---|
| PUT | `/vendors/:vendorId/items/:itemId/availability` | the pass runs out of sea bass at eight and 86s it |
| POST | `/vendors/:vendorId/items/:itemId/inventory/adjust` | the counter counts what is left at close |

**Reordering is whole-list, not per-row.** `POST …/sections/order` takes every id
in the order they should sit. A drag-and-drop produces an order, not a number, and
sending the order means two people reordering at once cannot interleave into a list
neither chose. A list that is not exactly the live set is refused
(`errors.sectionNotFound` / `errors.itemNotFound`) — a missing id would leave a row
with a stale `sort`, and an extra one is a row from somewhere else.

---

## 5. Which menu is *the* menu

`Menu` has `kind`, `isDefault`, `isActive` and an optional `availableFrom`/
`availableTo` window ("e.g. a breakfast menu"). `resolveMenu` picks one, and each
step is a decision:

1. **active, undeleted menus of the requested `kind`.** `MenuKind` separates the
   delivery board from QR, POS, dine-in and catering, so they never merge;
2. **serving right now**, read in the **branch's** timezone through module 4's
   `localParts`. A breakfast menu belongs to the morning where the restaurant is.
   An inverted pair (`22:00`–`02:00`) is an overnight window. A half-set or
   unparseable window serves all day rather than never — the failure of a
   decorative field must not take a restaurant off sale;
3. **`isDefault` first, then name.** `@@unique([vendorId, kind, name])` makes the
   name a stable tie-break, so two callers a millisecond apart get the same menu.

**There is deliberately no fallback to a menu that is not serving.** A vendor whose
only board is windowed is closed for that kind out of hours, which is what the
window was set to mean; answering with a board the kitchen will not cook from is
worse than answering with nothing. The route returns `[]`, not a 404 — the vendor
exists and simply has nothing on the board at this hour.

The first menu of a kind is forced to `isDefault` whatever the caller said: a kind
with no default resolves to nothing and the storefront looks empty.

---

## 6. Authorization

Module 3's system, and no second one. `requireVendorAccess("vendorId")` on every
non-public route, at three widths, and then a second check in the service.

### The two layers, and why both

| Layer | Question | Failure |
|---|---|---|
| the route guard | may this caller act on **this vendor**? | 401 / 403 |
| `service.js::ownedBy` | does the row they also named **belong to it**? | **404** |

The second is not redundant. The guard proves membership of the vendor in the path;
it says nothing about the section, item, group or option id in the same path. So
every write re-reads the row and compares its `vendorId` — the denormalised column
`catalog.prisma` put on `MenuSection` and `FoodItem` precisely so this is one
comparison rather than a join.

**A mismatch is a 404, not a 403.** A restaurant owner probing ids must not be able
to learn which of them exist at a competitor. This is the same reasoning M4 applied
to a `pending` storefront.

### Staff roles, and why roles and not staff permissions

`frontend/lib/staff.ts::STAFF_PERMISSIONS` is the authority:

| Staff role | `menu.manage` | `kitchen.operate` | `pos.operate` |
|---|---|---|---|
| `owner` | ✓ | ✓ | ✓ |
| `manager` | ✓ | ✓ | ✓ |
| `kitchen` | — | ✓ | — |
| `cashier` | — | — | ✓ |
| `support` | — | — | — |

So authoring is `owner`/`manager` and the 86 switch and stock adjustments are
`owner`/`manager`/`kitchen`/`cashier`. The owner is never listed in a requirement:
`policy.js` treats `via === "owner"` as satisfying any `staffRole`, on the same
grounds `lib/staff.ts` gives the owner the whole grant table.

**Why the role and not the permission.** `types/staff.ts::StaffPermission` slugs are
**not** `Permission` rows — `menu.manage` does not exist in the database, and
`seed/data/reference.js` holds the closed set of twenty platform slugs. M3 recorded
this as a documented gap that **module 16** closes. Until it does, vendor
authorization is membership plus `VendorStaff.role`, and
`service.js::MANAGE_ROLES` / `SERVICE_ROLES` is where module 16 will find the
mapping it has to preserve.

A member who is not `active` folds to nothing — module 3's `vendorAccess` requires
`StaffStatusKind.ACTIVE`, which is `lib/staff.ts::effectivePermissions`' rule: a
deactivated manager who still held `menu.manage` would be a suspension that
suspended nothing.

### No platform desk edits a merchant's menu

Every write requirement names a `vendor` and **no permission**, which `policy.js`
calls the merchant-dashboard shape: the right to act comes from working there.
There is no platform permission for editing a menu — the closest,
`restaurants.approve`, is about approving and suspending a restaurant, not
repricing its pizza — and inventing one would mean changing module 1's verified
reference data. Support and admin surfaces that need to read a menu use the public
route, which is public.

### Branch scope

`VendorStaff.branchId` is `catalog.prisma`'s answer to "which location does this
person work at"; `null` means every branch.

- **Inventory** rows carry `branchId`. A branch-scoped member may read and move
  their branch's shelves and the vendor-wide (`branchId: null`) ones, and **not**
  another branch's — a row they may not touch is a 404, and their inventory listing
  excludes it;
- **Menu authoring is refused outright** for a branch-scoped member, with a 403
  naming the branch. `Menu`, `MenuSection` and `FoodItem` carry a `vendorId` and no
  `branchId`, so a manager at one location editing "the menu" edits every
  location's. Refusing is the honest answer until the schema models a per-branch
  menu; §12 names what that would take.

---

## 7. The database

**No migration, and none was needed.** Still 4 migrations, no drift
(`npm run db:status` — *"Database schema is up to date!"*). Everything below
already existed:

| Model | Used for | Notes |
|---|---|---|
| `Menu` | a board per `MenuKind` | `@@unique([vendorId, kind, name])` is enforced as a refusal, not a 409 |
| `MenuSection` | headings | `vendorId` denormalised **from the menu**, never from the caller |
| `FoodItem` | dishes | `vendorId` denormalised from the section; `slug` is globally `@unique` |
| `FoodDietary` | tags | a set — a patch replaces it wholesale |
| `FoodCategory` | dish → browse category | ids validated against `Category` before a write |
| `FoodOptionGroup` | modifier groups | `foodId` is **required and single** — see below |
| `FoodOption` | options | `priceDelta` may be negative, as the schema says |
| `InventoryItem` | the balance | one row per counted dish; **absent** means untracked |
| `StockMovement` | why the balance is what it is | append-only, never soft-deleted |

### A modifier group belongs to exactly one dish

The brief asks for "item ↔ modifier-group relationships" and the database does not
have one: `FoodOptionGroup.foodId` is a required, single foreign key. There is no
library of shared groups and no join table, so *attaching* a group to an item **is**
creating it on the item, and a group can never point at the wrong dish because it
has nowhere else to point. The frontend agrees —
`types/catalog.ts::FoodItem.optionGroups` is an owned array, and `lib/menu.ts` edits
groups inside the item dialog. A reusable-group library is a real feature and a real
schema change; it is deferred in §12 rather than smuggled in.

### Conventions honoured

- **Application-generated ids.** Seven prefixes registered:
  `menu_`, `sec_`, `food_`, `fog_`, `fop_`, `inv_`, `stk_`. `sec_` and `food_` are
  the prefixes `lib/mock/menus.ts` and `lib/mock/foods.ts` already use, so a section
  or a dish keeps the shape the frontend's fixtures have;
- **Soft delete is absolute.** `deletedAt` on menus, sections, items, groups,
  options and inventory rows; `delete` is refused by the Prisma extension. **Every
  nested `include`/`select` of a soft-deletable relation carries its own
  `deletedAt: null`** — the extension sees the top-level model only, and a deleted
  option rendered inside a live dish would be a *priced* leak;
- **Optimistic locking.** Every menu, section, item and inventory update is a
  `updateMany` guarded by `version`. Zero rows matched is a `CONFLICT` (409), not a
  not-found — `main.prisma` §4;
- **Money and quantities stay `Decimal`** through every calculation and become
  `number` once, in `toJsonSafe`, at the boundary;
- **Enums translate both ways** through `toDbEnum`/`toApiEnum`, never by hand.

Deleting a menu does **not** stamp the sections and dishes under it: they cascade in
PostgreSQL and are unreachable through this module once the menu is gone, and
stamping thousands of rows to express one fact turns a restore into archaeology.

---

## 8. Validation and the error contract

One contract, three layers, and each catches what the others cannot.

| Layer | Catches | Answers |
|---|---|---|
| JSON Schema (Fastify/Ajv) | shape: a malformed id, a negative price, an empty option array, an unknown enum, an undeclared field | **400** `BAD_USER_INPUT` |
| `service.js` domain rules | a blank name, a zero price, a strike-through that is not a discount, an illegal group, a bad stock number, a duplicate menu name | **200** `{ success: false, error: { key, path } }` |
| ownership / membership | not a member, wrong staff role, another vendor's row | **401 / 403 / 404** |
| `version` guard | somebody wrote first | **409** `CONFLICT` |

**Domain violations are refusals, not exceptions**, and the keys are the frontend's
own `types/menu.ts::MenuError` members — `errors.nameRequired`,
`errors.priceRequired`, `errors.sectionNotFound`, `errors.itemNotFound`,
`errors.optionRangeInvalid`, `errors.optionsRequired`, `errors.stockInvalid`. All
seven exist in `messages/en.json`, `bn.json` and `ar.json` under `menuBuilder.errors.*`,
which is the namespace the menu builder's translator already reads. `path` names the
field, so a form highlights it.

The response schema is the second, independent guarantee: `foodItemSchema` is
`types/catalog.ts::FoodItem` field for field, so `sku`, `prepMinutes`, `sort`,
`version`, a stock count and the raw availability switch **cannot** reach a public
menu however the service is later changed. A flow check and a test both assert it by
searching the serialised body.

---

## 9. Modifier rules

### Authoring — `options.js::groupError`

`frontend/lib/menu.ts::optionGroupError`, term for term:

```
name non-empty ∧ options ≥ 1 ∧ min ≥ 0 ∧ max ≥ 1 ∧ min ≤ max
  ∧ max ≤ live options ∧ (required → min ≥ 1) ∧ every option named
```

Three consequences worth stating:

- **A group is created with its options in one call.** `max ≤ options.length` is one
  of the group's own rules and an empty group cannot satisfy it, so there is no
  moment at which a half-built group is readable by a customer — and the customiser
  renders whatever it is given;
- **The group is judged on the state a write *would* produce**, not on the patch. An
  update that deactivates two options and lowers `max` in one breath is legal; doing
  only the first is refused. Switching an option off and deleting one both re-judge
  the group they left;
- **`min ≥ 1` with `required: false` is accepted**, because `optionGroupError`
  accepts it and the frontend's dialog can produce it. Selection treats `min` as the
  authority, so the pair cannot disagree about what a customer must do — the flag
  only decides how the group is labelled.

On the public projection, inactive options are dropped and `max` is clamped to what
is left (and `min` to `max`). A group of three with `max: 3` and one option switched
off would otherwise ask a customer to pick up to three of two. The stored numbers are
untouched, so turning the option back on restores the group with no write. A group
with no live options is dropped from the customer's dish entirely.

### Selection — `options.js::checkSelection`

`POST …/selection` is a **query**, answered at 200 with `success: true` whatever the
verdict:

```
{ valid, violations: [{ code, groupId, optionId, min?, max?, chosen? }], selected, basePrice, unitPrice }
```

Codes: `item-unavailable`, `unknown-option`, `inactive-option`, `duplicate-option`,
`min-selections`, `max-selections`.

**Why a report and not a refusal.** `envelope.js` requires a refusal's `key` to be an
i18n key the client can render, and the three locale files have no message for "choose
at least two toppings" — `components/cart/item-customizer.tsx` makes an invalid
selection *unclickable* rather than explaining it, so the string was never needed.
Inventing keys here would put untranslated text on a screen. The codes are
machine-readable, every violation is reported at once rather than the first, and
module 6 maps them when it builds the surface that renders them.

An option from another dish's group and an option that is switched off are both
`unknown-option`. From the customer's side they are the same mistake, and
distinguishing them would let somebody enumerate a competitor's menu by id.
`selected` holds only the ids that were accepted, so a caller cannot price a rejected
option.

---

## 10. Inventory and stock

### The row is created on first use

`InventoryItem.foodId` is nullable-and-unique — one row per sellable dish, *"null for
a raw ingredient"*. A menu of forty dishes nobody counts should be forty **absent**
rows, not forty rows of zero, because `availability.js` reads an absent row as
untracked and that is what it is. `PUT …/inventory` creates the row; `trackStock:
false` stops the count deciding anything without discarding it.

### Every balance change writes a movement

`StockMovement` is *"why"* the balance is what it is, and a balance that moved with no
movement behind it is the hole the table exists to prevent. So:

- the opening balance is written as a `received` movement;
- an outright count (`PUT`) writes the **difference** as an `adjusted` movement;
- an adjustment (`POST …/adjust`) writes the delta.

The invariant `balance[n] = balance[n-1] + quantity[n]` is asserted in both the test
suite and the flow, by walking the ledger and comparing the running sum to the row.

### The atomic adjustment

§8 of the brief asks for no race-prone read-then-write. `repository.js::adjustStock`
is one guarded statement inside a transaction:

```sql
UPDATE inventory_items
   SET "onHand" = "onHand" + $delta, version = version + 1
 WHERE id = $id AND version = $version AND "deletedAt" IS NULL
   AND "onHand" >= $floor            -- only when the delta is negative and tracked
```

PostgreSQL evaluates the predicate and applies the increment in one statement under
one row lock, so two terminals selling the last portion cannot both see `1`. The
count that comes back is the verdict: **1** means it happened; **0** means either the
version moved (→ 409, try again) or there was not enough stock (→ refusal), and the
service re-reads to say which. The row is re-read *inside* the transaction so the
movement's `balance` is the balance it actually produced.

Both the test suite and the flow fire two adjustments concurrently at a balance of
one and assert that exactly one wins, that the balance is `0` and never negative, and
that **the loser left no movement behind**.

### Three policy decisions

- **The sign must match the word.** `catalog.prisma` says *"Signed: received > 0,
  sold < 0"*, so a `sold` movement of `+5` is refused. `adjusted` and `transferred`
  are exempt — a correction goes either way and a transfer is a receipt at one branch
  and an issue at the other;
- **A tracked balance may not go below zero**, enforced in the `WHERE` clause;
- **An over-decrement is refused, not floored.** `lib/menu.ts::adjustStock` floors at
  zero, and that is right for a slider a person is dragging. It is wrong here:
  writing a −3 that only moved −2 would record a movement that never happened and
  break the ledger's arithmetic. The refusal names the field
  (`errors.stockInvalid`, `path: "delta"`) and the caller re-reads to see what is
  left. **This is the one deliberate divergence from the frontend's own stock
  helper**, and §11 records it.

`reserved` is read, reported and never written — see §1.

---

## 11. Frontend contract

The customer's menu is `services/catalog.ts::getVendorMenu`'s answer, field for
field. `GET /api/v1/menu/vendors/:vendorId` returns exactly what
`lib/graphql/catalog.operations.ts::VENDOR_MENU` selects: `id`, `vendorId`, `name`,
`sort`, `createdAt`, `updatedAt`, `deletedAt`, `items[]`, and each item is
`FOOD_FIELDS` — including `optionGroups { id name required min max options { id name priceDelta } }`.
Both the suite and the flow assert the key list.

The merchant's board maps to `types/menu.ts::MenuBoardSection` and `MenuBoardItem`.

### Five deltas, all deliberate and none silently applied

1. **`MenuBoardItem.authored` is absent.** It means "created on this device rather
   than seeded" — a fact about the prototype's local draft, not about a row.
2. **`MenuItemStock` is widened.** The frontend's is
   `{ foodId, quantity, lowStockThreshold, updatedAt }`; the API adds `reserved`,
   `available`, `unit`, `trackStock`, `branchId`, `inventoryId`, `version`.
   `quantity` is `onHand` — what a cook counting the shelf wants — and `available`
   (`onHand − reserved`) is the number availability is decided on. **They are equal
   today** because nothing reserves anything before module 6; when it does,
   `lib/menu.ts::stockStateOf`, which reads `quantity`, would disagree with the
   server's `stockState`. The server sends `stockState` explicitly so the client can
   stop deriving it.
3. **Stock may be fractional.** The column is `Decimal(14,3)` and a kilogram of
   chicken is not an integer; the frontend's `errors.stockInvalid` message says
   "whole number". The API accepts decimals; the merchant's editor is integer-only
   and stays correct as a subset.
4. **An over-decrement is refused rather than floored** — §10.
5. **`Menu` has no frontend counterpart at all.** The prototype has one implicit menu
   per vendor. `?kind=` defaults to `delivery`, so an unchanged caller gets the board
   it expects.

### Mismatches to record, not to fix here

- **`services/catalog.ts` still speaks GraphQL.** `getVendorMenu` issues
  `VENDOR_MENU` through Apollo; this API is REST. `NEXT_PUBLIC_BACKEND_CATALOG` is
  already `0` (set by M4) and must stay `0`. The cutover is a frontend phase's call,
  exactly as M4 left it. **No frontend file was changed by this module.**
- **The seven `MenuError` keys are not in `RENDERABLE`.** `lib/graphql/result.ts`
  whitelists only the auth and transport keys, so a refusal carrying
  `errors.optionRangeInvalid` *through that path* degrades to `errors.generic`. It
  does not matter today — the menu builder reads its keys directly through
  `useTranslations("menuBuilder")` and never through `renderableKey` — but the
  cutover must add the seven keys to `RENDERABLE` or route menu refusals around it.
- **`lib/menu.ts`'s draft model.** The prototype stores a *diff* per vendor in
  `stores/menu` because the catalog is a read-only seed. This API makes each
  operation a write, which is what `types/menu.ts` says Phase E would do: *"Phase E
  replays the same patches as mutations and the shapes do not change."* The action
  signatures line up one to one — `createSection`, `patchSection`, `moveSection`,
  `setSectionEnabled`, `createItem`, `editItem`, `putOptionGroup`, `setStock`,
  `adjustStock`, `untrackStock`.

---

## 12. Known limitations and deferred work

| # | Limitation | Why it is not fixed here |
|---|---|---|
| L1 | **No reusable modifier-group library.** A group belongs to one dish. | `FoodOptionGroup.foodId` is required and single. A library needs a new table and a migration; the frontend's own type is an owned array. |
| L2 | **No per-branch menu.** Authoring is vendor-wide and a branch-scoped member is refused it. | `Menu`, `MenuSection` and `FoodItem` carry no `branchId`. Modelling it means a branch override table, which the database phase deliberately did not build. |
| L3 | **`reserved` has no writer.** | Modules 6 and 8 own it. The subtraction is in place. |
| L4 | **Reordering is N updates in a loop.** | Bounded by a menu's section/item count (tens). A single `CASE` statement would be raw SQL, which §8 of the brief discourages without need. |
| L5 | **No `FoodNutrition` or `FoodAllergen` endpoints.** | Neither is in `types/catalog.ts::FoodItem`; nutrition is written independently by the AI module per `catalog.prisma`. Returning them would be inventing a contract. |
| L6 | **No bulk import/export.** | A menu CSV importer is a real merchant feature and a module of its own. |
| L7 | **Item images are URLs, not uploads.** | File storage is module 25. |
| L8 | **`updatedBy` is written on items only.** | Only `FoodItem` has the column. |
| L9 | **A vendor with no primary branch reads menu windows as UTC.** | Logged at `warn`. A storefront without a branch is an onboarding bug (module 15), not something to fail a menu read over. |
| L10 | **`errors.stockInvalid` carries no current balance.** | The refusal envelope is `{ key, path }` and widening it would be a second error format. The caller re-reads. |

**Intentionally deferred**, i.e. named and not started: menu scheduling beyond the
one window per menu, price tiers per channel (`MenuKind` exists but prices do not
vary by it), combo/meal-deal items, ingredient-level inventory (`InventoryItem.foodId`
is nullable for exactly that and this module writes only dish rows), supplier and
purchase orders, waste reporting beyond the `wasted` movement kind, and the staff
*permission* vocabulary (module 16 — §6).

---

## 13. Tests

| File | Assertions | Runs against |
|---|---|---|
| `tests/menu-rules.test.js` | 44 | nothing — pure functions |
| `tests/menu.test.js` | 86 | real PostgreSQL, through the mounted routes |
| `scripts/menu-flow.js` | 54 | real PostgreSQL, over a real socket, limiter **on** |

`menu-rules.test.js` covers stock states (including fractions, `reserved` and the
inclusive low threshold), the availability fold and the order of its reasons, menu
windows (overnight, timezone, unparseable), menu resolution, every authoring rule and
every selection rule.

`menu.test.js` covers what a function call cannot: the guards, the ownership
re-check, the response filtering and the transaction. Its fixtures are two
storefronts owned by two different people, and vendor A carries a full staff table —
a manager, a kitchen hand, a cashier, a manager scoped to the second branch and a
deactivated manager.

### The matrix that matters

| Case | Expected | Covered |
|---|---|---|
| owner authors | 200 | ✓ |
| manager authors | 200 | ✓ |
| kitchen authors | 403 | ✓ |
| kitchen 86s a dish | 200 | ✓ |
| cashier 86s a dish | 200 | ✓ |
| customer 86s a dish | 403 | ✓ |
| deactivated manager, anything | 403 | ✓ |
| another vendor's owner, same platform role | 403 | ✓ |
| branch-scoped manager authors a menu | 403 + the branch named | ✓ |
| branch-scoped member reads another branch's stock | 404 | ✓ |
| branch-scoped member's inventory listing | other branch absent | ✓ |
| owner (no branch) reads every shelf | 200, both | ✓ |
| a row id from another vendor | **404**, not 403 | ✓ menu, section, item, option |
| signed out, any write | 401 | ✓ |
| signed out, the customer's menu | 200 | ✓ |
| min > max, max > options, required with min 0 | refusal | ✓ |
| widening `max` beyond the options | refusal | ✓ |
| switching off / deleting an option that breaks its group | refusal | ✓ |
| a switched-off option on the customer's dish | absent, `max` clamped | ✓ |
| stock: increase, decrease, out, restore, untrack | as §10 | ✓ |
| stock below zero | refusal, nothing written | ✓ |
| sign contradicting the movement kind | refusal | ✓ |
| two concurrent sales of the last portion | exactly one wins, one movement | ✓ |
| the ledger sums to every recorded balance | ✓ | ✓ |
| `sku` / `prepMinutes` / a count on a public menu | absent | ✓ |

---

## 14. Verification

```bash
cd backend
npm run db:validate      # the schema is valid
npm run db:status        # 4 migrations, no drift
npm run check:forbidden  # no TypeScript, NestJS, Redis, Docker, GraphQL
npm test                 # 460 assertions against real PostgreSQL
npm run auth:flow        # 51
npm run catalog:flow     # 49
npm run menu:flow        # 54
npm run verify           # all of the above, in order
```

**Result, 2026-09-01, against PostgreSQL 18 on `localhost:5433`:**

```
✓ 81 JavaScript files, 14 dependencies — no TypeScript, NestJS, Redis, Docker or GraphQL.
# tests 460   # pass 460   # fail 0
✓ 51/51 checks passed      (auth:flow)
✓ 49/49 checks passed      (catalog:flow)
✓ 54/54 checks passed      (menu:flow)
Database schema is up to date!   (4 migrations, no drift)
```

Modules 1–4 are unchanged and their suites pass unmodified: 330 assertions before
this module, 460 after, with no edits to any existing test.

---

## 15. Recommended next

**Module 6 — Cart.** It is the module this one was shaped for: `checkSelection` is
the function it should call rather than re-deriving the modifier rules, `available`
is the flag it should honour before adding a line, and `InventoryItem.reserved` is
the column it should finally write.

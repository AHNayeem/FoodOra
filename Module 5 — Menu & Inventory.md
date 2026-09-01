# FoodOra — Implement Backend Module 5: Menu & Inventory

You are working on the **FoodOra** backend.

The project has already completed and verified:

* Backend foundation — F1
* Module 2 — Authentication & Sessions
* Module 3 — RBAC / PBAC
* Module 4 — Catalog & Discovery

The next task is:

> **Module 5 — Menu & Inventory**

Read the repository and the existing module documents before changing anything.

---

## 1. Non-negotiable constraints

Follow these rules strictly:

* Backend is **Fastify + Prisma + PostgreSQL**
* **JavaScript only** — absolutely no TypeScript
* No NestJS
* No GraphQL
* No Redis
* No Docker
* No new backend framework
* Do not replace or rewrite the existing backend foundation
* Do not modify verified Modules 1–4 unless a genuine Module 5 dependency requires it
* Do not invent database tables/fields if the existing schema already models the requirement
* Do not duplicate domain logic that already exists elsewhere
* Follow the architecture, naming, validation, error, response and authorization conventions established by Modules 2–4
* Do not implement unrelated future modules
* Do not mark anything complete without actually testing it

This is a **production-ready prototype backend**: external integrations are not required, but the API/domain boundaries must be suitable for connecting real services later.

---

# 2. First: inspect before implementing

Before writing code, inspect:

1. `FOODORA-MODULE-CHECKLIST.md`
2. `FOODORA-DATABASE-DESIGN.md`
3. `Analysis.md`
4. `backend/F1-fastify-foundation.md`
5. `backend/M2-auth-sessions.md`
6. `backend/M3-rbac-pbac.md`
7. `backend/M4-catalog-discovery.md`
8. Prisma schema and migrations
9. Existing Module 4 catalog implementation
10. Existing frontend menu/inventory mock/service contracts
11. Existing backend test/flow conventions

Determine exactly which existing Prisma models belong to Module 5.

**Do not redesign the database just because a different design seems cleaner.**

If the database already contains the required structures, use them as the source of truth.

---

# 3. Module 5 functional scope

Implement the backend for the existing **Menu & Options** and **Inventory & Stock** domain.

## A. Menu management

Support the domain operations already represented by the schema/frontend, including as applicable:

* restaurant/branch menu retrieval
* menu creation/update where authorized
* menu sections/categories
* menu item creation/update
* item descriptions
* item pricing
* item availability
* item ordering/sorting
* active/inactive menu items
* branch-specific menu relationships
* appropriate item/category relationships

Do not expose fields that the schema does not support.

---

## B. Options / modifiers

Implement the existing modifier model and rules, including where supported:

* modifier groups
* modifier options
* required vs optional groups
* minimum selections
* maximum selections
* option price adjustments
* item ↔ modifier-group relationships
* ordering
* active/inactive state

Validate selection constraints correctly.

Examples:

* `minSelections <= maxSelections`
* required groups cannot accept an invalid zero-selection state
* maximum selections cannot exceed available options
* inactive options cannot be selected
* an option must belong to the correct modifier group
* an item may only reference valid modifier groups

Use the actual schema as the authority for exact rules.

---

# 4. Inventory & stock

Implement the inventory/stock behavior represented by the current database design.

Cover, where modeled:

* stock-tracked menu items
* current stock/availability
* stock quantity
* stock adjustments
* increase/decrease operations
* out-of-stock state
* restoring stock
* branch-specific stock
* inventory history/audit information if already modeled

Important:

**Do not invent an elaborate warehouse/inventory system if the current FoodOra schema does not require one.**

The goal is to implement the existing FoodOra prototype domain completely, not introduce a new inventory product.

---

# 5. Authorization

Use the existing Module 3 RBAC/PBAC system.

Do not create a second authorization mechanism.

Correctly distinguish between:

* customer/read-only access
* restaurant owner
* restaurant/cafe/home-chef/cloud-kitchen/catering vendor roles
* vendor managers/staff where applicable
* platform/admin roles

Enforce **resource ownership and branch/vendor boundaries**, not merely role checks.

For example:

A restaurant owner should not be able to modify another restaurant's menu simply because both users have the same role.

Likewise, vendor staff should only access resources allowed by their existing membership/permission model.

Reuse the existing `requireUser` and authorization infrastructure.

---

# 6. API design

Follow the REST conventions established by Module 4.

Use the existing API prefix and response/error contract.

Prefer resource-oriented endpoints such as:

* menu retrieval
* menu item CRUD
* modifier group/option management
* inventory retrieval
* stock adjustment
* availability updates

But **do not blindly use these endpoint names**.

First inspect Module 4's actual route structure and the frontend contract, then choose names consistent with the existing API.

Routes must be thin.

Business rules should live in the appropriate service/domain layer, not inside Fastify route handlers.

---

# 7. Validation

Use the project's existing validation mechanism.

Validate:

* IDs
* required fields
* prices
* quantities
* selection limits
* enum/state values
* ownership
* branch relationships
* duplicate relationships
* invalid state transitions
* malformed requests

Return errors using the existing backend error contract.

Do not introduce a second validation/error format.

---

# 8. Prisma/database rules

Use the existing Prisma client/layers.

Important:

* no raw SQL unless the existing architecture requires it
* preserve existing constraints
* use transactions for operations that must be atomic
* prevent negative stock where the schema/domain rules prohibit it
* avoid race-prone read-then-write stock updates
* preserve data integrity across menu → item → modifier → inventory relationships

If a migration is genuinely required, explain why before applying it.

Do not make speculative schema changes.

---

# 9. Frontend contract compatibility

Inspect the existing frontend implementation.

Find:

* menu services
* menu stores
* inventory stores
* mock data
* GraphQL/mock contracts
* types/interfaces
* existing UI assumptions

Determine what the backend needs to return so that the existing frontend can eventually switch from mock data to REST.

Do **not** rewrite the frontend as part of Module 5 unless absolutely necessary to verify the contract.

If the frontend still uses mock data or GraphQL, document the mismatch rather than silently changing unrelated frontend architecture.

---

# 10. Testing requirements

This module is not complete until it is verified against **real PostgreSQL**.

Create a dedicated Module 5 test/flow command following the conventions of Modules 2–4.

Test at minimum:

### Menu

* create/read/update valid menu data
* invalid menu data
* menu ownership
* cross-vendor access rejection
* branch isolation
* item creation/update
* item availability
* item ordering

### Modifiers

* create modifier group
* create options
* attach group to item
* valid selection constraints
* invalid min/max constraints
* invalid option/group relationships
* inactive option behavior
* unauthorized modification
* cross-vendor access rejection

### Inventory

* read stock
* valid stock increase
* valid stock decrease
* out-of-stock transition
* restore stock
* invalid quantity
* negative-stock protection
* unauthorized stock adjustment
* branch/vendor isolation
* concurrent/atomic update behavior where relevant

### Integration

Verify a realistic flow:

> vendor → branch → menu → section → item → modifier group → modifier option → inventory/availability

Then verify that the resulting data can be retrieved through the API in the shape expected by the frontend contract.

---

# 11. Verification standard

Follow the project's existing principle:

> **A feature is complete only when it is driven end-to-end, not merely inspected.**

Therefore:

* run the backend
* connect to real PostgreSQL
* execute the Module 5 flow
* verify successful cases
* verify rejection cases
* verify authorization
* verify database state
* verify API responses
* verify important transaction behavior

Do not count source-code inspection as verification.

---

# 12. Regression checks

After Module 5 is implemented, run the existing regression suite for:

* backend foundation
* reference seeder
* authentication/session flows
* RBAC/PBAC
* catalog/discovery
* forbidden technology check
* Prisma validation/generation
* existing database integrity checks

Module 5 must not break Modules 1–4.

---

# 13. Documentation

Create:

`backend/M5-menu-inventory.md`

Document:

1. module purpose
2. scope
3. implemented routes
4. service/domain structure
5. Prisma models used
6. authorization rules
7. validation rules
8. modifier rules
9. inventory/stock rules
10. frontend contract
11. verification command
12. verification results
13. known limitations
14. intentionally deferred functionality

Update the master module checklist **only after verification succeeds**.

Do not claim `[x]` merely because implementation exists.

---

# 14. Definition of Done

Module 5 is complete only when all of the following are true:

* [ ] Existing schema/domain has been inspected
* [ ] Menu backend implemented
* [ ] Menu item backend implemented
* [ ] Modifier groups/options implemented
* [ ] Modifier validation implemented
* [ ] Inventory/stock backend implemented
* [ ] Availability/stock rules implemented
* [ ] Ownership/branch authorization enforced
* [ ] REST routes wired to Prisma
* [ ] Existing error/response/validation conventions followed
* [ ] Real PostgreSQL verification completed
* [ ] Positive cases tested
* [ ] Negative cases tested
* [ ] Authorization cases tested
* [ ] Existing Module 1–4 regression suite passes
* [ ] Forbidden technology check passes
* [ ] `backend/M5-menu-inventory.md` created
* [ ] Master checklist updated accurately
* [ ] No unrelated module implemented

---

# 15. Final report

At the end, provide a concise report containing:

### Module

`Module 5 — Menu & Inventory`

### Implementation

* routes created
* services/domain logic created
* Prisma models used
* migrations, if any

### Verification

* exact command(s) executed
* number of assertions/checks
* PostgreSQL verification status
* authorization verification
* regression status

### Files changed

List only important files.

### Checklist changes

Show exactly which Module 5 checklist cells changed.

### Remaining limitations

Only list genuine limitations.

### Important

If something cannot be verified, leave it unchecked and explicitly explain why.

**Do not stop after writing the code. Implement → test → fix failures → rerun → verify → document → update the checklist.**

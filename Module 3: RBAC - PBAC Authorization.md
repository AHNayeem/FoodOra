# FoodOra — Module 3: RBAC / PBAC Authorization

Module 2 — Auth & Sessions is complete and verified.

Now implement ONLY:

# Module 3 — RBAC / PBAC

Do NOT implement Module 4 or any other business module.

---

## CURRENT STATE

The backend is:

- Node.js
- Fastify
- JavaScript
- Prisma
- PostgreSQL

Forbidden:

- TypeScript
- NestJS
- Redis
- Docker
- GraphQL

Module 2 authentication is already implemented and verified.

The authentication layer currently provides:

- authenticated identity
- `request.account`
- `requireUser`
- session validation
- token validation
- account-state validation

Reuse the existing authentication foundation.

Do NOT redesign authentication.

---

# SOURCE OF TRUTH

Before coding, read:

1. docs/FOODORA-MODULE-CHECKLIST.md
2. docs/FOODORA-BACKEND-REQUIREMENTS.md
3. docs/FOODORA-DATABASE-DESIGN.md
4. docs/backend/F1-fastify-foundation.md
5. docs/backend/M2-auth-sessions.md
6. Current frontend RBAC/permission-related implementation
7. Relevant frontend/types/*
8. Current Prisma schema under database/

Do NOT read or depend on the deleted legacy NestJS backend.

---

# EXISTING AUTHORIZATION DATA

The database phase already established:

- 14 roles
- 20 permissions
- 54 role-permission assignments
- user role assignments
- vendor/staff permission-related structures

Registration already creates user role assignments.

Do NOT recreate these tables or seed duplicate roles/permissions.

First inspect the exact Prisma models, enums, relationships and seeded vocabulary.

---

# OBJECTIVE

Turn the existing role/permission data into actual backend authorization behavior.

The backend must be able to answer:

1. Who is the authenticated user?
2. What roles does the user have?
3. What permissions does the user's roles grant?
4. Is the user allowed to perform this action?
5. Where required, does the user have access to the specific resource/account/vendor/restaurant/etc.?

Authentication answers:

> Who are you?

Authorization answers:

> What are you allowed to do?

Keep these concerns separate.

---

# STEP 1 — AUDIT THE EXISTING RBAC MODEL

Inspect the finalized database and documentation.

Determine exactly:

- Role model
- Permission model
- Role-permission relation
- User-role relation
- Vendor staff relation
- Staff permissions
- Any account/vendor scoping
- Any ownership relationships
- Any existing PBAC-related fields
- Role/status constraints
- Permission naming convention

Do not invent another authorization model if the finalized database already defines one.

Document the discovered model before implementation.

---

# STEP 2 — AUDIT FRONTEND AUTHORIZATION

Inspect the current frontend for:

- role checks
- permission checks
- route guards
- dashboard visibility
- menu visibility
- action visibility
- disabled actions
- role-specific pages
- vendor/staff access
- admin access
- rider access
- customer access
- permission constants
- authorization helpers

Determine how the frontend currently expresses authorization.

The frontend is important for understanding expected behavior, but backend authorization must remain authoritative.

A hidden button is NOT authorization.

---

# STEP 3 — AUTHORIZATION SERVICE

Create a clean authorization service.

Conceptually it should support operations such as:

```text
hasRole(user, role)
hasAnyRole(user, roles)
hasPermission(user, permission)
hasAnyPermission(user, permissions)
hasAllPermissions(user, permissions)
authorize(user, requirement)
```
Use the actual architecture/naming already established by F1/M2 where appropriate.

Do not blindly copy these function names if the existing foundation already defines them.

# STEP 4 — ROLE RESOLUTION

Resolve the user's effective roles from the database.

Consider:

active role assignments
inactive/revoked assignments
account state
role state
assignment scope

Do not trust client-supplied roles.

Do not trust arbitrary JWT role/permission claims.

Database-backed authorization must remain authoritative where required.

# STEP 5 — PERMISSION RESOLUTION

Resolve effective permissions from:

User
 ↓
User Role Assignments
 ↓
Roles
 ↓
Role Permissions
 ↓
Permissions

Return normalized permission identifiers.

Respect the Prisma enum convention discovered in the database phase:

Prisma client uses enum identifiers, not PostgreSQL mapped values.

Do not introduce string mismatches between:

COMPLETED

and:

completed

or equivalent permission/role vocabularies.

# STEP 6 — REQUEST CONTEXT

Integrate authorization with the existing authenticated request context.

The existing authentication layer provides:

request.account

Use that as the authenticated identity.

Do not duplicate authentication.

Where appropriate expose effective authorization context, for example:

request.auth

or the existing project convention.

Keep the implementation minimal and deterministic.

# STEP 7 — AUTHORIZATION HOOK

Create a reusable Fastify authorization mechanism.

It should allow future routes to declare authorization requirements.

Conceptually:

requirePermission("ORDER_VIEW")

or:

authorize({
  permission: "ORDER_UPDATE"
})

Use the actual permission identifiers from the database.

Do not hard-code arbitrary permissions that do not exist.

The mechanism must support future modules without requiring each module to reinvent authorization.

# STEP 8 — RBAC

Implement role-based authorization.

Support the actual roles present in the database.

Do not assume the system has only:

Customer
Restaurant
Rider
Admin

Use the 14 roles actually defined by the product/database.

For each role determine:

role identifier
purpose
assigned permissions
scope if applicable

Do not change role definitions unless the current product documentation identifies a genuine gap.

# STEP 9 — PBAC / RESOURCE SCOPING

RBAC alone may not be enough for FoodOra.

Inspect the current product requirements for resource-level authorization.

Examples to investigate:

Admin
→ platform-wide access

Vendor owner
→ own vendor data

Vendor staff
→ assigned vendor only

Restaurant staff
→ permitted restaurant operations

Rider
→ assigned delivery/order context

Customer
→ own account/orders/addresses

Do NOT implement speculative rules.

Only implement resource scoping that is supported by:

current frontend
documentation
database relationships

Where a resource-level rule is required, enforce it server-side.

# STEP 10 — OWNERSHIP / SCOPE

Pay particular attention to:

vendor ownership
vendor staff
staff permissions
customer-owned resources
rider-specific resources
admin/platform scope

Do not simply check:

user has permission

when the actual requirement is:

user has permission
AND
user can access THIS resource

Separate:

Permission check
Resource scope check

This will be important for future Order, Restaurant, Catalog and Delivery modules.

# STEP 11 — DENIAL BEHAVIOR

Use the existing error contract.

Authorization failures should return the correct HTTP semantics according to the existing backend contract.

Do not leak:

role configuration
internal permission resolution
database details
hidden resource existence where that would create an information leak

Distinguish authentication failure from authorization failure.

Conceptually:

Unauthenticated
→ 401

Authenticated but forbidden
→ 403

Follow the existing project's established contract if it differs.

# STEP 12 — PERMISSION CACHE

Do NOT introduce Redis.

For this prototype, use an appropriate database-backed resolution strategy.

Avoid unnecessary per-request database explosions.

If caching is useful, use a simple in-process approach only where safe and documented.

Do not sacrifice authorization correctness for caching.

Authorization changes must eventually become effective according to the product's consistency requirements.

# STEP 13 — TOKEN CLAIMS

Module 2 intentionally did not put permissions into the access JWT.

Do not casually change that design.

Prefer database-backed/effective authorization resolution unless the existing requirements explicitly justify changing the token contract.

If you believe permission claims are necessary, STOP and document the tradeoff instead of silently changing the security model.

# STEP 14 — AUTHORIZATION TEST ROUTES

Because no business module should be implemented yet, create minimal internal/test-only authorization verification routes or test fixtures where necessary.

Do NOT create fake production business endpoints.

The purpose is to verify:

authenticated user
→ role resolution
→ permission resolution
→ authorization
→ denial

Remove or disable test-only routes from production behavior if appropriate.

# STEP 15 — TESTING

Create comprehensive Module 3 tests.

At minimum verify:

Role resolution
user with one role
user with multiple roles
inactive role assignment
revoked role assignment
invalid role assignment
Permission resolution
role grants permission
role does not grant permission
multiple roles combine permissions
duplicate permissions normalize correctly
Authorization
permitted action succeeds
missing permission returns 403
unauthenticated request returns 401
blocked/inactive account cannot authorize
deleted account cannot authorize
Resource scope

Where supported by the current product:

owner can access own resource
owner cannot access another owner's resource
staff can access assigned vendor/resource
staff cannot access unrelated vendor/resource
admin/platform role behavior
Security

Verify that the client cannot elevate privileges by changing:

JWT claims
request body
headers
role identifiers
permission identifiers

Never trust client-supplied authorization information.

# STEP 16 — REAL DATABASE VERIFICATION

Use the real PostgreSQL test strategy already established by F1/M2.

Verify authorization against actual seeded:

roles
permissions
role_permissions
user_role_assignments

Do not rely solely on mocked authorization data.

Tests must prove that the actual database configuration produces the expected effective permissions.

# STEP 17 — FRONTEND COMPATIBILITY

Do not implement unrelated frontend changes.

However, inspect the frontend's current role/permission expectations.

If a minimal compatibility adjustment is required for future API integration, document it.

Do not connect the entire frontend to the new backend yet.

Do not modify GraphQL authentication behavior in this module unless absolutely required for authorization verification.

The REST migration remains a separate frontend concern.

# STEP 18 — DOCUMENTATION

Create:

docs/backend/M3-rbac-pbac.md

Document:

RBAC model
PBAC/resource-scope model
Role resolution
Permission resolution
Authorization flow
Fastify authorization API
401 vs 403 behavior
Scope enforcement
Caching strategy
Security decisions
Testing strategy

Update:

docs/FOODORA-MODULE-CHECKLIST.md

Only mark Module 3 items complete after verification.

# STEP 19 — DO NOT IMPLEMENT OTHER MODULES

Absolutely do NOT implement:

Users
Restaurants
Vendors
Catalog
Cart
Orders
Payments
Delivery
Riders
Reviews
Coupons
POS
Reservations
Catering
Meal Plans
CMS
AI
Support
Admin business operations

RBAC infrastructure may support these future modules, but their actual business functionality must remain unimplemented.

# STEP 20 — REGRESSION VERIFICATION

Run the complete existing verification suite.

The following must remain green:

Prisma validation
Migration status
Foundation tests
Auth tests
Auth flow
Forbidden technology check

Then run the new RBAC/PBAC test suite.

No existing functionality may regress.

FINAL REPORT

Report:

Roles discovered
Permissions discovered
Role-permission mappings used
Authorization architecture
Resource-scoping rules implemented
Fastify authorization API
Database queries/resolution strategy
401/403 behavior
Security considerations
Tests executed
Total assertions
Regression test results
Documentation updated
Checklist status
Remaining RBAC/PBAC gaps
Recommended next module

Then STOP.
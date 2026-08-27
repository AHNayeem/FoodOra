# FoodOra — Module 4 Implementation

Modules 0–3 are complete and verified:

- Module 0 — Foundation: COMPLETE
- Module 1 — Database: COMPLETE
- Module 2 — Auth & Sessions: COMPLETE
- Module 3 — RBAC / PBAC: COMPLETE

Now implement ONLY:

# MODULE 4

Do NOT implement Module 5 or any unrelated business module.

---

## CRITICAL RULE

Before writing any code, determine the exact definition and scope of Module 4 from the current project documentation.

Do NOT assume what Module 4 is based on generic Foodora architecture.

Read:

1. docs/FOODORA-MODULE-CHECKLIST.md
2. docs/FOODORA-BACKEND-REQUIREMENTS.md
3. docs/FOODORA-DATABASE-DESIGN.md
4. docs/backend/F1-fastify-foundation.md
5. docs/backend/M2-auth-sessions.md
6. docs/backend/M3-rbac-pbac.md
7. Current frontend implementation relevant to Module 4
8. Relevant frontend/types/*
9. Current Prisma schema under database/

Then determine:

- Exact Module 4 name
- Module 4 objectives
- Required frontend behavior
- Required database models
- Required API endpoints
- Required authentication
- Required authorization
- Required workflows
- Module dependencies
- Acceptance criteria
- Explicitly deferred functionality

Report this understanding briefly before implementation.

If the documentation contains ambiguity, resolve it from the current frontend/database instead of inventing functionality.

---

# STACK — DO NOT CHANGE

Backend:

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

Do not introduce any forbidden technology.

Do NOT read, restore, copy, or depend on the deleted NestJS backend.

---

# DATABASE RULE

The database is finalized and verified.

DO NOT redesign the database.

DO NOT create duplicate models.

DO NOT create unnecessary migrations.

First determine whether Module 4 can be implemented entirely against the existing schema.

If a genuine database gap is discovered:

1. Document the exact gap.
2. Explain why the existing schema cannot support the requirement.
3. Make the minimum required schema change only if clearly justified.
4. Create a proper migration.
5. Verify migration against real PostgreSQL.
6. Update database documentation.

Do not modify the schema merely for convenience.

---

# AUTHENTICATION RULE

Reuse Module 2.

Use:

- `requireUser`
- `request.account`
- existing session/token lifecycle
- existing account-state checks

Do NOT create another authentication mechanism.

Do NOT duplicate JWT/session logic.

---

# AUTHORIZATION RULE

Reuse Module 3.

Use the existing:

- authorization service
- `request.auth`
- permission resolution
- role resolution
- resource-scope checks
- vendor access checks
- authorization hooks

Do NOT implement ad-hoc role checks inside business services.

Do NOT trust:

- client-supplied roles
- client-supplied permissions
- JWT permission arrays
- request-body authorization fields

The backend remains authoritative.

---

# IMPLEMENTATION RULE

Implement the complete Module 4 workflow, not just CRUD endpoints.

Trace the real lifecycle:

```text
Request
→ Authentication
→ Authorization
→ Validation
→ Business rules
→ Database transaction
→ Domain state change
→ Response

Follow the exact workflow defined by the current product documentation.

Use transactions wherever multiple related records must change atomically.

Do not leave partially completed state.

API DESIGN

Use:

/api/v1

Follow the existing Fastify route conventions.

For every endpoint define:

HTTP method
route
authentication requirement
authorization requirement
params
query
body
response
error behavior

Use Fastify validation/schema conventions established in F1.

Do not create endpoints that are not required by Module 4.

BUSINESS LOGIC

Keep responsibilities separated:

Route
 ↓
Validation
 ↓
Authorization
 ↓
Controller/handler
 ↓
Service
 ↓
Repository / Prisma
 ↓
PostgreSQL

Do not put large business workflows directly inside route handlers.

Keep database access centralized and understandable.

Follow existing backend conventions rather than creating a completely different architecture.

DATA INTEGRITY

Respect:

existing foreign keys
unique constraints
CHECK constraints
enums
soft deletion
timestamps
ownership rules
scope rules
historical/immutable records
transaction boundaries

Do not bypass database constraints.

Do not use unsafe raw SQL unless Prisma cannot correctly express the required operation and the reason is documented.

ERROR HANDLING

Use the existing global error contract.

Correctly distinguish:

400 validation errors
401 authentication failures
403 authorization failures
404 resource-not-found
409 conflicts
appropriate business-rule failures
500 unexpected failures

Do not leak:

SQL errors
Prisma internals
stack traces
secrets
sensitive user information

Where resource existence should be hidden, follow the existing PBAC hide behavior.

AUTHORIZATION TESTING

For every protected operation verify:

Unauthenticated request
Authenticated but unauthorized request
Authorized request
Correct resource owner
Incorrect resource owner
Correct vendor scope
Incorrect vendor scope
Relevant staff scope if applicable
Blocked/inactive/deleted account
Privilege escalation attempt

Use the actual Module 3 authorization infrastructure.

FRONTEND CONTRACT

Inspect the current frontend before finalizing API contracts.

Determine:

expected request format
expected response format
expected field names
expected status behavior
pagination/filtering requirements
error expectations
current types
current mock/service behavior

Where the frontend currently uses mocks, preserve the same conceptual contract where possible.

Do not perform a broad frontend rewrite.

If a minimal frontend adjustment is required for Module 4 API integration, document it explicitly.

Do not modify unrelated frontend modules.

TESTING

Create a complete Module 4 test suite.

Test:

Validation
valid request
missing required fields
malformed fields
invalid identifiers
invalid enum values
invalid relationships
Authentication
unauthenticated
expired session
revoked session
blocked account
deleted account
Authorization
allowed role
denied role
allowed permission
denied permission
resource ownership
vendor scope
staff scope where applicable
privilege escalation
Business logic

Test every important state transition defined by Module 4.

Test:

happy path
invalid state transition
duplicate operation
repeated request
conflict
missing resource
invalid relationship
transactional failure
Database

Verify:

created records
updated records
deleted/soft-deleted records
relationships
constraints
transaction behavior

Use real PostgreSQL according to the existing project test strategy.

Do not rely exclusively on mocks.

REGRESSION TESTING

Before declaring Module 4 complete, run:

Prisma validation
migration status
foundation tests
Module 2 tests
Module 2 auth-flow
Module 3 tests
Module 4 tests
forbidden technology check
backend startup
health/readiness checks

Nothing from F1, M2 or M3 may regress.

IDEMPOTENCY / RETRY

Where Module 4 contains operations that may be retried:

determine whether idempotency is required
prevent duplicate state changes
use database constraints/transactions where appropriate
ensure repeated requests behave correctly

Do not add generic idempotency infrastructure unless Module 4 actually needs it.

OBSERVABILITY

Use the existing logging/request-context infrastructure.

Important business events should be observable without logging sensitive data.

Do not log:

passwords
refresh tokens
access tokens
OTP secrets
sensitive personal information

Follow the existing backend logging conventions.

DOCUMENTATION

Create:

docs/backend/M4-<module-name>.md

Use the actual Module 4 name.

Document:

Module purpose
Architecture
Entities used
API endpoints
Authentication
Authorization
Resource scope
Business rules
State transitions
Transactions
Error behavior
Frontend contract
Tests
Known limitations
Deferred functionality

Update:

docs/FOODORA-MODULE-CHECKLIST.md

Do not mark Module 4 complete until implementation and verification are genuinely complete.

Keep any partial/deferred items explicitly marked.

SCOPE CONTROL

Implement ONLY Module 4.

Do NOT implement:

Module 5
future business modules
unrelated frontend features
unrelated database changes
speculative APIs
speculative permissions
speculative roles

If Module 4 has a dependency that belongs to a future module, create only the minimal seam/interface needed.

Do not implement the future module itself.

FINAL VERIFICATION

Run the complete verification suite.

Confirm:

Module 4 works against real PostgreSQL
All required API endpoints work
Authentication works
Authorization works
Resource scoping works where required
Database constraints hold
Transactions behave correctly
Invalid operations are rejected
Existing modules still pass
No TypeScript
No NestJS
No Redis
No Docker
No GraphQL
No legacy backend dependency
FINAL REPORT

Provide:

Exact Module 4 name
Requirements implemented
Files/modules created
API endpoints
Database models used
Database changes, if any
Authentication integration
Authorization integration
Resource-scoping behavior
Business workflows implemented
State transitions implemented
Validation/error behavior
Frontend compatibility
Tests written
Total assertions/tests
Regression test results
PostgreSQL verification
Documentation updated
Checklist status
Remaining gaps/deferred items
Recommended Module 5

Then STOP.
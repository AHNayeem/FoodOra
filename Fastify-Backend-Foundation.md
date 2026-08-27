# FoodOra — Phase 3: Fresh Fastify Backend Foundation

The frontend/product analysis and database phase are complete.

The next task is to create a completely fresh backend foundation.

IMPORTANT:
Do NOT implement business modules yet.

The backend must be ready so that modules can be implemented one-by-one afterward.

---

## CURRENT PROJECT

FoodOra/

├── frontend/
├── database/
├── docs/
└── backend/

The legacy NestJS backend has already been removed.

DO NOT recreate or reference the old NestJS backend.

The current source of truth is:

- Current frontend
- docs/
- database/
- FOODORA-MODULE-CHECKLIST.md
- FOODORA-DATABASE-DESIGN.md
- FOODORA-BACKEND-REQUIREMENTS.md

---

# TARGET STACK

Use ONLY:

- Node.js
- Fastify
- JavaScript
- Prisma
- PostgreSQL

Explicitly DO NOT use:

- TypeScript
- NestJS
- Redis
- Docker
- GraphQL unless the existing frontend absolutely requires it
- NestJS adapters
- NestJS compatibility layers

Keep the backend intentionally simple and production-oriented.

---

# PHASE 1 — VERIFY CURRENT STATE

Before creating anything, inspect:

docs/
database/
frontend/

Read:

- FOODORA-MODULE-CHECKLIST.md
- FOODORA-DATABASE-DESIGN.md
- FOODORA-BACKEND-REQUIREMENTS.md
- database/README.md

Confirm:

1. Database schema is current.
2. Prisma schema is available.
3. Prisma migrations are intact.
4. Migration state is clean.
5. Current database design is compatible with the backend requirements.
6. The module checklist is available.

Do NOT inspect the old backend.

---

# PHASE 2 — CREATE FRESH BACKEND

Create a new backend inside:

backend/

Start from a clean Fastify application.

Use JavaScript only.

Recommended structure:

backend/

├── src/
│   ├── app.js
│   ├── server.js
│   │
│   ├── config/
│   │
│   ├── plugins/
│   │   ├── prisma.js
│   │   ├── auth.js
│   │   ├── cors.js
│   │   └── sensible.js
│   │
│   ├── middleware/
│   │
│   ├── shared/
│   │   ├── errors/
│   │   ├── constants/
│   │   ├── utils/
│   │   └── validators/
│   │
│   ├── routes/
│   │
│   └── health/
│
├── prisma/
│   └── schema.prisma
│
├── tests/
│
├── scripts/
│
├── package.json
├── .env.example
└── README.md

Adapt this structure if the documentation indicates a better structure.

Do not create empty business modules yet.

---

# PHASE 3 — FASTIFY APPLICATION FOUNDATION

Implement:

## Application

- Fastify bootstrap
- Environment configuration
- Graceful startup
- Graceful shutdown
- Central error handling
- Request logging
- CORS
- Security-conscious defaults
- JSON handling
- Request IDs if appropriate

## Health

Implement:

GET /health

It should verify that the application is alive.

Also provide a database health/readiness check if appropriate, for example:

GET /health/ready

The readiness endpoint should verify PostgreSQL/Prisma connectivity.

Do not pretend the service is ready if the database is unavailable.

---

# PHASE 4 — PRISMA INTEGRATION

Connect Prisma to the existing PostgreSQL database.

IMPORTANT:

Do NOT redesign the database.

Do NOT create a second schema.

Do NOT generate unnecessary migrations.

Use the already finalized database design.

Ensure:

- Prisma Client generation works
- Prisma connects correctly
- Prisma disconnects gracefully
- Database errors are handled cleanly

Respect the existing Prisma enum naming convention documented in the database phase.

Remember:

Prisma client queries use enum IDENTIFIERS, not the mapped PostgreSQL values.

For example, do not incorrectly assume:

status: "completed"

if the Prisma enum identifier is:

COMPLETED

Follow the finalized Prisma schema.

---

# PHASE 5 — DATABASE SEEDER

The database phase identified one remaining blocking item:

The existing prisma.seed configuration points to the removed legacy backend.

Fix this.

Create a new backend-owned seed/reference-data mechanism.

The seed must NOT depend on the old backend.

Only seed genuine reference/bootstrap data required by the current database design.

Do not create fake business/test accounts unless explicitly required.

At minimum investigate the country/reference-data dependency identified in the database report.

Make the seed:

- deterministic
- idempotent
- safe to run repeatedly
- compatible with the current Prisma schema

Document how to run it.

Do not turn this into implementation of any business module.

---

# PHASE 6 — API FOUNDATION

Create a clean API versioning strategy.

Use:

/api/v1

as the base path unless the existing frontend/backend requirements specify otherwise.

Do not implement domain endpoints yet.

Only establish the routing foundation.

Example:

GET /api/v1/health

or equivalent depending on the chosen architecture.

---

# PHASE 7 — AUTH FOUNDATION ONLY

Do NOT implement the full Authentication module yet.

However, establish the infrastructure needed for future authentication:

- JWT plugin/configuration
- authentication hook/decorator structure
- request.user convention
- authorization hook structure
- secure configuration through environment variables

Do not implement:

- registration
- login
- password reset
- OTP
- role management
- account workflows

Those belong to the Authentication module and will be implemented later from the checklist.

---

# PHASE 8 — ERROR CONTRACT

Create a consistent API error format.

For example:

{
  "success": false,
  "error": {
    "code": "SOME_ERROR_CODE",
    "message": "Human-readable message"
  }
}

Do not blindly copy this exact structure if the existing frontend/backend requirements define another contract.

Inspect the current frontend API expectations first.

The important requirement is consistency.

---

# PHASE 9 — RESPONSE CONTRACT

Establish a consistent response strategy for:

- success
- validation failure
- authentication failure
- authorization failure
- not found
- conflict
- database failure
- unexpected server error

Do not implement domain-specific responses yet.

---

# PHASE 10 — VALIDATION

Choose a Fastify-compatible validation approach.

Prefer Fastify's native JSON Schema capabilities where practical.

The architecture should allow each future route/module to define:

- params
- query
- headers
- body
- response schema

Do not implement module-specific schemas yet.

---

# PHASE 11 — TESTING FOUNDATION

Set up backend testing.

At minimum establish the ability to test:

- Application startup
- Health endpoint
- Readiness endpoint
- Database connectivity
- Error handling
- Validation
- Graceful shutdown

Do not write large domain test suites yet.

Those will be added with each module.

---

# PHASE 12 — ENVIRONMENT

Create:

.env.example

Include only necessary variables.

Likely categories:

- NODE_ENV
- PORT
- DATABASE_URL
- JWT configuration
- CORS configuration

Do not add:

- REDIS_URL
- Redis configuration
- Docker configuration
- NestJS variables

unless an actual documented requirement exists.

Never commit secrets.

---

# PHASE 13 — DOCUMENTATION

Create/update:

docs/backend/

with a concise backend architecture document.

Document:

- Stack
- Folder structure
- Application lifecycle
- Prisma integration
- Authentication foundation
- Error contract
- API versioning
- Environment variables
- Seed process
- Testing
- Development commands

Also update:

docs/FOODORA-BACKEND-REQUIREMENTS.md

only where necessary to reflect the actual foundation.

Do not rewrite unrelated product requirements.

---

# PHASE 14 — VERIFICATION

Before declaring this phase complete, run actual verification.

At minimum:

1. npm install
2. Prisma generate
3. Prisma validation
4. Application startup
5. GET /health
6. GET readiness endpoint
7. PostgreSQL connectivity
8. Seed execution
9. Seed repeated execution
10. Test suite
11. Production build/start equivalent if applicable
12. Confirm no TypeScript files
13. Confirm no NestJS dependencies
14. Confirm no Redis dependencies
15. Confirm no Docker configuration

Search the backend to verify that forbidden technologies have not accidentally been introduced.

---

# VERY IMPORTANT — DO NOT IMPLEMENT MODULES

After the foundation is complete:

DO NOT implement:

- Auth module
- User module
- Restaurant module
- Cart
- Orders
- Payments
- Delivery
- Rider
- Admin
- POS
- Reservations
- Catering
- Meal Plans
- CMS
- AI
- Support
- etc.

Even if the structure suggests them.

Only create the infrastructure required to support those future modules.

---

# FINAL REPORT

At the end provide:

1. Final backend folder structure
2. Installed dependencies
3. Fastify version
4. Prisma version
5. PostgreSQL connection status
6. Seed status
7. Health endpoint status
8. Readiness endpoint status
9. Test results
10. Confirmation of:
   - No TypeScript
   - No NestJS
   - No Redis
   - No Docker
11. Any remaining foundation issues
12. Recommended first module according to FOODORA-MODULE-CHECKLIST.md

Then STOP.

Do not implement the first business module yet.
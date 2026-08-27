# FoodOra — Module 2: Authentication & Sessions

The Fastify backend foundation is complete and verified.

Now implement ONLY:

# Module 2 — Auth & Sessions

Do NOT implement Module 3 or any other business module yet.

---

## SOURCE OF TRUTH

Before coding, read:

1. docs/FOODORA-MODULE-CHECKLIST.md
2. docs/FOODORA-BACKEND-REQUIREMENTS.md
3. docs/FOODORA-DATABASE-DESIGN.md
4. docs/backend/F1-fastify-foundation.md
5. Current frontend authentication implementation
6. Relevant files under frontend/types/
7. Current Prisma schema under database/

Do NOT read or use the deleted legacy NestJS backend.

The current frontend and documentation define the required authentication behavior.

---

# CURRENT BACKEND

The backend is:

Node.js
Fastify
JavaScript
Prisma
PostgreSQL

Forbidden:

- TypeScript
- NestJS
- Redis
- Docker
- GraphQL

Do not introduce any of them.

---

# OBJECTIVE

Implement the complete authentication/session foundation required by the current FoodOra frontend and module checklist.

This is NOT just a login endpoint.

Implement the actual authentication lifecycle required by the product.

---

# STEP 1 — AUDIT FRONTEND AUTH

Before implementation, trace the current frontend authentication flow.

Identify:

- Login
- Registration
- Logout
- Session restoration
- Token handling
- Refresh token behavior
- Password handling
- Password reset
- OTP/email/phone verification if actually present
- Account activation/deactivation
- Authenticated API requests
- Auth failure behavior
- Expired session behavior
- Role information expected by frontend
- Current auth-related environment flags
- Existing API contract expectations

Do not invent authentication features that the frontend/docs do not require.

Document the findings briefly before coding.

---

# STEP 2 — DATABASE AUTH MODEL

Inspect the finalized Prisma schema.

Identify existing models/fields related to:

- User
- Account
- Credentials
- Sessions
- Refresh tokens
- Verification
- Password reset
- OTP
- User status
- Account status
- Security/audit information

Reuse the finalized database model.

DO NOT modify the database schema unless a genuine authentication requirement is missing.

If a schema gap is discovered:

STOP and report it before making unnecessary database changes.

---

# STEP 3 — AUTH ARCHITECTURE

Implement a clean Fastify-native authentication architecture.

Suggested structure:

backend/src/modules/auth/

├── routes.js
├── controller.js
├── service.js
├── repository.js
├── schemas.js
├── errors.js
└── utils/

Adapt this to the existing backend architecture where appropriate.

Do not create NestJS-like modules/decorators.

---

# STEP 4 — PASSWORD SECURITY

If password authentication is part of the current product:

Implement secure password hashing.

Requirements:

- Never store plaintext passwords.
- Use an established password hashing algorithm/library.
- Never return password hashes through APIs.
- Verify passwords securely.
- Handle invalid credentials consistently.
- Avoid account enumeration through unnecessarily different responses.

Use configuration appropriate for production-ready prototype behavior.

---

# STEP 5 — JWT ACCESS TOKENS

Use the existing Fastify JWT foundation.

Implement:

- Access token generation
- Access token verification
- Token claims
- Expiration
- Authentication hook/decorator
- `request.user`

Do not place sensitive information inside JWT claims.

Only include information actually required by the application.

---

# STEP 6 — REFRESH TOKEN / SESSION LIFECYCLE

Implement refresh-token/session behavior according to the database design and frontend requirements.

Requirements:

- Secure refresh token handling
- Expiration
- Rotation/revocation if required by the design
- Logout invalidation
- Expired refresh token rejection
- Refresh token must NOT be accepted as a bearer access token
- Session lifecycle must be persisted where the database model requires persistence

Do not keep security-critical sessions only in memory.

---

# STEP 7 — AUTH ENDPOINTS

Implement only endpoints required by the current frontend and documentation.

Likely examples include:

POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me

Additional endpoints such as:

- forgot password
- reset password
- verify email
- verify phone
- OTP

should only be implemented if they are actually required by the current frontend/module checklist.

Do not blindly implement the example list.

---

# STEP 8 — AUTHENTICATION HOOK

Provide a reusable authentication mechanism for future modules.

Example conceptual usage:

request.user

The hook should:

1. Extract access token
2. Verify token
3. Validate claims
4. Load/validate user state when required
5. Reject inactive/blocked/deleted accounts
6. Attach authenticated user context

Keep authorization separate.

Do NOT implement RBAC/PBAC yet.

Authentication answers:

"Who is this user?"

Authorization will be Module 3.

---

# STEP 9 — ACCOUNT STATE

Respect the finalized user/account status model.

Authentication must correctly handle states such as:

- Active
- Inactive
- Suspended
- Blocked
- Deleted
- Pending verification

Only implement states actually present in the current schema/product.

Do not invent new statuses.

---

# STEP 10 — VALIDATION

Every auth endpoint must have proper request validation.

Validate:

- email/phone
- password
- identifiers
- tokens
- required fields
- malformed requests

Use the Fastify-native validation architecture established during F1.

---

# STEP 11 — ERROR CONTRACT

Use the existing global error contract.

Authentication failures must not leak:

- password hashes
- database errors
- stack traces
- JWT internals
- sensitive user information

Use stable error codes where appropriate.

---

# STEP 12 — SECURITY

Review the implementation for:

- Password hashing
- Token expiration
- Refresh token security
- Credential leakage
- User enumeration
- Brute-force protection through the existing rate limiter
- Authentication bypass
- Deleted/blocked account access
- Token replay
- Incorrect token type acceptance

Do not add Redis.

The current in-process rate limiter is acceptable for this prototype.

---

# STEP 13 — FRONTEND COMPATIBILITY

The frontend currently has an authentication surface behind:

NEXT_PUBLIC_BACKEND_AUTH=1

Inspect how the frontend expects authentication to work.

Make the backend API compatible with the actual frontend expectations where reasonable.

Do not modify unrelated frontend functionality.

If the frontend must be changed to connect to the new API, make only the minimal necessary changes and document them.

---

# STEP 14 — TESTS

Create comprehensive tests for Module 2.

At minimum test:

### Registration

- valid registration
- duplicate account
- invalid input
- weak/invalid password if validation requires it

### Login

- valid credentials
- invalid password
- unknown account
- inactive/blocked account
- deleted account

### Access token

- valid token
- expired token
- malformed token
- missing token
- refresh token used as access token

### Refresh

- valid refresh
- expired refresh
- revoked refresh
- invalid refresh

### Logout

- valid logout
- refresh/session invalidation
- post-logout refresh rejection

### Me

- authenticated user
- unauthenticated request

Also verify that no sensitive data appears in responses/errors.

Use real PostgreSQL where the project testing strategy requires it.

---

# STEP 15 — END-TO-END VERIFICATION

Verify the complete lifecycle:

Register
→ Login
→ Receive access/refresh credentials
→ Access protected endpoint
→ Refresh
→ Logout
→ Attempt refresh again
→ Verify rejection

Also test blocked/inactive account behavior where supported.

Do not mark the module complete based only on unit tests.

---

# STEP 16 — DOCUMENTATION

Update:

docs/FOODORA-MODULE-CHECKLIST.md

Only mark the authentication items complete after actual verification.

Also update/create:

docs/backend/M2-auth-sessions.md

Document:

- Authentication architecture
- Token lifecycle
- Session lifecycle
- Endpoints
- Request/response contracts
- Security decisions
- Environment configuration
- Testing

---

# STEP 17 — DO NOT IMPLEMENT RBAC

This is critical.

DO NOT implement:

- Role authorization
- Permission checks
- PBAC
- Admin authorization
- Restaurant authorization
- Rider authorization
- Permission middleware

Those belong to:

# Module 3 — RBAC/PBAC

You may expose the authenticated user's identity through `request.user`, because future authorization depends on it.

But STOP authorization implementation here.

---

# FINAL VERIFICATION

Before finishing, run:

- Prisma validation
- Backend tests
- Auth tests
- Full auth lifecycle
- Forbidden technology check
- Existing foundation tests
- Build/start verification

Confirm:

- No TypeScript
- No NestJS
- No Redis
- No Docker
- No GraphQL
- No legacy backend dependency

---

# FINAL REPORT

Report:

1. Auth features implemented
2. Endpoints created
3. Database models used
4. Token/session strategy
5. Security measures
6. Frontend compatibility status
7. Tests executed
8. Test results
9. Checklist updates
10. Documentation created/updated
11. Any remaining auth gaps
12. Recommended next module

Then STOP.

Do not implement Module 3 or any other module.
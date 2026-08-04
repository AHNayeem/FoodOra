-- =============================================================================
-- Partial unique indexes — the constraints the Prisma schema asks for in prose
-- because its DSL cannot express them.
--
-- Postgres treats NULLs as distinct, so `UNIQUE (a, b)` does not constrain rows
-- where `b IS NULL` at all. Five of this schema's composite unique keys include a
-- nullable column *whose null carries meaning* ("platform-wide", "guest",
-- "the platform's own account"), and for those the null case is exactly the one
-- that must be unique. Each index below closes one of them.
--
-- ## Drift warning — read before running `prisma migrate dev`
--
-- Prisma cannot see partial indexes, so it reports them as drift and offers to
-- reset the database. Generate subsequent migrations with `migrate diff` and
-- apply them with `migrate deploy` (see database/README.md); `migrate dev` is not
-- the workflow for this repository.
-- =============================================================================

-- `UserRoleAssignment.@@unique([userId, roleId, vendorId])` covers the
-- vendor-scoped grant only. Without this, one account can hold the same
-- platform-wide role twice — and `RolePermission` cascades, so revoking it once
-- leaves the duplicate behind still granting every permission it carries.
-- Requested by identity.prisma (whose prose spells the columns in snake_case;
-- this schema does not `@map` field names, so the real columns are camelCase).
CREATE UNIQUE INDEX "user_role_assignments_platform_uq"
  ON "user_role_assignments" ("userId", "roleId")
  WHERE "vendorId" IS NULL;

-- Same shape, and worse consequences: a duplicated denial row and a duplicated
-- grant row for one permission make "does this account have it" depend on which
-- row the resolver reads first. Requested verbatim by identity.prisma.
CREATE UNIQUE INDEX "user_permissions_platform_uq"
  ON "user_permissions" ("userId", "permissionId")
  WHERE "vendorId" IS NULL;

-- `Setting.@@unique([scope, scopeId, key])` with `scopeId IS NULL` for PLATFORM.
-- Settings resolve vendor -> country -> platform, first hit wins, so two platform
-- rows for one key make the resolved value nondeterministic — and the platform
-- layer is the one every other layer falls back to.
CREATE UNIQUE INDEX "settings_platform_uq"
  ON "settings" ("key")
  WHERE "scopeId" IS NULL;

-- `Cart.@@unique([userId, vendorId])` with `userId IS NULL` for a guest basket.
-- "A cart is single-vendor by construction" only holds if one identity has one
-- cart per vendor, and a guest's identity is `guestKey`. Carts with neither a
-- user nor a guest key are unreachable by any client and are left unconstrained
-- rather than made impossible, so a repair script can still write one.
CREATE UNIQUE INDEX "carts_guest_vendor_uq"
  ON "carts" ("guestKey", "vendorId")
  WHERE "userId" IS NULL AND "guestKey" IS NOT NULL;

-- `LedgerAccount.@@unique([kind, ownerId, currency])` with `ownerId IS NULL` for
-- the platform's own accounts. Two platform cash accounts in one currency split
-- the balance in half and neither half is wrong, which is the hardest class of
-- accounting bug to find after the fact.
CREATE UNIQUE INDEX "ledger_accounts_platform_uq"
  ON "ledger_accounts" ("kind", "currency")
  WHERE "ownerId" IS NULL;

-- Deliberately NOT constrained, because the null is not an identity there:
--
--   InventoryItem (vendorId, sku)          — SKU is optional; many items lack one.
--   Review        (orderId, subject)       — unverified reviews have no order.
--   PaymentIntent (providerId, providerRef) — null until the provider is called.
--   PaymentWebhookEvent (providerId, eventId) — a webhook with no event id cannot
--                                            be deduplicated by any means.
--   RatingAggregate (subject, subjectId, month) — null month = the all-time row,
--                                            which *should* be unique, but reviews
--                                            are outside V1 and the aggregate is
--                                            written transactionally. Revisit with
--                                            the reviews module.

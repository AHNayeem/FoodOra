-- =============================================================================
-- v2 — the constraints the schema asks for in prose because the DSL cannot
-- express them.
--
-- Two kinds, and the reason each is here rather than in the schema file:
--
--  * CHECK (a IS NULL) <> (b IS NULL) — "exactly one of these is set". Prisma
--    has no CHECK. Without it, a row belonging to both a vendor and a rider, or
--    to neither, is permitted, and every reader has to guess which half to
--    believe.
--  * Partial UNIQUE. Postgres treats NULLs as distinct, so `UNIQUE (a, b)` does
--    not constrain rows where `b IS NULL` at all — and for these keys the null
--    case is exactly the one that must be unique.
--
-- Follows `20260803120100_v1_partial_unique_indexes`, which closed the same
-- class of hole for V1's five composite keys. Read that file's drift warning:
-- Prisma cannot see partial indexes or CHECKs, so `migrate dev` reports them as
-- drift and offers to reset. Apply with `migrate:deploy`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- "Exactly one parent" — the shared-paperwork tables
-- ---------------------------------------------------------------------------

-- `OnboardingDocument` and `OnboardingEvent` each carry a real foreign key to
-- BOTH application kinds, which is what lets the database enforce that the
-- parent exists (an `entityType`/`entityId` pair could not). The half it cannot
-- enforce is that only one of them is set, and a reviewer's log that belonged to
-- two applications at once would appear on both queues saying different things.
ALTER TABLE "onboarding_documents"
  ADD CONSTRAINT "onboarding_documents_one_parent"
  CHECK (("vendorApplicationId" IS NULL) <> ("riderApplicationId" IS NULL));

ALTER TABLE "onboarding_events"
  ADD CONSTRAINT "onboarding_events_one_parent"
  CHECK (("vendorApplicationId" IS NULL) <> ("riderApplicationId" IS NULL));

-- A document kind is asked for once per application, so a re-upload replaces the
-- row rather than adding a second answer to "is the trade licence verified".
CREATE UNIQUE INDEX "onboarding_documents_vendor_kind_uq"
  ON "onboarding_documents" ("vendorApplicationId", "kind")
  WHERE "vendorApplicationId" IS NOT NULL;

CREATE UNIQUE INDEX "onboarding_documents_rider_kind_uq"
  ON "onboarding_documents" ("riderApplicationId", "kind")
  WHERE "riderApplicationId" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- "Exactly one payee" — the money tables
-- ---------------------------------------------------------------------------

-- All three have said "exactly one of these is set" in prose since V1. A
-- settlement row belonging to both a vendor and a rider would be counted twice
-- by two different statements, and neither total would be wrong on its own
-- terms — the hardest class of accounting bug to find after the fact.
ALTER TABLE "settlement_adjustments"
  ADD CONSTRAINT "settlement_adjustments_one_payee"
  CHECK (("vendorId" IS NULL) <> ("riderId" IS NULL));

ALTER TABLE "payout_accounts"
  ADD CONSTRAINT "payout_accounts_one_owner"
  CHECK (("vendorId" IS NULL) <> ("riderId" IS NULL));

ALTER TABLE "payouts"
  ADD CONSTRAINT "payouts_one_payee"
  CHECK (("vendorId" IS NULL) <> ("riderId" IS NULL));

-- A period is PAID at most once per payee. Scoped to `status = 'paid'` rather
-- than applied to every row on purpose: a FAILED run must be retryable as a
-- second row, and a SCHEDULED one that was superseded should not block the
-- replacement. What must never happen twice is the money leaving.
CREATE UNIQUE INDEX "payouts_vendor_period_paid_uq"
  ON "payouts" ("vendorId", "periodRef")
  WHERE "vendorId" IS NOT NULL AND "status" = 'paid';

CREATE UNIQUE INDEX "payouts_rider_period_paid_uq"
  ON "payouts" ("riderId", "periodRef")
  WHERE "riderId" IS NOT NULL AND "status" = 'paid';

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

-- `VendorStaff.@@unique([vendorId, userId])` covers a member who has an account.
-- An outstanding invitation has `userId IS NULL` — the state the nullable column
-- exists for — so without this, inviting the same address twice creates two
-- pending rows, and accepting one leaves the other permanently unresolvable.
CREATE UNIQUE INDEX "vendor_staff_invite_uq"
  ON "vendor_staff" ("vendorId", "invitedEmail")
  WHERE "userId" IS NULL AND "deletedAt" IS NULL;

-- `StaffRoleKind.OWNER` is documented as "exactly one at all times". Two owners
-- means two accounts that can each remove the other.
CREATE UNIQUE INDEX "vendor_staff_owner_uq"
  ON "vendor_staff" ("vendorId")
  WHERE "role" = 'owner' AND "deletedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- Rating aggregates — a V1 deferral whose premise has expired
-- ---------------------------------------------------------------------------

-- `20260803120100` left `(subject, subjectId, month)` unconstrained for the
-- lifetime row (`month IS NULL`), reasoning that "reviews are outside V1". They
-- are not outside the current product: the frontend ships customer reviews,
-- merchant replies and an admin moderation queue.
--
-- The lifetime row is what backs `Vendor.rating` and `reviewCount`. Two of them
-- split the corpus in half and each half is internally consistent, so the vendor
-- card shows a plausible rating computed from some of the reviews.
CREATE UNIQUE INDEX "rating_aggregates_lifetime_uq"
  ON "rating_aggregates" ("subject", "subjectId")
  WHERE "month" IS NULL;

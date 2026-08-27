-- =============================================================================
-- v2 — gap closure against the current frontend
--
-- Generated with `prisma migrate diff` and then hand-corrected in four places
-- the generator cannot get right, each marked below:
--
--   * enum members positioned rather than appended (ordinal order is meaning);
--   * DSC-1, the cart-line re-key, with the backfill that makes it survive
--     existing rows;
--   * DSC-2 is a plain index and needed no correction;
--   * `payouts.periodRef` added nullable, backfilled, then constrained.
--
-- Applied with `migrate deploy`, never `migrate dev` — see database/README.md.
-- The CHECK constraints and partial unique indexes this schema's prose asks for
-- follow in the next migration, because Prisma's DSL cannot express them.
-- =============================================================================

-- CreateEnum
CREATE TYPE "staff_role_kind" AS ENUM ('owner', 'manager', 'kitchen', 'cashier', 'support');

-- CreateEnum
CREATE TYPE "staff_status_kind" AS ENUM ('invited', 'active', 'inactive');

-- CreateEnum
CREATE TYPE "account_block_reason" AS ENUM ('payment-fraud', 'refund-abuse', 'fake-orders', 'abusive-behaviour', 'chargeback', 'customer-request', 'other');

-- CreateEnum
CREATE TYPE "account_moderation_action" AS ENUM ('block', 'unblock', 'note');

-- CreateEnum
CREATE TYPE "onboarding_status" AS ENUM ('draft', 'pending', 'approved', 'rejected', 'suspended', 'inactive');

-- CreateEnum
CREATE TYPE "onboarding_doc_kind" AS ENUM ('trade-licence', 'tin-certificate', 'bank-statement', 'food-safety', 'premises-photo', 'driving-licence', 'vehicle-registration', 'insurance', 'profile-photo', 'national-id');

-- CreateEnum
CREATE TYPE "onboarding_doc_status" AS ENUM ('missing', 'pending', 'verified', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "onboarding_author_kind" AS ENUM ('applicant', 'reviewer', 'system');

-- CreateEnum
CREATE TYPE "onboarding_event_kind" AS ENUM ('edited', 'submitted', 'decision', 'document', 'note');

-- CreateEnum
CREATE TYPE "refund_method_kind" AS ENUM ('wallet', 'card', 'cash');

-- CreateEnum
CREATE TYPE "handover_check_kind" AS ENUM ('identity', 'orderNumber', 'items', 'sealed');

-- CreateEnum
CREATE TYPE "order_event_detail_kind" AS ENUM ('delay', 'otp-failed', 'handover-failed', 'refund-requested', 'refund-approved', 'refund-rejected', 'refund-settled', 'reassigned', 'scheduled-release', 'rating', 'note');

-- CreateEnum
CREATE TYPE "commission_status" AS ENUM ('charged', 'reversed');

-- CreateEnum
CREATE TYPE "support_category_kind" AS ENUM ('missing-item', 'wrong-item', 'damaged', 'late-delivery', 'payment-issue', 'restaurant-issue', 'rider-issue', 'other');

-- CreateEnum
CREATE TYPE "support_ticket_status_kind" AS ENUM ('open', 'in-review', 'awaiting-customer', 'resolved', 'rejected', 'closed');

-- CreateEnum
CREATE TYPE "support_author_kind" AS ENUM ('customer', 'agent', 'system');

-- CreateEnum
CREATE TYPE "support_event_kind" AS ENUM ('message', 'note', 'status', 'refund');

-- CreateEnum
CREATE TYPE "support_visibility" AS ENUM ('customer', 'internal');

-- CreateEnum
CREATE TYPE "support_outcome_kind" AS ENUM ('refunded', 'credited', 'replaced', 'explained', 'refused');

-- CreateEnum
CREATE TYPE "support_refund_decision" AS ENUM ('approved', 'rejected', 'settled');

-- CreateEnum
CREATE TYPE "contact_party_kind" AS ENUM ('rider', 'restaurant');

-- CreateEnum
CREATE TYPE "contact_author_kind" AS ENUM ('customer', 'rider', 'restaurant', 'system');

-- CreateEnum
CREATE TYPE "contact_entry_kind" AS ENUM ('message', 'call');

-- AlterEnum
-- `scheduled` is the state an order is BORN in, so it must sort before
-- `placed`. A bare ADD VALUE appends to the end of the enum, which would put
-- the wait before the journey after every terminal state and quietly break any
-- `ORDER BY status`.
ALTER TYPE "order_status_kind" ADD VALUE 'scheduled' BEFORE 'placed';

-- AlterEnum
-- Appended, which is already the right place: none < requested < approved <
-- rejected < refunded is the lifecycle order.
ALTER TYPE "refund_status_kind" ADD VALUE 'refunded';

-- AlterEnum
-- Two values on one type. Fine from PostgreSQL 12 on, which is the floor this
-- schema already assumes (it uses `citext`, partial indexes and generated
-- migrations throughout); the generator's 11-and-earlier warning does not apply.
-- Positioned to match the lifecycle: draft < pending < active < rejected <
-- suspended < inactive.
ALTER TYPE "rider_status" ADD VALUE 'draft' BEFORE 'pending';
ALTER TYPE "rider_status" ADD VALUE 'rejected' AFTER 'active';

-- AlterEnum
ALTER TYPE "vendor_status" ADD VALUE 'rejected' BEFORE 'suspended';

-- ===========================================================================
-- DSC-1 — cart lines keyed within their cart
--
-- `cart_items.id` held the composite cart-line id (`foodId|sortedOptionIds`),
-- which identifies a configuration within ONE basket, under a global primary
-- key. Two customers who both ordered a large Margherita computed the identical
-- id, so an upsert keyed on it found the other person's row — one customer's
-- food in another customer's basket. The application worked around it by storing
-- rows as `<cartId>#<lineId>`; this migration makes the database enforce what
-- the convention only asked for, and strips the prefix that made it necessary.
--
-- ORDER MATTERS, in two ways the generated diff gets wrong:
--
--  1. Both old primary keys are dropped BEFORE any row is rewritten. Stripping
--     the prefix makes `cartA#line1` and `cartB#line1` both become `line1`, so
--     the rewrite transiently violates the very keys being replaced.
--  2. The children learn their new parent key BEFORE the parents are rewritten,
--     or the join in the backfill has nothing to match on.
--
-- `position('#' IN id) > 0` is the guard, not a bare `substring`: a row already
-- without a prefix — written by an older build, or by a re-run of this
-- migration — must be left alone rather than beheaded.
-- ===========================================================================

-- DropForeignKey
ALTER TABLE "cart_item_options" DROP CONSTRAINT "cart_item_options_cartItemId_fkey";

-- Drop both old primary keys first — see note (1) above.
ALTER TABLE "cart_item_options" DROP CONSTRAINT "cart_item_options_pkey";
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_pkey";

-- Nullable for the backfill; made NOT NULL once every row has a value.
ALTER TABLE "cart_item_options" ADD COLUMN "cartId" VARCHAR(40);

-- Children first — see note (2) above.
UPDATE "cart_item_options" o
   SET "cartId"     = i."cartId",
       "cartItemId" = substring(i.id FROM position('#' IN i.id) + 1)
  FROM "cart_items" i
 WHERE o."cartItemId" = i.id
   AND position('#' IN i.id) > 0;

-- Any child whose parent was already un-prefixed still needs its cartId.
UPDATE "cart_item_options" o
   SET "cartId" = i."cartId"
  FROM "cart_items" i
 WHERE o."cartItemId" = i.id
   AND o."cartId" IS NULL;

-- Then the parents.
UPDATE "cart_items"
   SET id = substring(id FROM position('#' IN id) + 1)
 WHERE position('#' IN id) > 0;

-- Orphans cannot satisfy the new foreign key. A basket is disposable, so
-- deleting an option row whose cart line no longer exists costs nothing and is
-- the honest alternative to failing the deploy.
DELETE FROM "cart_item_options" WHERE "cartId" IS NULL;

ALTER TABLE "cart_item_options" ALTER COLUMN "cartId" SET NOT NULL;

-- New keys.
ALTER TABLE "cart_item_options" ADD CONSTRAINT "cart_item_options_pkey" PRIMARY KEY ("cartId", "cartItemId", "optionId");
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_pkey" PRIMARY KEY ("cartId", "id");

-- DropIndex — the composite key's leading column now serves every
-- `WHERE cartId = ...` the cart module makes.
DROP INDEX "cart_items_cartId_idx";

-- AlterTable
ALTER TABLE "delivery_zones" ADD COLUMN     "deliveryRadiusKm" DECIMAL(6,2) NOT NULL DEFAULT 8;

-- AlterTable
ALTER TABLE "order_events" ADD COLUMN     "detailKind" "order_event_detail_kind";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "commissionRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
ADD COLUMN     "handoverAttempts" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "handoverChecks" "handover_check_kind"[] DEFAULT ARRAY[]::"handover_check_kind"[],
ADD COLUMN     "handoverVerifiedAt" TIMESTAMPTZ(3),
ADD COLUMN     "refundDecidedAt" TIMESTAMPTZ(3),
ADD COLUMN     "refundMethod" "refund_method_kind",
ADD COLUMN     "refundSettledAt" TIMESTAMPTZ(3),
ADD COLUMN     "settledAt" TIMESTAMPTZ(3),
ADD COLUMN     "settlementRef" VARCHAR(24);

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "adjustments" DECIMAL(16,2) NOT NULL DEFAULT 0,
ADD COLUMN     "method" "payout_account_kind",
ADD COLUMN     "paidById" VARCHAR(40);

-- `periodRef` is NOT NULL with no default, so the generated single statement
-- fails on any table that already holds a payout. Added nullable, derived from
-- the period the row already records, then constrained.
--
-- `IYYY-"W"IW` is the ISO week `types/finance.ts` uses ("2026-W34").
--
-- Computed from the period's MIDPOINT, not from either boundary. `to_char` on a
-- `timestamptz` renders in the session's time zone, so a window stored as local
-- Monday 00:00 -> Sunday 23:59:59.999 has both ends sitting right against a week
-- boundary: run the same statement in Asia/Dhaka and `periodEnd` is already
-- Monday, putting the row in the following week. The midpoint is a Thursday,
-- three and a half days from either edge, which no offset in the ±14h range can
-- push out of the week — and Thursday is the day ISO-8601 uses to decide which
-- year a straddling week belongs to anyway.
ALTER TABLE "payouts" ADD COLUMN "periodRef" VARCHAR(24);
UPDATE "payouts"
   SET "periodRef" = to_char("periodStart" + ("periodEnd" - "periodStart") / 2, 'IYYY-"W"IW')
 WHERE "periodRef" IS NULL;
ALTER TABLE "payouts" ALTER COLUMN "periodRef" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "blockReason" "account_block_reason",
ADD COLUMN     "blockedAt" TIMESTAMPTZ(3),
ADD COLUMN     "blockedById" VARCHAR(40);

-- AlterTable
ALTER TABLE "vendor_staff" DROP COLUMN "isActive",
ADD COLUMN     "acceptedAt" TIMESTAMPTZ(3),
ADD COLUMN     "invitedAt" TIMESTAMPTZ(3),
ADD COLUMN     "invitedById" VARCHAR(40),
ADD COLUMN     "invitedEmail" VARCHAR(191) NOT NULL DEFAULT '',
ADD COLUMN     "invitedName" VARCHAR(120) NOT NULL DEFAULT '',
ADD COLUMN     "role" "staff_role_kind" NOT NULL DEFAULT 'manager',
ADD COLUMN     "status" "staff_status_kind" NOT NULL DEFAULT 'invited',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "zone_areas" ADD COLUMN     "label" VARCHAR(120) NOT NULL DEFAULT '',
ADD COLUMN     "lat" DECIMAL(10,7),
ADD COLUMN     "lng" DECIMAL(10,7);

-- CreateTable
CREATE TABLE "vendor_staff_permissions" (
    "staffId" VARCHAR(40) NOT NULL,
    "permissionId" VARCHAR(40) NOT NULL,
    "effect" BOOLEAN NOT NULL DEFAULT true,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" VARCHAR(40),

    CONSTRAINT "vendor_staff_permissions_pkey" PRIMARY KEY ("staffId","permissionId")
);

-- CreateTable
CREATE TABLE "account_moderation_events" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40) NOT NULL,
    "action" "account_moderation_action" NOT NULL,
    "reason" "account_block_reason",
    "body" VARCHAR(1000),
    "actorId" VARCHAR(40),
    "actorName" VARCHAR(120) NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_moderation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_applications" (
    "id" VARCHAR(40) NOT NULL,
    "applicationNumber" VARCHAR(24) NOT NULL,
    "vendorId" VARCHAR(40),
    "ownerId" VARCHAR(40),
    "status" "onboarding_status" NOT NULL DEFAULT 'draft',
    "ownerName" VARCHAR(120) NOT NULL,
    "ownerEmail" VARCHAR(191) NOT NULL,
    "ownerPhone" VARCHAR(24) NOT NULL,
    "ownerNationalId" VARCHAR(60) NOT NULL,
    "legalName" VARCHAR(200) NOT NULL,
    "tradeLicence" VARCHAR(80) NOT NULL,
    "tin" VARCHAR(80) NOT NULL,
    "bin" VARCHAR(80),
    "vendorType" "vendor_type_kind" NOT NULL DEFAULT 'restaurant',
    "yearsTrading" SMALLINT NOT NULL DEFAULT 0,
    "restaurantName" VARCHAR(160) NOT NULL,
    "tagline" VARCHAR(240) NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "proposedCuisineIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priceLevel" SMALLINT NOT NULL DEFAULT 2,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "address" VARCHAR(300) NOT NULL DEFAULT '',
    "area" VARCHAR(120),
    "city" VARCHAR(120) NOT NULL DEFAULT '',
    "countryCode" CHAR(2) NOT NULL,
    "contactPhone" VARCHAR(24) NOT NULL,
    "contactEmail" VARCHAR(191) NOT NULL,
    "proposedHours" JSONB NOT NULL DEFAULT '{}',
    "offersDelivery" BOOLEAN NOT NULL DEFAULT true,
    "offersPickup" BOOLEAN NOT NULL DEFAULT true,
    "deliveryFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minOrder" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "freeDeliveryOver" DECIMAL(14,2),
    "etaMinMinutes" SMALLINT NOT NULL DEFAULT 25,
    "etaMaxMinutes" SMALLINT NOT NULL DEFAULT 40,
    "proposedZoneIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payoutMethod" "payout_account_kind" NOT NULL DEFAULT 'bank',
    "payoutProvider" VARCHAR(160) NOT NULL DEFAULT '',
    "payoutAccountName" VARCHAR(160) NOT NULL DEFAULT '',
    "payoutAccountNumber" VARCHAR(80) NOT NULL DEFAULT '',
    "payoutBranch" VARCHAR(160),
    "submittedAt" TIMESTAMPTZ(3),
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" VARCHAR(40),
    "decisionNote" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vendor_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_application_branches" (
    "id" VARCHAR(40) NOT NULL,
    "applicationId" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "area" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(24) NOT NULL,
    "hours" JSONB,
    "branchId" VARCHAR(40),
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vendor_application_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_applications" (
    "id" VARCHAR(40) NOT NULL,
    "applicationNumber" VARCHAR(24) NOT NULL,
    "riderId" VARCHAR(40),
    "userId" VARCHAR(40),
    "status" "onboarding_status" NOT NULL DEFAULT 'draft',
    "name" VARCHAR(120) NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "nationalId" VARCHAR(60) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "area" VARCHAR(120) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "phone" VARCHAR(24) NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "emergencyName" VARCHAR(120) NOT NULL DEFAULT '',
    "emergencyRelationship" VARCHAR(80) NOT NULL DEFAULT '',
    "emergencyPhone" VARCHAR(24) NOT NULL DEFAULT '',
    "vehicle" "rider_vehicle_kind" NOT NULL DEFAULT 'bike',
    "plate" VARCHAR(24),
    "vehicleModel" VARCHAR(120),
    "licenceNumber" VARCHAR(60),
    "zoneId" VARCHAR(40) NOT NULL,
    "payoutMethod" "payout_account_kind" NOT NULL DEFAULT 'mfs',
    "payoutProvider" VARCHAR(160) NOT NULL DEFAULT '',
    "payoutAccountName" VARCHAR(160) NOT NULL DEFAULT '',
    "payoutAccountNumber" VARCHAR(80) NOT NULL DEFAULT '',
    "payoutBranch" VARCHAR(160),
    "submittedAt" TIMESTAMPTZ(3),
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" VARCHAR(40),
    "decisionNote" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rider_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_documents" (
    "id" VARCHAR(40) NOT NULL,
    "vendorApplicationId" VARCHAR(40),
    "riderApplicationId" VARCHAR(40),
    "kind" "onboarding_doc_kind" NOT NULL,
    "status" "onboarding_doc_status" NOT NULL DEFAULT 'missing',
    "reference" VARCHAR(200),
    "fileId" VARCHAR(40),
    "expiresAt" TIMESTAMPTZ(3),
    "note" VARCHAR(500),
    "uploadedAt" TIMESTAMPTZ(3),
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedById" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "onboarding_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_events" (
    "id" VARCHAR(40) NOT NULL,
    "vendorApplicationId" VARCHAR(40),
    "riderApplicationId" VARCHAR(40),
    "kind" "onboarding_event_kind" NOT NULL,
    "author" "onboarding_author_kind" NOT NULL,
    "authorName" VARCHAR(120) NOT NULL,
    "authorId" VARCHAR(40),
    "status" "onboarding_status",
    "body" VARCHAR(1000),
    "document" "onboarding_doc_kind",
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_commissions" (
    "orderId" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "rate" DECIMAL(6,4) NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "commissionableAmount" DECIMAL(14,2) NOT NULL,
    "commissionAmount" DECIMAL(14,2) NOT NULL,
    "vendorNetAmount" DECIMAL(14,2) NOT NULL,
    "platformAmount" DECIMAL(14,2) NOT NULL,
    "deliveryFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tip" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "commission_status" NOT NULL DEFAULT 'charged',
    "settlementRef" VARCHAR(24) NOT NULL,
    "settledAt" TIMESTAMPTZ(3) NOT NULL,
    "reversedAt" TIMESTAMPTZ(3),
    "reversalReason" VARCHAR(240),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_commissions_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "order_rider_earnings" (
    "orderId" VARCHAR(40) NOT NULL,
    "riderId" VARCHAR(40) NOT NULL,
    "riderName" VARCHAR(120) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "jobId" VARCHAR(40),
    "distanceKm" DECIMAL(8,2) NOT NULL,
    "baseFare" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "distanceFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "peakBonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "batchBonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tip" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payoutTotal" DECIMAL(14,2) NOT NULL,
    "cashCollected" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "settlementRef" VARCHAR(24) NOT NULL,
    "settledAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_rider_earnings_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "settlement_adjustments" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40),
    "riderId" VARCHAR(40),
    "periodRef" VARCHAR(24) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "reason" VARCHAR(500),
    "payoutId" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" VARCHAR(40),

    CONSTRAINT "settlement_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_orders" (
    "payoutId" VARCHAR(40) NOT NULL,
    "orderId" VARCHAR(40) NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "commissionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "cashCollected" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "payout_orders_pkey" PRIMARY KEY ("payoutId","orderId")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" VARCHAR(40) NOT NULL,
    "ticketNumber" VARCHAR(24) NOT NULL,
    "orderId" VARCHAR(40) NOT NULL,
    "orderNumber" VARCHAR(24) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "vendorName" VARCHAR(160) NOT NULL,
    "userId" VARCHAR(40),
    "customerName" VARCHAR(120) NOT NULL,
    "customerPhone" VARCHAR(24) NOT NULL,
    "category" "support_category_kind" NOT NULL,
    "status" "support_ticket_status_kind" NOT NULL DEFAULT 'open',
    "currency" CHAR(3) NOT NULL,
    "orderTotal" DECIMAL(14,2) NOT NULL,
    "resolutionOutcome" "support_outcome_kind",
    "resolutionNote" VARCHAR(1000),
    "resolutionRefundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedById" VARCHAR(40),
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),
    "lastEventAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_events" (
    "id" VARCHAR(40) NOT NULL,
    "ticketId" VARCHAR(40) NOT NULL,
    "kind" "support_event_kind" NOT NULL,
    "author" "support_author_kind" NOT NULL,
    "authorName" VARCHAR(120) NOT NULL,
    "authorId" VARCHAR(40),
    "body" VARCHAR(2000),
    "status" "support_ticket_status_kind",
    "refundDecision" "support_refund_decision",
    "refundAmount" DECIMAL(14,2),
    "refundMethod" "refund_method_kind",
    "visibility" "support_visibility" NOT NULL DEFAULT 'customer',
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_threads" (
    "id" VARCHAR(40) NOT NULL,
    "orderId" VARCHAR(40) NOT NULL,
    "orderNumber" VARCHAR(24) NOT NULL,
    "party" "contact_party_kind" NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "vendorName" VARCHAR(160) NOT NULL,
    "riderId" VARCHAR(40),
    "riderName" VARCHAR(120),
    "userId" VARCHAR(40),
    "customerName" VARCHAR(120) NOT NULL,
    "lastEntryAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_thread_entries" (
    "id" VARCHAR(40) NOT NULL,
    "threadId" VARCHAR(40) NOT NULL,
    "kind" "contact_entry_kind" NOT NULL DEFAULT 'message',
    "author" "contact_author_kind" NOT NULL,
    "authorName" VARCHAR(160) NOT NULL,
    "authorId" VARCHAR(40),
    "body" VARCHAR(2000),
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_thread_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_staff_permissions_permissionId_idx" ON "vendor_staff_permissions"("permissionId");

-- CreateIndex
CREATE INDEX "account_moderation_events_userId_at_idx" ON "account_moderation_events"("userId", "at" DESC);

-- CreateIndex
CREATE INDEX "account_moderation_events_action_at_idx" ON "account_moderation_events"("action", "at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_applications_applicationNumber_key" ON "vendor_applications"("applicationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_applications_vendorId_key" ON "vendor_applications"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_applications_status_submittedAt_idx" ON "vendor_applications"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "vendor_applications_ownerId_idx" ON "vendor_applications"("ownerId");

-- CreateIndex
CREATE INDEX "vendor_applications_city_countryCode_idx" ON "vendor_applications"("city", "countryCode");

-- CreateIndex
CREATE INDEX "vendor_applications_deletedAt_idx" ON "vendor_applications"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_application_branches_branchId_key" ON "vendor_application_branches"("branchId");

-- CreateIndex
CREATE INDEX "vendor_application_branches_applicationId_sort_idx" ON "vendor_application_branches"("applicationId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "rider_applications_applicationNumber_key" ON "rider_applications"("applicationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "rider_applications_riderId_key" ON "rider_applications"("riderId");

-- CreateIndex
CREATE INDEX "rider_applications_status_submittedAt_idx" ON "rider_applications"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "rider_applications_zoneId_status_idx" ON "rider_applications"("zoneId", "status");

-- CreateIndex
CREATE INDEX "rider_applications_userId_idx" ON "rider_applications"("userId");

-- CreateIndex
CREATE INDEX "rider_applications_deletedAt_idx" ON "rider_applications"("deletedAt");

-- CreateIndex
CREATE INDEX "onboarding_documents_vendorApplicationId_idx" ON "onboarding_documents"("vendorApplicationId");

-- CreateIndex
CREATE INDEX "onboarding_documents_riderApplicationId_idx" ON "onboarding_documents"("riderApplicationId");

-- CreateIndex
CREATE INDEX "onboarding_documents_status_expiresAt_idx" ON "onboarding_documents"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "onboarding_events_vendorApplicationId_at_idx" ON "onboarding_events"("vendorApplicationId", "at");

-- CreateIndex
CREATE INDEX "onboarding_events_riderApplicationId_at_idx" ON "onboarding_events"("riderApplicationId", "at");

-- CreateIndex
CREATE INDEX "order_commissions_vendorId_settlementRef_idx" ON "order_commissions"("vendorId", "settlementRef");

-- CreateIndex
CREATE INDEX "order_commissions_settlementRef_idx" ON "order_commissions"("settlementRef");

-- CreateIndex
CREATE INDEX "order_commissions_status_settledAt_idx" ON "order_commissions"("status", "settledAt" DESC);

-- CreateIndex
CREATE INDEX "order_rider_earnings_riderId_settlementRef_idx" ON "order_rider_earnings"("riderId", "settlementRef");

-- CreateIndex
CREATE INDEX "order_rider_earnings_settlementRef_idx" ON "order_rider_earnings"("settlementRef");

-- CreateIndex
CREATE INDEX "order_rider_earnings_jobId_idx" ON "order_rider_earnings"("jobId");

-- CreateIndex
CREATE INDEX "settlement_adjustments_vendorId_periodRef_payoutId_idx" ON "settlement_adjustments"("vendorId", "periodRef", "payoutId");

-- CreateIndex
CREATE INDEX "settlement_adjustments_riderId_periodRef_payoutId_idx" ON "settlement_adjustments"("riderId", "periodRef", "payoutId");

-- CreateIndex
CREATE INDEX "settlement_adjustments_payoutId_idx" ON "settlement_adjustments"("payoutId");

-- CreateIndex
CREATE INDEX "payout_orders_orderId_idx" ON "payout_orders"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_ticketNumber_key" ON "support_tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "support_tickets_status_lastEventAt_idx" ON "support_tickets"("status", "lastEventAt");

-- CreateIndex
CREATE INDEX "support_tickets_orderId_idx" ON "support_tickets"("orderId");

-- CreateIndex
CREATE INDEX "support_tickets_userId_submittedAt_idx" ON "support_tickets"("userId", "submittedAt" DESC);

-- CreateIndex
CREATE INDEX "support_tickets_vendorId_status_idx" ON "support_tickets"("vendorId", "status");

-- CreateIndex
CREATE INDEX "support_tickets_category_submittedAt_idx" ON "support_tickets"("category", "submittedAt" DESC);

-- CreateIndex
CREATE INDEX "support_tickets_deletedAt_idx" ON "support_tickets"("deletedAt");

-- CreateIndex
CREATE INDEX "support_ticket_events_ticketId_visibility_at_idx" ON "support_ticket_events"("ticketId", "visibility", "at");

-- CreateIndex
CREATE INDEX "support_ticket_events_ticketId_at_idx" ON "support_ticket_events"("ticketId", "at");

-- CreateIndex
CREATE INDEX "order_threads_userId_lastEntryAt_idx" ON "order_threads"("userId", "lastEntryAt" DESC);

-- CreateIndex
CREATE INDEX "order_threads_riderId_lastEntryAt_idx" ON "order_threads"("riderId", "lastEntryAt" DESC);

-- CreateIndex
CREATE INDEX "order_threads_vendorId_lastEntryAt_idx" ON "order_threads"("vendorId", "lastEntryAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "order_threads_orderId_party_key" ON "order_threads"("orderId", "party");

-- CreateIndex
CREATE INDEX "order_thread_entries_threadId_at_idx" ON "order_thread_entries"("threadId", "at");

-- CreateIndex
CREATE INDEX "order_events_detailKind_at_idx" ON "order_events"("detailKind", "at" DESC);

-- CreateIndex
CREATE INDEX "orders_couponId_status_idx" ON "orders"("couponId", "status");

-- CreateIndex
CREATE INDEX "orders_settlementRef_vendorId_idx" ON "orders"("settlementRef", "vendorId");

-- CreateIndex
CREATE INDEX "payouts_periodRef_idx" ON "payouts"("periodRef");

-- CreateIndex
CREATE INDEX "vendor_staff_vendorId_status_idx" ON "vendor_staff"("vendorId", "status");

-- AddForeignKey
ALTER TABLE "vendor_staff_permissions" ADD CONSTRAINT "vendor_staff_permissions_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "vendor_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_staff_permissions" ADD CONSTRAINT "vendor_staff_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_moderation_events" ADD CONSTRAINT "account_moderation_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_moderation_events" ADD CONSTRAINT "account_moderation_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_applications" ADD CONSTRAINT "vendor_applications_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_application_branches" ADD CONSTRAINT "vendor_application_branches_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "vendor_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_application_branches" ADD CONSTRAINT "vendor_application_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "vendor_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_applications" ADD CONSTRAINT "rider_applications_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_applications" ADD CONSTRAINT "rider_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_applications" ADD CONSTRAINT "rider_applications_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_applications" ADD CONSTRAINT "rider_applications_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_vendorApplicationId_fkey" FOREIGN KEY ("vendorApplicationId") REFERENCES "vendor_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_riderApplicationId_fkey" FOREIGN KEY ("riderApplicationId") REFERENCES "rider_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_events" ADD CONSTRAINT "onboarding_events_vendorApplicationId_fkey" FOREIGN KEY ("vendorApplicationId") REFERENCES "vendor_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_events" ADD CONSTRAINT "onboarding_events_riderApplicationId_fkey" FOREIGN KEY ("riderApplicationId") REFERENCES "rider_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_options" ADD CONSTRAINT "cart_item_options_cartId_cartItemId_fkey" FOREIGN KEY ("cartId", "cartItemId") REFERENCES "cart_items"("cartId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_commissions" ADD CONSTRAINT "order_commissions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_commissions" ADD CONSTRAINT "order_commissions_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_rider_earnings" ADD CONSTRAINT "order_rider_earnings_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_rider_earnings" ADD CONSTRAINT "order_rider_earnings_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_rider_earnings" ADD CONSTRAINT "order_rider_earnings_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "delivery_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_adjustments" ADD CONSTRAINT "settlement_adjustments_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_adjustments" ADD CONSTRAINT "settlement_adjustments_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_adjustments" ADD CONSTRAINT "settlement_adjustments_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_orders" ADD CONSTRAINT "payout_orders_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_orders" ADD CONSTRAINT "payout_orders_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_threads" ADD CONSTRAINT "order_threads_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_threads" ADD CONSTRAINT "order_threads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_threads" ADD CONSTRAINT "order_threads_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_thread_entries" ADD CONSTRAINT "order_thread_entries_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "order_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;


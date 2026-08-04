-- =============================================================================
-- V1 baseline — the whole Phase D4 schema, as one migration.
--
-- GENERATED, DO NOT HAND-EDIT. Reproduce byte-for-byte with:
--
--     bun run migrate:baseline
--
-- (i.e. `prisma migrate diff --from-empty --to-schema-datamodel ./prisma/schema
-- --script`, which needs no database connection — see database/README.md).
--
-- ## Why the baseline is the entire schema and not just the V1 tables
--
-- The V1 brief asks for "only the tables required for this flow". Prisma derives
-- migrations from the *whole* datamodel, so a hand-carved subset would be drift
-- the moment anyone ran `migrate dev`: the engine would immediately want to add
-- the other 120 tables back. One honest baseline that matches the schema costs
-- nothing at demo scale — empty tables are free — and keeps the migration history
-- a true record of the datamodel. The V1 scope boundary is enforced by which
-- modules and resolvers exist, which is where it belongs.
--
-- 169 tables · 104 enums · 333 indexes · 224 foreign keys.
--
-- Partial unique indexes that Prisma cannot express live in the next migration.
-- `btree_gist` (reservations' exclusion constraints) is deliberately absent: the
-- schema does not declare it, so creating it here would register as drift.
-- `docker/postgres/init/01-extensions.sql` provides it for local development.
-- =============================================================================

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateEnum
CREATE TYPE "ai_intent_kind" AS ENUM ('recommend', 'find-dish', 'budget', 'mood', 'diet-plan', 'nutrition', 'allergy', 'reorder', 'small-talk', 'unknown');

-- CreateEnum
CREATE TYPE "ai_surface" AS ENUM ('assistant', 'search', 'diet-plan', 'recognition', 'review-summary', 'menu-ocr');

-- CreateEnum
CREATE TYPE "ai_message_role" AS ENUM ('user', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "vendor_type_kind" AS ENUM ('restaurant', 'cafe', 'cloud-kitchen', 'home-chef', 'catering');

-- CreateEnum
CREATE TYPE "dietary_tag_kind" AS ENUM ('halal', 'vegetarian', 'vegan', 'gluten-free', 'keto', 'healthy', 'spicy');

-- CreateEnum
CREATE TYPE "weekday_kind" AS ENUM ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');

-- CreateEnum
CREATE TYPE "vendor_status" AS ENUM ('draft', 'pending', 'active', 'paused', 'suspended');

-- CreateEnum
CREATE TYPE "menu_kind" AS ENUM ('delivery', 'dine-in', 'qr', 'pos', 'catering');

-- CreateEnum
CREATE TYPE "allergen_kind" AS ENUM ('peanuts', 'tree-nuts', 'dairy', 'egg', 'gluten', 'soy', 'fish', 'shellfish', 'sesame', 'mustard');

-- CreateEnum
CREATE TYPE "stock_movement_kind" AS ENUM ('received', 'sold', 'wasted', 'adjusted', 'returned', 'transferred');

-- CreateEnum
CREATE TYPE "event_type_kind" AS ENUM ('wedding', 'corporate', 'birthday', 'conference', 'outdoor');

-- CreateEnum
CREATE TYPE "service_style_kind" AS ENUM ('buffet', 'plated', 'family-style', 'food-stations', 'drop-off');

-- CreateEnum
CREATE TYPE "add_on_unit_kind" AS ENUM ('per-guest', 'flat');

-- CreateEnum
CREATE TYPE "quote_status_kind" AS ENUM ('requested', 'reviewing', 'quoted', 'confirmed', 'declined', 'expired');

-- CreateEnum
CREATE TYPE "cms_collection_kind" AS ENUM ('banners', 'pages', 'legal', 'posts', 'faqs', 'categories', 'menus', 'seo', 'site');

-- CreateEnum
CREATE TYPE "cms_revision_reason" AS ENUM ('publish', 'revert');

-- CreateEnum
CREATE TYPE "cms_audit_action_kind" AS ENUM ('created', 'saved', 'published', 'unpublished', 'reverted', 'archived', 'restored', 'discarded', 'reordered');

-- CreateEnum
CREATE TYPE "contact_topic_kind" AS ENUM ('order', 'partner', 'rider', 'press', 'other');

-- CreateEnum
CREATE TYPE "contact_message_status" AS ENUM ('new', 'read', 'replied', 'archived', 'spam');

-- CreateEnum
CREATE TYPE "post_status" AS ENUM ('draft', 'scheduled', 'published', 'archived');

-- CreateEnum
CREATE TYPE "job_opening_status" AS ENUM ('open', 'closed', 'draft');

-- CreateEnum
CREATE TYPE "rider_vehicle_kind" AS ENUM ('bike', 'scooter', 'bicycle', 'car');

-- CreateEnum
CREATE TYPE "rider_status" AS ENUM ('pending', 'active', 'suspended', 'inactive');

-- CreateEnum
CREATE TYPE "rider_document_kind" AS ENUM ('national-id', 'licence', 'vehicle-registration', 'insurance');

-- CreateEnum
CREATE TYPE "rider_document_status" AS ENUM ('verified', 'pending', 'expired', 'rejected');

-- CreateEnum
CREATE TYPE "delivery_job_status_kind" AS ENUM ('offered', 'accepted', 'picking-up', 'delivering', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "delivery_stop_kind" AS ENUM ('pickup', 'dropoff');

-- CreateEnum
CREATE TYPE "job_offer_outcome" AS ENUM ('pending', 'accepted', 'declined', 'expired', 'withdrawn');

-- CreateEnum
CREATE TYPE "rider_ledger_kind" AS ENUM ('trip', 'tip', 'bonus', 'cash-collected', 'remittance', 'withdrawal', 'penalty', 'adjustment');

-- CreateEnum
CREATE TYPE "remittance_method_kind" AS ENUM ('agent', 'bank', 'wallet');

-- CreateEnum
CREATE TYPE "withdrawal_status" AS ENUM ('processing', 'paid', 'failed');

-- CreateEnum
CREATE TYPE "table_zone_kind" AS ENUM ('indoor', 'outdoor', 'rooftop', 'private');

-- CreateEnum
CREATE TYPE "dine_in_session_status" AS ENUM ('open', 'billed', 'closed', 'abandoned');

-- CreateEnum
CREATE TYPE "service_request_kind" AS ENUM ('waiter', 'water', 'cutlery', 'bill');

-- CreateEnum
CREATE TYPE "pos_order_type_kind" AS ENUM ('dine-in', 'takeaway', 'delivery');

-- CreateEnum
CREATE TYPE "user_role_slug" AS ENUM ('guest', 'customer', 'restaurant-owner', 'cafe-owner', 'home-chef', 'cloud-kitchen', 'catering-company', 'delivery-rider', 'vendor-manager', 'customer-support', 'moderator', 'finance-manager', 'marketing-manager', 'super-admin');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'pending', 'suspended', 'banned');

-- CreateEnum
CREATE TYPE "social_provider_kind" AS ENUM ('google', 'apple', 'facebook');

-- CreateEnum
CREATE TYPE "session_revoke_reason" AS ENUM ('logout', 'rotation-reuse', 'password-change', 'admin', 'expired', 'device-removed');

-- CreateEnum
CREATE TYPE "device_platform" AS ENUM ('web', 'ios', 'android');

-- CreateEnum
CREATE TYPE "otp_purpose" AS ENUM ('login', 'register', 'phone-verify', 'password-reset', 'two-factor', 'delivery');

-- CreateEnum
CREATE TYPE "otp_channel" AS ENUM ('sms', 'email');

-- CreateEnum
CREATE TYPE "notification_topic_key" AS ENUM ('orderUpdates', 'deliveryAlerts', 'promotions', 'newVendors', 'weeklyDigest');

-- CreateEnum
CREATE TYPE "favorite_kind" AS ENUM ('vendor', 'food');

-- CreateEnum
CREATE TYPE "notify_audience_kind" AS ENUM ('customer', 'restaurant', 'rider', 'admin');

-- CreateEnum
CREATE TYPE "notify_tone_kind" AS ENUM ('info', 'success', 'warning', 'danger');

-- CreateEnum
CREATE TYPE "notify_category_kind" AS ENUM ('order', 'delivery', 'payment', 'review', 'reservation', 'subscription', 'catering', 'promo', 'system');

-- CreateEnum
CREATE TYPE "notify_channel_kind" AS ENUM ('inApp', 'push', 'email', 'sms');

-- CreateEnum
CREATE TYPE "notify_subject_kind" AS ENUM ('order', 'review', 'reservation', 'subscription', 'quote', 'coupon', 'wallet', 'broadcast');

-- CreateEnum
CREATE TYPE "dispatch_status_kind" AS ENUM ('queued', 'sent', 'delivered', 'suppressed', 'failed', 'bounced');

-- CreateEnum
CREATE TYPE "delivery_channel_kind" AS ENUM ('push', 'email', 'sms');

-- CreateEnum
CREATE TYPE "segment_kind" AS ENUM ('all-customers', 'active-customers', 'lapsed-customers', 'subscribers', 'restaurants', 'riders');

-- CreateEnum
CREATE TYPE "broadcast_kind" AS ENUM ('promotion', 'announcement');

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "order_status_kind" AS ENUM ('placed', 'confirmed', 'preparing', 'packing', 'ready', 'rider-assigned', 'picked-up', 'on-the-way', 'arrived', 'delivered', 'completed', 'rejected', 'cancelled', 'delivery-failed', 'returned', 'refunded');

-- CreateEnum
CREATE TYPE "order_actor_kind" AS ENUM ('customer', 'restaurant', 'rider', 'system', 'admin');

-- CreateEnum
CREATE TYPE "fulfillment_kind" AS ENUM ('delivery', 'pickup');

-- CreateEnum
CREATE TYPE "payment_method_kind" AS ENUM ('cash', 'card', 'wallet', 'mfs', 'netbanking');

-- CreateEnum
CREATE TYPE "payment_status_kind" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "order_cancel_reason_kind" AS ENUM ('out-of-stock', 'too-busy', 'closing-soon', 'cannot-deliver', 'changed-mind', 'too-slow', 'ordered-by-mistake', 'duplicate', 'customer-unavailable', 'wrong-address', 'refused-delivery', 'other');

-- CreateEnum
CREATE TYPE "refund_status_kind" AS ENUM ('none', 'requested', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "assignment_kind" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "order_channel" AS ENUM ('web', 'app', 'qr', 'pos', 'phone');

-- CreateEnum
CREATE TYPE "refund_request_status" AS ENUM ('requested', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "payment_provider_kind" AS ENUM ('stripe', 'sslcommerz', 'bkash', 'nagad', 'rocket', 'paypal', 'apple-pay', 'google-pay', 'cash', 'wallet');

-- CreateEnum
CREATE TYPE "payment_capability" AS ENUM ('charge', 'refund', 'partial-refund', 'tokenize', 'webhook', 'payout', 'three-ds');

-- CreateEnum
CREATE TYPE "payment_intent_status" AS ENUM ('created', 'requires-action', 'processing', 'authorized', 'captured', 'failed', 'cancelled', 'partially-refunded', 'refunded', 'expired');

-- CreateEnum
CREATE TYPE "payment_txn_kind" AS ENUM ('authorize', 'capture', 'void', 'refund', 'chargeback', 'sync');

-- CreateEnum
CREATE TYPE "refund_reason_kind" AS ENUM ('order-cancelled', 'order-returned', 'item-missing', 'quality', 'late', 'duplicate-charge', 'goodwill', 'other');

-- CreateEnum
CREATE TYPE "refund_execution_status" AS ENUM ('pending', 'processing', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "webhook_status" AS ENUM ('received', 'verified', 'processed', 'ignored', 'invalid', 'failed');

-- CreateEnum
CREATE TYPE "wallet_txn_kind" AS ENUM ('top-up', 'payment', 'refund', 'reward', 'cashback', 'adjustment');

-- CreateEnum
CREATE TYPE "ledger_account_kind" AS ENUM ('platform-revenue', 'platform-cash', 'vendor-payable', 'rider-payable', 'rider-cash-held', 'customer-wallet', 'tax-payable', 'gateway-fees', 'promotions', 'suspense');

-- CreateEnum
CREATE TYPE "payout_account_kind" AS ENUM ('bank', 'mfs', 'stripe', 'paypal');

-- CreateEnum
CREATE TYPE "payout_status" AS ENUM ('scheduled', 'processing', 'paid', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "membership_interval" AS ENUM ('monthly', 'yearly');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('trialing', 'active', 'past-due', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "text_direction" AS ENUM ('ltr', 'rtl');

-- CreateEnum
CREATE TYPE "tax_kind" AS ENUM ('vat', 'gst', 'sales-tax', 'service');

-- CreateEnum
CREATE TYPE "tax_applies_to" AS ENUM ('order-subtotal', 'delivery-fee', 'service-charge', 'packaging');

-- CreateEnum
CREATE TYPE "setting_scope" AS ENUM ('platform', 'country', 'vendor');

-- CreateEnum
CREATE TYPE "setting_value_type" AS ENUM ('string', 'number', 'boolean', 'json');

-- CreateEnum
CREATE TYPE "feature_flag_strategy" AS ENUM ('boolean', 'percentage', 'allowlist', 'country', 'role');

-- CreateEnum
CREATE TYPE "file_visibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "outbox_status" AS ENUM ('pending', 'dispatched', 'failed');

-- CreateEnum
CREATE TYPE "discount_kind" AS ENUM ('percentage', 'fixed', 'free-delivery', 'bogo', 'cashback');

-- CreateEnum
CREATE TYPE "promo_scope" AS ENUM ('platform', 'vendor', 'category');

-- CreateEnum
CREATE TYPE "offer_placement_kind" AS ENUM ('flash', 'featured', 'coupon', 'standard');

-- CreateEnum
CREATE TYPE "coupon_source_kind" AS ENUM ('campaign', 'welcome', 'referral', 'loyalty', 'apology', 'birthday', 'vendor');

-- CreateEnum
CREATE TYPE "coupon_claim_via" AS ENUM ('code', 'granted');

-- CreateEnum
CREATE TYPE "reservation_status_kind" AS ENUM ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no-show');

-- CreateEnum
CREATE TYPE "occasion_kind" AS ENUM ('none', 'birthday', 'anniversary', 'date', 'business', 'celebration');

-- CreateEnum
CREATE TYPE "review_subject_kind" AS ENUM ('vendor', 'rider');

-- CreateEnum
CREATE TYPE "review_aspect_kind" AS ENUM ('food', 'delivery', 'packaging', 'value');

-- CreateEnum
CREATE TYPE "review_tag_kind" AS ENUM ('tasty', 'generous', 'hot-on-arrival', 'fast-delivery', 'well-packaged', 'good-value', 'friendly-rider', 'will-reorder', 'late', 'arrived-cold', 'small-portion', 'wrong-item', 'pricey', 'poor-packaging');

-- CreateEnum
CREATE TYPE "review_media_kind" AS ENUM ('photo', 'video');

-- CreateEnum
CREATE TYPE "review_moderation_status" AS ENUM ('published', 'pending', 'hidden', 'rejected');

-- CreateEnum
CREATE TYPE "report_reason_kind" AS ENUM ('spam', 'offensive', 'irrelevant', 'fake', 'privacy', 'other');

-- CreateEnum
CREATE TYPE "aggregate_subject" AS ENUM ('vendor', 'rider', 'food');

-- CreateEnum
CREATE TYPE "plan_goal_kind" AS ENUM ('balanced', 'weight-loss', 'muscle-gain', 'keto', 'plant-based', 'family');

-- CreateEnum
CREATE TYPE "meal_slot_kind" AS ENUM ('breakfast', 'lunch', 'dinner');

-- CreateEnum
CREATE TYPE "billing_cycle_kind" AS ENUM ('weekly', 'monthly');

-- CreateEnum
CREATE TYPE "subscription_status_kind" AS ENUM ('active', 'paused', 'cancelled', 'past-due');

-- CreateEnum
CREATE TYPE "cycle_status" AS ENUM ('scheduled', 'paid', 'failed', 'skipped', 'refunded');

-- CreateTable
CREATE TABLE "food_profiles" (
    "userId" VARCHAR(40) NOT NULL,
    "allergens" "allergen_kind"[] DEFAULT ARRAY[]::"allergen_kind"[],
    "dietary" "dietary_tag_kind"[] DEFAULT ARRAY[]::"dietary_tag_kind"[],
    "calorieTarget" INTEGER,
    "proteinTarget" INTEGER,
    "budgetPerOrder" DECIMAL(14,2),
    "spiceTolerance" SMALLINT NOT NULL DEFAULT 1,
    "likedCuisineIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dislikedCuisineIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dislikes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "food_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40),
    "guestKey" VARCHAR(60),
    "surface" "ai_surface" NOT NULL DEFAULT 'assistant',
    "locale" VARCHAR(8) NOT NULL DEFAULT 'en',
    "context" JSONB NOT NULL DEFAULT '{}',
    "title" VARCHAR(200),
    "lastMessageAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" VARCHAR(40) NOT NULL,
    "conversationId" VARCHAR(40) NOT NULL,
    "role" "ai_message_role" NOT NULL,
    "text" TEXT,
    "blocks" JSONB,
    "intent" "ai_intent_kind",
    "parsed" JSONB,
    "foodIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vendorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40),
    "surface" "ai_surface" NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "model" VARCHAR(80),
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" VARCHAR(60),
    "isLocal" BOOLEAN NOT NULL DEFAULT false,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_recognitions" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40),
    "surface" "ai_surface" NOT NULL DEFAULT 'recognition',
    "fileId" VARCHAR(40),
    "fingerprint" JSONB,
    "result" JSONB,
    "matchedFoodIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" VARCHAR(12),
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_recognitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_query_logs" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40),
    "term" VARCHAR(200) NOT NULL,
    "rawTerm" VARCHAR(200) NOT NULL,
    "filters" JSONB,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "clickedEntity" VARCHAR(40),
    "clickedId" VARCHAR(40),
    "clickedRank" SMALLINT,
    "countryCode" CHAR(2),
    "city" VARCHAR(120),
    "locale" VARCHAR(8),
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_query_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_term_stats" (
    "term" VARCHAR(200) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "weight" DECIMAL(8,6) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "search_term_stats_pkey" PRIMARY KEY ("term","countryCode")
);

-- CreateTable
CREATE TABLE "cuisines" (
    "id" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "emoji" VARCHAR(16) NOT NULL,
    "image" VARCHAR(500) NOT NULL,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cuisines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "emoji" VARCHAR(16) NOT NULL,
    "image" VARCHAR(500) NOT NULL,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "parentId" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_keywords" (
    "categoryId" VARCHAR(40) NOT NULL,
    "term" VARCHAR(80) NOT NULL,
    "weight" SMALLINT NOT NULL DEFAULT 1,

    CONSTRAINT "category_keywords_pkey" PRIMARY KEY ("categoryId","term")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "type" "vendor_type_kind" NOT NULL,
    "ownerId" VARCHAR(40),
    "name" VARCHAR(160) NOT NULL,
    "tagline" VARCHAR(240) NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "logo" VARCHAR(500) NOT NULL DEFAULT '',
    "cover" VARCHAR(500) NOT NULL DEFAULT '',
    "priceLevel" SMALLINT NOT NULL DEFAULT 2,
    "currency" CHAR(3) NOT NULL,
    "status" "vendor_status" NOT NULL DEFAULT 'active',
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isTrending" BOOLEAN NOT NULL DEFAULT false,
    "promoLabel" VARCHAR(120),
    "commissionRate" DECIMAL(6,4) NOT NULL DEFAULT 0.15,
    "acceptsReservations" BOOLEAN NOT NULL DEFAULT false,
    "acceptsCatering" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdBy" VARCHAR(40),
    "updatedBy" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_branches" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(24),
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "area" VARCHAR(120),
    "city" VARCHAR(120) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "postcode" VARCHAR(24),
    "timezone" VARCHAR(64) NOT NULL,
    "etaMinMinutes" SMALLINT NOT NULL DEFAULT 25,
    "etaMaxMinutes" SMALLINT NOT NULL DEFAULT 40,
    "deliveryFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minOrder" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "freeDeliveryOver" DECIMAL(14,2),
    "deliveryRadiusKm" DECIMAL(6,2) NOT NULL DEFAULT 8,
    "packagingFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "serviceChargeRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "supportsDelivery" BOOLEAN NOT NULL DEFAULT true,
    "supportsPickup" BOOLEAN NOT NULL DEFAULT true,
    "supportsDineIn" BOOLEAN NOT NULL DEFAULT false,
    "acceptingOrders" BOOLEAN NOT NULL DEFAULT true,
    "pausedUntil" TIMESTAMPTZ(3),
    "status" "vendor_status" NOT NULL DEFAULT 'active',
    "zoneId" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "updatedBy" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vendor_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_hours" (
    "id" VARCHAR(40) NOT NULL,
    "branchId" VARCHAR(40) NOT NULL,
    "weekday" "weekday_kind" NOT NULL,
    "openTime" VARCHAR(5),
    "closeTime" VARCHAR(5),
    "overnight" BOOLEAN NOT NULL DEFAULT false,
    "sort" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "branch_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_closures" (
    "id" VARCHAR(40) NOT NULL,
    "branchId" VARCHAR(40) NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "reason" VARCHAR(160),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_cuisines" (
    "vendorId" VARCHAR(40) NOT NULL,
    "cuisineId" VARCHAR(40) NOT NULL,
    "sort" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "vendor_cuisines_pkey" PRIMARY KEY ("vendorId","cuisineId")
);

-- CreateTable
CREATE TABLE "vendor_dietary" (
    "vendorId" VARCHAR(40) NOT NULL,
    "tag" "dietary_tag_kind" NOT NULL,

    CONSTRAINT "vendor_dietary_pkey" PRIMARY KEY ("vendorId","tag")
);

-- CreateTable
CREATE TABLE "vendor_staff" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40) NOT NULL,
    "branchId" VARCHAR(40),
    "jobTitle" VARCHAR(80) NOT NULL DEFAULT '',
    "pinHash" CHAR(64),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "vendor_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenities" (
    "id" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "icon" VARCHAR(60) NOT NULL DEFAULT '',
    "group" VARCHAR(40) NOT NULL DEFAULT 'facilities',
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_amenities" (
    "branchId" VARCHAR(40) NOT NULL,
    "amenityId" VARCHAR(40) NOT NULL,

    CONSTRAINT "branch_amenities_pkey" PRIMARY KEY ("branchId","amenityId")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "kind" "menu_kind" NOT NULL DEFAULT 'delivery',
    "name" VARCHAR(120) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "availableFrom" VARCHAR(5),
    "availableTo" VARCHAR(5),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_sections" (
    "id" VARCHAR(40) NOT NULL,
    "menuId" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(300),
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_items" (
    "id" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "sectionId" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "image" VARCHAR(500) NOT NULL DEFAULT '',
    "price" DECIMAL(14,2) NOT NULL,
    "compareAtPrice" DECIMAL(14,2),
    "spicyLevel" SMALLINT NOT NULL DEFAULT 0,
    "calories" INTEGER,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "prepMinutes" SMALLINT NOT NULL DEFAULT 0,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "sku" VARCHAR(60),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "updatedBy" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "food_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_dietary" (
    "foodId" VARCHAR(40) NOT NULL,
    "tag" "dietary_tag_kind" NOT NULL,

    CONSTRAINT "food_dietary_pkey" PRIMARY KEY ("foodId","tag")
);

-- CreateTable
CREATE TABLE "food_categories" (
    "foodId" VARCHAR(40) NOT NULL,
    "categoryId" VARCHAR(40) NOT NULL,

    CONSTRAINT "food_categories_pkey" PRIMARY KEY ("foodId","categoryId")
);

-- CreateTable
CREATE TABLE "food_option_groups" (
    "id" VARCHAR(40) NOT NULL,
    "foodId" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "min" SMALLINT NOT NULL DEFAULT 0,
    "max" SMALLINT NOT NULL DEFAULT 1,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "food_option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_options" (
    "id" VARCHAR(40) NOT NULL,
    "groupId" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "priceDelta" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "food_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_nutrition" (
    "foodId" VARCHAR(40) NOT NULL,
    "calories" INTEGER NOT NULL,
    "protein" DECIMAL(8,2) NOT NULL,
    "carbs" DECIMAL(8,2) NOT NULL,
    "fat" DECIMAL(8,2) NOT NULL,
    "fibre" DECIMAL(8,2),
    "sodiumMg" INTEGER,
    "servingSize" VARCHAR(40),
    "source" VARCHAR(24) NOT NULL DEFAULT 'merchant',
    "confidence" VARCHAR(12),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "food_nutrition_pkey" PRIMARY KEY ("foodId")
);

-- CreateTable
CREATE TABLE "food_allergens" (
    "foodId" VARCHAR(40) NOT NULL,
    "allergen" "allergen_kind" NOT NULL,
    "mayContain" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "food_allergens_pkey" PRIMARY KEY ("foodId","allergen")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "foodId" VARCHAR(40),
    "branchId" VARCHAR(40),
    "name" VARCHAR(160) NOT NULL,
    "sku" VARCHAR(60),
    "unit" VARCHAR(16) NOT NULL DEFAULT 'pcs',
    "onHand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "lowStockAt" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "trackStock" BOOLEAN NOT NULL DEFAULT true,
    "unitCost" DECIMAL(14,2),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" VARCHAR(40) NOT NULL,
    "itemId" VARCHAR(40) NOT NULL,
    "kind" "stock_movement_kind" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "balance" DECIMAL(14,3) NOT NULL,
    "refEntity" VARCHAR(40),
    "refId" VARCHAR(40),
    "note" VARCHAR(240),
    "actorId" VARCHAR(40),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_services" (
    "id" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "tagline" VARCHAR(240) NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "logo" VARCHAR(500) NOT NULL DEFAULT '',
    "cover" VARCHAR(500) NOT NULL DEFAULT '',
    "gallery" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vendorId" VARCHAR(40),
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "minGuests" SMALLINT NOT NULL,
    "maxGuests" SMALLINT NOT NULL,
    "pricePerGuestFrom" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "leadTimeDays" SMALLINT NOT NULL,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serviceFeeRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catering_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_service_cuisines" (
    "serviceId" VARCHAR(40) NOT NULL,
    "cuisineId" VARCHAR(40) NOT NULL,

    CONSTRAINT "catering_service_cuisines_pkey" PRIMARY KEY ("serviceId","cuisineId")
);

-- CreateTable
CREATE TABLE "catering_service_dietary" (
    "serviceId" VARCHAR(40) NOT NULL,
    "tag" "dietary_tag_kind" NOT NULL,

    CONSTRAINT "catering_service_dietary_pkey" PRIMARY KEY ("serviceId","tag")
);

-- CreateTable
CREATE TABLE "catering_service_events" (
    "serviceId" VARCHAR(40) NOT NULL,
    "eventType" "event_type_kind" NOT NULL,

    CONSTRAINT "catering_service_events_pkey" PRIMARY KEY ("serviceId","eventType")
);

-- CreateTable
CREATE TABLE "catering_service_styles" (
    "serviceId" VARCHAR(40) NOT NULL,
    "style" "service_style_kind" NOT NULL,

    CONSTRAINT "catering_service_styles_pkey" PRIMARY KEY ("serviceId","style")
);

-- CreateTable
CREATE TABLE "catering_packages" (
    "id" VARCHAR(40) NOT NULL,
    "serviceId" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "image" VARCHAR(500) NOT NULL DEFAULT '',
    "eventType" "event_type_kind" NOT NULL,
    "serviceStyle" "service_style_kind" NOT NULL,
    "pricePerGuest" DECIMAL(14,2) NOT NULL,
    "minGuests" SMALLINT NOT NULL,
    "courses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "includes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catering_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_add_ons" (
    "id" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(600) NOT NULL DEFAULT '',
    "price" DECIMAL(14,2) NOT NULL,
    "unit" "add_on_unit_kind" NOT NULL DEFAULT 'per-guest',
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catering_add_ons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_service_add_ons" (
    "serviceId" VARCHAR(40) NOT NULL,
    "addOnId" VARCHAR(40) NOT NULL,
    "priceOverride" DECIMAL(14,2),

    CONSTRAINT "catering_service_add_ons_pkey" PRIMARY KEY ("serviceId","addOnId")
);

-- CreateTable
CREATE TABLE "catering_quotes" (
    "id" VARCHAR(40) NOT NULL,
    "quoteNumber" VARCHAR(24) NOT NULL,
    "serviceId" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40),
    "serviceSnapshot" JSONB NOT NULL,
    "packageId" VARCHAR(40),
    "packageName" VARCHAR(160),
    "eventType" "event_type_kind" NOT NULL,
    "serviceStyle" "service_style_kind" NOT NULL,
    "eventDate" DATE NOT NULL,
    "eventTime" VARCHAR(5),
    "guests" SMALLINT NOT NULL,
    "venueCity" VARCHAR(120) NOT NULL,
    "venueArea" VARCHAR(120) NOT NULL,
    "venueAddress" VARCHAR(300),
    "contactName" VARCHAR(120) NOT NULL,
    "contactPhone" VARCHAR(24) NOT NULL,
    "contactEmail" VARCHAR(191) NOT NULL,
    "contactCompany" VARCHAR(160),
    "notes" VARCHAR(1000),
    "currency" CHAR(3) NOT NULL,
    "pricePerGuest" DECIMAL(14,2) NOT NULL,
    "packageSubtotal" DECIMAL(14,2) NOT NULL,
    "addOnsTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "serviceFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "serviceFeeRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxLabel" VARCHAR(40) NOT NULL DEFAULT 'VAT',
    "taxRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "status" "quote_status_kind" NOT NULL DEFAULT 'requested',
    "requestedAt" TIMESTAMPTZ(3) NOT NULL,
    "quotedTotal" DECIMAL(14,2),
    "quotedAt" TIMESTAMPTZ(3),
    "quotedNote" VARCHAR(1000),
    "confirmedAt" TIMESTAMPTZ(3),
    "declinedAt" TIMESTAMPTZ(3),
    "declineReason" VARCHAR(400),
    "depositIntentId" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catering_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_quote_add_ons" (
    "quoteId" VARCHAR(40) NOT NULL,
    "addOnId" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "unit" "add_on_unit_kind" NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "catering_quote_add_ons_pkey" PRIMARY KEY ("quoteId","addOnId")
);

-- CreateTable
CREATE TABLE "cms_collections" (
    "id" "cms_collection_kind" NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "description" VARCHAR(400) NOT NULL DEFAULT '',
    "icon" VARCHAR(60) NOT NULL,
    "surface" VARCHAR(120) NOT NULL,
    "previewHref" VARCHAR(200),
    "fields" JSONB NOT NULL,
    "creatable" BOOLEAN NOT NULL DEFAULT false,
    "orderable" BOOLEAN NOT NULL DEFAULT false,
    "titleField" VARCHAR(60) NOT NULL,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cms_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_documents" (
    "id" VARCHAR(40) NOT NULL,
    "collection" "cms_collection_kind" NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "values" JSONB NOT NULL,
    "draft" JSONB,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "publishAt" TIMESTAMPTZ(3),
    "unpublishAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "updatedByName" VARCHAR(120) NOT NULL DEFAULT '',
    "updatedById" VARCHAR(40),
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "fields" JSONB,
    "fallbacks" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cms_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_revisions" (
    "id" VARCHAR(40) NOT NULL,
    "documentId" VARCHAR(40) NOT NULL,
    "values" JSONB NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "by" VARCHAR(120) NOT NULL DEFAULT '',
    "byId" VARCHAR(40),
    "reason" "cms_revision_reason" NOT NULL DEFAULT 'publish',

    CONSTRAINT "cms_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_audit_entries" (
    "id" VARCHAR(40) NOT NULL,
    "documentId" VARCHAR(40) NOT NULL,
    "collection" "cms_collection_kind" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "action" "cms_audit_action_kind" NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "by" VARCHAR(120) NOT NULL DEFAULT '',
    "byId" VARCHAR(40),

    CONSTRAINT "cms_audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_contact_messages" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "phone" VARCHAR(24),
    "topic" "contact_topic_kind" NOT NULL DEFAULT 'other',
    "message" TEXT NOT NULL,
    "status" "contact_message_status" NOT NULL DEFAULT 'new',
    "ip" INET,
    "userAgent" VARCHAR(400),
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledBy" VARCHAR(40),
    "handledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "cms_contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "excerpt" VARCHAR(600) NOT NULL DEFAULT '',
    "cover" VARCHAR(500) NOT NULL DEFAULT '',
    "category" VARCHAR(80) NOT NULL,
    "status" "post_status" NOT NULL DEFAULT 'published',
    "author" VARCHAR(120) NOT NULL,
    "authorRole" VARCHAR(160) NOT NULL DEFAULT '',
    "authorAvatar" VARCHAR(500) NOT NULL DEFAULT '',
    "authorId" VARCHAR(40),
    "readMinutes" SMALLINT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "body" JSONB NOT NULL,
    "localized" JSONB,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tags" (
    "postId" VARCHAR(40) NOT NULL,
    "tag" VARCHAR(60) NOT NULL,

    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("postId","tag")
);

-- CreateTable
CREATE TABLE "testimonials" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "role" VARCHAR(120) NOT NULL DEFAULT '',
    "avatar" VARCHAR(500) NOT NULL DEFAULT '',
    "quote" TEXT NOT NULL,
    "rating" SMALLINT NOT NULL,
    "countryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_openings" (
    "id" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "team" VARCHAR(80) NOT NULL,
    "location" VARCHAR(120) NOT NULL,
    "employment" VARCHAR(24) NOT NULL,
    "workMode" VARCHAR(16) NOT NULL DEFAULT 'on-site',
    "description" TEXT NOT NULL,
    "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "job_opening_status" NOT NULL DEFAULT 'open',
    "postedAt" TIMESTAMPTZ(3) NOT NULL,
    "closesAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "job_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "boundary" JSONB,
    "baseFare" DECIMAL(14,2) NOT NULL,
    "perKm" DECIMAL(14,2) NOT NULL,
    "peakMultiplier" DECIMAL(6,4) NOT NULL DEFAULT 1,
    "peakHours" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "batchBonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cashLimit" DECIMAL(14,2) NOT NULL,
    "minWithdrawal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "customerBaseFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "customerPerKm" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_areas" (
    "zoneId" VARCHAR(40) NOT NULL,
    "area" VARCHAR(120) NOT NULL,

    CONSTRAINT "zone_areas_pkey" PRIMARY KEY ("zoneId","area")
);

-- CreateTable
CREATE TABLE "riders" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40),
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(24) NOT NULL,
    "photo" VARCHAR(500),
    "vehicle" "rider_vehicle_kind" NOT NULL,
    "plate" VARCHAR(24),
    "zoneId" VARCHAR(40) NOT NULL,
    "status" "rider_status" NOT NULL DEFAULT 'active',
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "trips" INTEGER NOT NULL DEFAULT 0,
    "acceptanceRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "onTimeRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL,
    "isOnShift" BOOLEAN NOT NULL DEFAULT false,
    "lastLat" DECIMAL(10,7),
    "lastLng" DECIMAL(10,7),
    "lastSeenAt" TIMESTAMPTZ(3),
    "maxBatchSize" SMALLINT NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "riders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_documents" (
    "id" VARCHAR(40) NOT NULL,
    "riderId" VARCHAR(40) NOT NULL,
    "kind" "rider_document_kind" NOT NULL,
    "status" "rider_document_status" NOT NULL DEFAULT 'pending',
    "fileId" VARCHAR(40),
    "number" VARCHAR(60),
    "expiresAt" TIMESTAMPTZ(3),
    "verifiedAt" TIMESTAMPTZ(3),
    "verifiedBy" VARCHAR(40),
    "rejectionReason" VARCHAR(240),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rider_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_shifts" (
    "id" VARCHAR(40) NOT NULL,
    "riderId" VARCHAR(40) NOT NULL,
    "zoneId" VARCHAR(40) NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),
    "trips" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rider_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_jobs" (
    "id" VARCHAR(40) NOT NULL,
    "jobNumber" VARCHAR(24) NOT NULL,
    "riderId" VARCHAR(40),
    "zoneId" VARCHAR(40) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "delivery_job_status_kind" NOT NULL DEFAULT 'offered',
    "distanceKm" DECIMAL(8,2) NOT NULL,
    "estimatedMinutes" SMALLINT NOT NULL,
    "baseFare" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "distanceFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "peakBonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "batchBonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tip" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payoutTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cashToCollect" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "offeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" VARCHAR(240),
    "assignment" "assignment_kind",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "delivery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_job_orders" (
    "jobId" VARCHAR(40) NOT NULL,
    "orderId" VARCHAR(40) NOT NULL,
    "orderNumber" VARCHAR(24) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "vendorName" VARCHAR(160) NOT NULL,
    "customerName" VARCHAR(120) NOT NULL,
    "itemCount" SMALLINT NOT NULL,
    "orderTotal" DECIMAL(14,2) NOT NULL,
    "paymentMethod" "payment_method_kind" NOT NULL,
    "cashDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sort" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "delivery_job_orders_pkey" PRIMARY KEY ("jobId","orderId")
);

-- CreateTable
CREATE TABLE "delivery_stops" (
    "id" VARCHAR(40) NOT NULL,
    "jobId" VARCHAR(40) NOT NULL,
    "kind" "delivery_stop_kind" NOT NULL,
    "orderId" VARCHAR(40) NOT NULL,
    "orderNumber" VARCHAR(24) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "area" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(24) NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "instructions" VARCHAR(400),
    "sequence" SMALLINT NOT NULL,
    "legKm" DECIMAL(8,2) NOT NULL,
    "legMinutes" SMALLINT NOT NULL,
    "otpHash" CHAR(64),
    "cashDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "arrivedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "proofFileId" VARCHAR(40),
    "failureReason" VARCHAR(240),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "delivery_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_offers" (
    "id" VARCHAR(40) NOT NULL,
    "jobId" VARCHAR(40) NOT NULL,
    "riderId" VARCHAR(40) NOT NULL,
    "outcome" "job_offer_outcome" NOT NULL DEFAULT 'pending',
    "score" DECIMAL(8,4),
    "distanceKm" DECIMAL(8,2),
    "offeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "respondedAt" TIMESTAMPTZ(3),
    "declineReason" VARCHAR(120),

    CONSTRAINT "job_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_location_pings" (
    "id" VARCHAR(40) NOT NULL,
    "riderId" VARCHAR(40) NOT NULL,
    "jobId" VARCHAR(40),
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "heading" SMALLINT,
    "speedKph" DECIMAL(6,2),
    "accuracyM" DECIMAL(8,2),
    "batteryPct" SMALLINT,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_location_pings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_ledger_entries" (
    "id" VARCHAR(40) NOT NULL,
    "riderId" VARCHAR(40) NOT NULL,
    "type" "rider_ledger_kind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "reference" VARCHAR(40),
    "jobId" VARCHAR(40),
    "isSettled" BOOLEAN NOT NULL DEFAULT true,
    "affectsCash" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_remittances" (
    "id" VARCHAR(40) NOT NULL,
    "riderId" VARCHAR(40) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "method" "remittance_method_kind" NOT NULL,
    "reference" VARCHAR(60) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "verifiedAt" TIMESTAMPTZ(3),
    "verifiedBy" VARCHAR(40),
    "receiptFileId" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "rider_remittances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_withdrawals" (
    "id" VARCHAR(40) NOT NULL,
    "riderId" VARCHAR(40) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "withdrawal_status" NOT NULL DEFAULT 'processing',
    "reference" VARCHAR(60) NOT NULL,
    "accountId" VARCHAR(40),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "failureReason" VARCHAR(240),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rider_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_tables" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "branchId" VARCHAR(40),
    "label" VARCHAR(16) NOT NULL,
    "seats" SMALLINT NOT NULL,
    "zone" "table_zone_kind" NOT NULL DEFAULT 'indoor',
    "posX" SMALLINT,
    "posY" SMALLINT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "restaurant_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_menu_configs" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "welcomeMessage" VARCHAR(400) NOT NULL DEFAULT '',
    "ordering" BOOLEAN NOT NULL DEFAULT true,
    "waiterCall" BOOLEAN NOT NULL DEFAULT true,
    "billRequest" BOOLEAN NOT NULL DEFAULT true,
    "serviceChargeRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "askGuestName" BOOLEAN NOT NULL DEFAULT false,
    "menuId" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "qr_menu_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dine_in_sessions" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "tableId" VARCHAR(40),
    "guestKey" VARCHAR(60) NOT NULL,
    "guestName" VARCHAR(120),
    "userId" VARCHAR(40),
    "status" "dine_in_session_status" NOT NULL DEFAULT 'open',
    "currency" CHAR(3) NOT NULL,
    "serviceChargeRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "taxLabel" VARCHAR(40) NOT NULL DEFAULT 'VAT',
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "posSaleId" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dine_in_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dine_in_rounds" (
    "id" VARCHAR(40) NOT NULL,
    "sessionId" VARCHAR(40) NOT NULL,
    "roundNumber" SMALLINT NOT NULL,
    "note" VARCHAR(400) NOT NULL DEFAULT '',
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "servedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dine_in_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dine_in_round_items" (
    "id" VARCHAR(120) NOT NULL,
    "roundId" VARCHAR(40) NOT NULL,
    "foodId" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "image" VARCHAR(500) NOT NULL DEFAULT '',
    "basePrice" DECIMAL(14,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "quantity" SMALLINT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "dine_in_round_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" VARCHAR(40) NOT NULL,
    "sessionId" VARCHAR(40) NOT NULL,
    "kind" "service_request_kind" NOT NULL,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedBy" VARCHAR(40),

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_shifts" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "branchId" VARCHAR(40),
    "cashierId" VARCHAR(40),
    "cashierName" VARCHAR(120) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "openingFloat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "closingCount" DECIMAL(14,2),
    "expectedCash" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),
    "note" VARCHAR(400),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pos_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_held_tickets" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "orderType" "pos_order_type_kind" NOT NULL DEFAULT 'takeaway',
    "tableId" VARCHAR(40),
    "discount" JSONB,
    "note" VARCHAR(400),
    "cashierId" VARCHAR(40),
    "heldAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recalledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "pos_held_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_held_ticket_lines" (
    "id" VARCHAR(40) NOT NULL,
    "ticketId" VARCHAR(40) NOT NULL,
    "foodId" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "image" VARCHAR(500) NOT NULL DEFAULT '',
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "quantity" SMALLINT NOT NULL,

    CONSTRAINT "pos_held_ticket_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sales" (
    "id" VARCHAR(40) NOT NULL,
    "saleNumber" VARCHAR(24) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "branchId" VARCHAR(40),
    "shiftId" VARCHAR(40),
    "orderType" "pos_order_type_kind" NOT NULL,
    "tableLabel" VARCHAR(16),
    "currency" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxLabel" VARCHAR(40) NOT NULL DEFAULT 'VAT',
    "taxRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "method" "payment_method_kind" NOT NULL,
    "tendered" DECIMAL(14,2),
    "change" DECIMAL(14,2),
    "cardLast4" CHAR(4),
    "cashierId" VARCHAR(40),
    "cashierName" VARCHAR(120) NOT NULL,
    "soldAt" TIMESTAMPTZ(3) NOT NULL,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" VARCHAR(240),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pos_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sale_items" (
    "id" VARCHAR(40) NOT NULL,
    "saleId" VARCHAR(40) NOT NULL,
    "foodId" VARCHAR(40),
    "name" VARCHAR(160) NOT NULL,
    "image" VARCHAR(500) NOT NULL DEFAULT '',
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "quantity" SMALLINT NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "pos_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" VARCHAR(24),
    "avatar" VARCHAR(500) NOT NULL DEFAULT '',
    "primaryRole" "user_role_slug" NOT NULL DEFAULT 'customer',
    "status" "user_status" NOT NULL DEFAULT 'active',
    "countryCode" CHAR(2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "locale" VARCHAR(8) NOT NULL DEFAULT 'en',
    "timezone" VARCHAR(64),
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "phoneVerifiedAt" TIMESTAMPTZ(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMPTZ(3),
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "deletedBy" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "userId" VARCHAR(40) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "algorithm" VARCHAR(24) NOT NULL DEFAULT 'argon2id',
    "tokenEpoch" INTEGER NOT NULL DEFAULT 0,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedCount" SMALLINT NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(240) NOT NULL DEFAULT '',
    "builtin" "user_role_slug",
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "rank" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "resource" VARCHAR(40) NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "description" VARCHAR(240) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" VARCHAR(40) NOT NULL,
    "permissionId" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40) NOT NULL,
    "roleId" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40),
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" VARCHAR(40),
    "expiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40) NOT NULL,
    "permissionId" VARCHAR(40) NOT NULL,
    "effect" BOOLEAN NOT NULL DEFAULT true,
    "vendorId" VARCHAR(40),
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" VARCHAR(40),
    "expiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_identities" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40) NOT NULL,
    "provider" "social_provider_kind" NOT NULL,
    "providerUid" VARCHAR(191) NOT NULL,
    "email" CITEXT,
    "displayName" VARCHAR(120),
    "avatar" VARCHAR(500),
    "profile" JSONB,
    "linkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "social_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40) NOT NULL,
    "deviceId" VARCHAR(40),
    "rememberMe" BOOLEAN NOT NULL DEFAULT false,
    "ip" INET,
    "userAgent" VARCHAR(400),
    "location" VARCHAR(120),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" "session_revoke_reason",

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" VARCHAR(40) NOT NULL,
    "sessionId" VARCHAR(40) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "parentId" VARCHAR(40),
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "ip" INET,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40) NOT NULL,
    "installId" VARCHAR(120) NOT NULL,
    "platform" "device_platform" NOT NULL DEFAULT 'web',
    "name" VARCHAR(120),
    "model" VARCHAR(120),
    "appVersion" VARCHAR(24),
    "pushToken" VARCHAR(400),
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "locale" VARCHAR(8),
    "timezone" VARCHAR(64),
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trustedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40),
    "purpose" "otp_purpose" NOT NULL,
    "channel" "otp_channel" NOT NULL DEFAULT 'sms',
    "destination" VARCHAR(191) NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "maxAttempts" SMALLINT NOT NULL DEFAULT 5,
    "consumedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "ip" INET,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "ip" INET,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" VARCHAR(40) NOT NULL,
    "identifier" VARCHAR(191) NOT NULL,
    "userId" VARCHAR(40),
    "method" VARCHAR(24) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" VARCHAR(60),
    "ip" INET,
    "userAgent" VARCHAR(400),
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "userId" VARCHAR(40) NOT NULL,
    "personalizedRecommendations" BOOLEAN NOT NULL DEFAULT true,
    "shareOrderActivity" BOOLEAN NOT NULL DEFAULT true,
    "saveSearchHistory" BOOLEAN NOT NULL DEFAULT true,
    "loginAlerts" BOOLEAN NOT NULL DEFAULT true,
    "twoFactor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "userId" VARCHAR(40) NOT NULL,
    "topic" "notification_topic_key" NOT NULL,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "push" BOOLEAN NOT NULL DEFAULT true,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId","topic")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40) NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "recipient" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(24) NOT NULL,
    "line1" VARCHAR(240) NOT NULL,
    "line2" VARCHAR(240),
    "area" VARCHAR(120) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "instructions" VARCHAR(400),
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "userId" VARCHAR(40) NOT NULL,
    "kind" "favorite_kind" NOT NULL,
    "targetId" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("userId","kind","targetId")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" VARCHAR(40) NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "audience" "notify_audience_kind" NOT NULL,
    "category" "notify_category_kind" NOT NULL,
    "tone" "notify_tone_kind" NOT NULL DEFAULT 'info',
    "channels" "notify_channel_kind"[] DEFAULT ARRAY[]::"notify_channel_kind"[],
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "topic" "notification_topic_key",
    "providerRefs" JSONB NOT NULL DEFAULT '{}',
    "hrefPattern" VARCHAR(200),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40),
    "audience" "notify_audience_kind" NOT NULL,
    "category" "notify_category_kind" NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "templateId" VARCHAR(40),
    "params" JSONB NOT NULL DEFAULT '{}',
    "text" JSONB,
    "tone" "notify_tone_kind" NOT NULL DEFAULT 'info',
    "subjectKind" "notify_subject_kind",
    "subjectId" VARCHAR(40),
    "subjectLabel" VARCHAR(200),
    "orderStatus" "order_status_kind",
    "orderId" VARCHAR(40),
    "vendorId" VARCHAR(40),
    "riderId" VARCHAR(40),
    "campaignId" VARCHAR(40),
    "href" VARCHAR(300) NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channels" (
    "notificationId" VARCHAR(40) NOT NULL,
    "channel" "notify_channel_kind" NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("notificationId","channel")
);

-- CreateTable
CREATE TABLE "notification_dispatches" (
    "id" VARCHAR(40) NOT NULL,
    "notificationId" VARCHAR(40) NOT NULL,
    "channel" "delivery_channel_kind" NOT NULL,
    "to" VARCHAR(191) NOT NULL,
    "destinationRef" VARCHAR(400),
    "audience" "notify_audience_kind" NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "text" JSONB,
    "status" "dispatch_status_kind" NOT NULL DEFAULT 'queued',
    "reason" VARCHAR(80),
    "providerId" VARCHAR(60),
    "providerRef" VARCHAR(191),
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),

    CONSTRAINT "notification_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_segments" (
    "id" "segment_kind" NOT NULL,
    "audience" "notify_audience_kind" NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "rule" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_campaigns" (
    "id" VARCHAR(40) NOT NULL,
    "segmentId" "segment_kind" NOT NULL,
    "kind" "broadcast_kind" NOT NULL,
    "status" "campaign_status" NOT NULL DEFAULT 'draft',
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "href" VARCHAR(300) NOT NULL DEFAULT '',
    "channels" "delivery_channel_kind"[] DEFAULT ARRAY[]::"delivery_channel_kind"[],
    "audienceSize" INTEGER NOT NULL DEFAULT 0,
    "results" JSONB NOT NULL DEFAULT '[]',
    "scheduledFor" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "createdById" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "notification_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40),
    "guestKey" VARCHAR(60),
    "vendorId" VARCHAR(40) NOT NULL,
    "branchId" VARCHAR(40),
    "currency" CHAR(3) NOT NULL,
    "fulfillment" "fulfillment_kind" NOT NULL DEFAULT 'delivery',
    "addressId" VARCHAR(40),
    "scheduledFor" TIMESTAMPTZ(3),
    "notes" VARCHAR(500),
    "tip" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "couponId" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" VARCHAR(120) NOT NULL,
    "cartId" VARCHAR(40) NOT NULL,
    "foodId" VARCHAR(40) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "image" VARCHAR(500) NOT NULL DEFAULT '',
    "basePrice" DECIMAL(14,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "quantity" SMALLINT NOT NULL,
    "note" VARCHAR(240),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item_options" (
    "cartItemId" VARCHAR(120) NOT NULL,
    "groupId" VARCHAR(40) NOT NULL,
    "optionId" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "priceDelta" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "cart_item_options_pkey" PRIMARY KEY ("cartItemId","optionId")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" VARCHAR(40) NOT NULL,
    "orderNumber" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(40),
    "vendorId" VARCHAR(40) NOT NULL,
    "branchId" VARCHAR(40),
    "channel" "order_channel" NOT NULL DEFAULT 'web',
    "vendorSnapshot" JSONB NOT NULL,
    "addressSnapshot" JSONB,
    "addressId" VARCHAR(40),
    "deliveryLat" DECIMAL(10,7),
    "deliveryLng" DECIMAL(10,7),
    "deliveryArea" VARCHAR(120),
    "deliveryCity" VARCHAR(120),
    "fulfillment" "fulfillment_kind" NOT NULL,
    "scheduledFor" TIMESTAMPTZ(3),
    "contactName" VARCHAR(120) NOT NULL,
    "contactPhone" VARCHAR(24) NOT NULL,
    "notes" VARCHAR(500),
    "paymentMethod" "payment_method_kind" NOT NULL,
    "paymentStatus" "payment_status_kind" NOT NULL DEFAULT 'pending',
    "cardLast4" CHAR(4),
    "currency" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "deliveryFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "couponCode" VARCHAR(40),
    "couponId" VARCHAR(40),
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxLabel" VARCHAR(40) NOT NULL DEFAULT 'VAT',
    "taxRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "tip" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "serviceCharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "packagingFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "commission" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "order_status_kind" NOT NULL DEFAULT 'placed',
    "placedAt" TIMESTAMPTZ(3) NOT NULL,
    "estimatedDeliveryAt" TIMESTAMPTZ(3) NOT NULL,
    "prepMinutes" SMALLINT,
    "promisedReadyAt" TIMESTAMPTZ(3),
    "delayMinutes" SMALLINT NOT NULL DEFAULT 0,
    "rejectionReason" "order_cancel_reason_kind",
    "cancelReason" "order_cancel_reason_kind",
    "cancelledBy" "order_actor_kind",
    "failureReason" "order_cancel_reason_kind",
    "riderSnapshot" JSONB,
    "riderId" VARCHAR(40),
    "assignment" "assignment_kind",
    "assignedAt" TIMESTAMPTZ(3),
    "otpHash" CHAR(64) NOT NULL,
    "otpAttempts" SMALLINT NOT NULL DEFAULT 0,
    "otpVerifiedAt" TIMESTAMPTZ(3),
    "refundStatus" "refund_status_kind" NOT NULL DEFAULT 'none',
    "refundAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rating" SMALLINT,
    "itemCount" SMALLINT NOT NULL DEFAULT 0,
    "acceptedAt" TIMESTAMPTZ(3),
    "readyAt" TIMESTAMPTZ(3),
    "pickedUpAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" VARCHAR(40) NOT NULL,
    "orderId" VARCHAR(40) NOT NULL,
    "foodId" VARCHAR(40),
    "lineKey" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "image" VARCHAR(500) NOT NULL DEFAULT '',
    "basePrice" DECIMAL(14,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "quantity" SMALLINT NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "note" VARCHAR(240),
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_options" (
    "id" VARCHAR(40) NOT NULL,
    "orderItemId" VARCHAR(40) NOT NULL,
    "groupId" VARCHAR(40) NOT NULL,
    "optionId" VARCHAR(40),
    "name" VARCHAR(120) NOT NULL,
    "priceDelta" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "order_item_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" VARCHAR(40) NOT NULL,
    "orderId" VARCHAR(40) NOT NULL,
    "status" "order_status_kind" NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" "order_actor_kind" NOT NULL,
    "actorId" VARCHAR(40),
    "note" VARCHAR(500),
    "meta" JSONB,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_rider_declines" (
    "orderId" VARCHAR(40) NOT NULL,
    "riderId" VARCHAR(40) NOT NULL,
    "declinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(120),

    CONSTRAINT "order_rider_declines_pkey" PRIMARY KEY ("orderId","riderId")
);

-- CreateTable
CREATE TABLE "refund_requests" (
    "id" VARCHAR(40) NOT NULL,
    "orderId" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40),
    "status" "refund_request_status" NOT NULL DEFAULT 'requested',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" "order_cancel_reason_kind" NOT NULL,
    "comment" VARCHAR(1000),
    "evidence" JSONB,
    "decidedById" VARCHAR(40),
    "decidedAt" TIMESTAMPTZ(3),
    "decisionNote" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" VARCHAR(40) NOT NULL,
    "orderId" VARCHAR(40) NOT NULL,
    "invoiceNumber" VARCHAR(32) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "sellerDetails" JSONB NOT NULL,
    "buyerDetails" JSONB NOT NULL,
    "pdfFileId" VARCHAR(40),
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "scope" VARCHAR(60) NOT NULL,
    "current" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("scope")
);

-- CreateTable
CREATE TABLE "payment_providers" (
    "id" VARCHAR(40) NOT NULL,
    "kind" "payment_provider_kind" NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,
    "countryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capabilities" "payment_capability"[] DEFAULT ARRAY[]::"payment_capability"[],
    "credentialRefs" JSONB NOT NULL DEFAULT '{}',
    "priority" SMALLINT NOT NULL DEFAULT 100,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isTestMode" BOOLEAN NOT NULL DEFAULT true,
    "feeRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "feeFixed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" VARCHAR(40) NOT NULL,
    "orderId" VARCHAR(40),
    "subscriptionCycleId" VARCHAR(40),
    "userId" VARCHAR(40),
    "providerId" VARCHAR(40) NOT NULL,
    "method" "payment_method_kind" NOT NULL,
    "status" "payment_intent_status" NOT NULL DEFAULT 'created',
    "currency" CHAR(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "capturedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "providerFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "providerRef" VARCHAR(191),
    "clientRef" VARCHAR(60) NOT NULL,
    "redirectUrl" VARCHAR(800),
    "instrument" JSONB,
    "failureCode" VARCHAR(60),
    "failureKey" VARCHAR(80),
    "attempt" SMALLINT NOT NULL DEFAULT 1,
    "authorizedAt" TIMESTAMPTZ(3),
    "capturedAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" VARCHAR(40) NOT NULL,
    "intentId" VARCHAR(40) NOT NULL,
    "providerId" VARCHAR(40) NOT NULL,
    "kind" "payment_txn_kind" NOT NULL,
    "providerStatus" VARCHAR(60),
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorCode" VARCHAR(60),
    "errorMessage" VARCHAR(500),
    "rawPayload" JSONB,
    "latencyMs" INTEGER,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" VARCHAR(40) NOT NULL,
    "intentId" VARCHAR(40) NOT NULL,
    "orderId" VARCHAR(40),
    "requestId" VARCHAR(40),
    "providerId" VARCHAR(40) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "isPartial" BOOLEAN NOT NULL DEFAULT false,
    "reason" "refund_reason_kind" NOT NULL,
    "status" "refund_execution_status" NOT NULL DEFAULT 'pending',
    "toWallet" BOOLEAN NOT NULL DEFAULT false,
    "providerRef" VARCHAR(191),
    "failureCode" VARCHAR(60),
    "requestedById" VARCHAR(40),
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" VARCHAR(40) NOT NULL,
    "providerId" VARCHAR(40) NOT NULL,
    "eventId" VARCHAR(191),
    "eventType" VARCHAR(120),
    "status" "webhook_status" NOT NULL DEFAULT 'received',
    "signature" VARCHAR(500),
    "signatureValid" BOOLEAN,
    "headers" JSONB,
    "payload" JSONB NOT NULL,
    "intentId" VARCHAR(40),
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_payment_methods" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40) NOT NULL,
    "providerId" VARCHAR(40) NOT NULL,
    "method" "payment_method_kind" NOT NULL,
    "token" VARCHAR(191) NOT NULL,
    "brand" VARCHAR(40),
    "last4" CHAR(4),
    "expMonth" SMALLINT,
    "expYear" SMALLINT,
    "maskedPhone" VARCHAR(24),
    "holderName" VARCHAR(120),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "saved_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pending" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" VARCHAR(40) NOT NULL,
    "walletId" VARCHAR(40) NOT NULL,
    "type" "wallet_txn_kind" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "orderId" VARCHAR(40),
    "orderNumber" VARCHAR(24),
    "intentId" VARCHAR(40),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" VARCHAR(40) NOT NULL,
    "kind" "ledger_account_kind" NOT NULL,
    "ownerId" VARCHAR(40),
    "currency" CHAR(3) NOT NULL,
    "balance" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" VARCHAR(40) NOT NULL,
    "accountId" VARCHAR(40) NOT NULL,
    "transactionRef" VARCHAR(40) NOT NULL,
    "eventName" VARCHAR(60) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "orderId" VARCHAR(40),
    "payoutId" VARCHAR(40),
    "description" VARCHAR(240) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_accounts" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40),
    "riderId" VARCHAR(40),
    "kind" "payout_account_kind" NOT NULL,
    "holderName" VARCHAR(160) NOT NULL,
    "maskedNumber" VARCHAR(40) NOT NULL,
    "secretRef" VARCHAR(120),
    "bankName" VARCHAR(160),
    "branchName" VARCHAR(160),
    "routingCode" VARCHAR(40),
    "currency" CHAR(3) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" VARCHAR(40) NOT NULL,
    "reference" VARCHAR(32) NOT NULL,
    "vendorId" VARCHAR(40),
    "riderId" VARCHAR(40),
    "accountId" VARCHAR(40),
    "providerId" VARCHAR(40),
    "status" "payout_status" NOT NULL DEFAULT 'scheduled',
    "currency" CHAR(3) NOT NULL,
    "grossAmount" DECIMAL(16,2) NOT NULL,
    "commission" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "cashOffset" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(16,2) NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "providerRef" VARCHAR(191),
    "failureCode" VARCHAR(60),
    "statementFileId" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40),
    "vendorType" "vendor_type_kind",
    "countryCode" CHAR(2),
    "fulfillment" "fulfillment_kind",
    "rate" DECIMAL(6,4) NOT NULL,
    "fixedFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "effectiveTo" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_plans" (
    "id" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(400) NOT NULL DEFAULT '',
    "interval" "membership_interval" NOT NULL DEFAULT 'monthly',
    "price" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "commissionRate" DECIMAL(6,4),
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxBranches" SMALLINT,
    "maxStaff" SMALLINT,
    "trialDays" SMALLINT NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_memberships" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "planId" VARCHAR(40) NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'trialing',
    "currency" CHAR(3) NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "trialEndsAt" TIMESTAMPTZ(3),
    "currentPeriodStart" TIMESTAMPTZ(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMPTZ(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "vendor_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "code" CHAR(3) NOT NULL,
    "symbol" VARCHAR(8) NOT NULL,
    "formatLocale" VARCHAR(16) NOT NULL,
    "fractionDigits" SMALLINT NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" VARCHAR(40) NOT NULL,
    "baseCode" CHAR(3) NOT NULL,
    "quoteCode" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "effectiveOn" DATE NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "code" CHAR(2) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "dialCode" VARCHAR(8) NOT NULL,
    "defaultLocale" VARCHAR(8) NOT NULL DEFAULT 'en',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "languages" (
    "code" VARCHAR(8) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "nativeName" VARCHAR(60) NOT NULL,
    "direction" "text_direction" NOT NULL DEFAULT 'ltr',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "languages_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "country_languages" (
    "countryCode" CHAR(2) NOT NULL,
    "languageCode" VARCHAR(8) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sort" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "country_languages_pkey" PRIMARY KEY ("countryCode","languageCode")
);

-- CreateTable
CREATE TABLE "tax_rules" (
    "id" VARCHAR(40) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "region" VARCHAR(80),
    "city" VARCHAR(80),
    "vendorId" VARCHAR(40),
    "kind" "tax_kind" NOT NULL DEFAULT 'vat',
    "appliesTo" "tax_applies_to" NOT NULL DEFAULT 'order-subtotal',
    "label" VARCHAR(40) NOT NULL,
    "rate" DECIMAL(6,4) NOT NULL,
    "isInclusive" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "effectiveTo" TIMESTAMPTZ(3),
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdBy" VARCHAR(40),
    "updatedBy" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" VARCHAR(40) NOT NULL,
    "scope" "setting_scope" NOT NULL DEFAULT 'platform',
    "scopeId" VARCHAR(40),
    "key" VARCHAR(120) NOT NULL,
    "valueType" "setting_value_type" NOT NULL DEFAULT 'string',
    "value" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "description" VARCHAR(240),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "updatedBy" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" VARCHAR(40) NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "description" VARCHAR(240) NOT NULL,
    "strategy" "feature_flag_strategy" NOT NULL DEFAULT 'boolean',
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPct" SMALLINT NOT NULL DEFAULT 0,
    "targets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "updatedBy" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translations" (
    "id" VARCHAR(40) NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "entityId" VARCHAR(40) NOT NULL,
    "field" VARCHAR(60) NOT NULL,
    "languageCode" VARCHAR(8) NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" VARCHAR(40) NOT NULL,
    "bucket" VARCHAR(64) NOT NULL,
    "key" VARCHAR(400) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" VARCHAR(72),
    "visibility" "file_visibility" NOT NULL DEFAULT 'public',
    "variants" JSONB NOT NULL DEFAULT '{}',
    "ownerEntity" VARCHAR(60),
    "ownerId" VARCHAR(40),
    "uploadedById" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" VARCHAR(40) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "entityId" VARCHAR(40),
    "entityLabel" VARCHAR(200),
    "actorId" VARCHAR(40),
    "actorRole" VARCHAR(40),
    "actorLabel" VARCHAR(120),
    "changes" JSONB,
    "ip" INET,
    "userAgent" VARCHAR(400),
    "requestId" VARCHAR(40),
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" VARCHAR(40) NOT NULL,
    "eventName" VARCHAR(80) NOT NULL,
    "aggregate" VARCHAR(60) NOT NULL,
    "aggregateId" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "outbox_status" NOT NULL DEFAULT 'pending',
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" VARCHAR(120) NOT NULL,
    "scope" VARCHAR(60) NOT NULL,
    "userId" VARCHAR(40),
    "requestHash" VARCHAR(72) NOT NULL,
    "response" JSONB,
    "statusCode" SMALLINT,
    "lockedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(400) NOT NULL DEFAULT '',
    "kind" "discount_kind" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "maxDiscount" DECIMAL(14,2),
    "minOrder" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "scope" "promo_scope" NOT NULL DEFAULT 'platform',
    "code" VARCHAR(40),
    "placement" "offer_placement_kind" NOT NULL DEFAULT 'standard',
    "image" VARCHAR(500) NOT NULL DEFAULT '',
    "badge" VARCHAR(40) NOT NULL DEFAULT '',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "claimed" INTEGER NOT NULL DEFAULT 0,
    "claimLimit" INTEGER,
    "terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "countryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdBy" VARCHAR(40),
    "updatedBy" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_vendors" (
    "offerId" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,

    CONSTRAINT "offer_vendors_pkey" PRIMARY KEY ("offerId","vendorId")
);

-- CreateTable
CREATE TABLE "offer_categories" (
    "offerId" VARCHAR(40) NOT NULL,
    "categoryId" VARCHAR(40) NOT NULL,

    CONSTRAINT "offer_categories_pkey" PRIMARY KEY ("offerId","categoryId")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" VARCHAR(40) NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(400) NOT NULL DEFAULT '',
    "kind" "discount_kind" NOT NULL,
    "value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "maxDiscount" DECIMAL(14,2),
    "minOrder" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "scope" "promo_scope" NOT NULL DEFAULT 'platform',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "usageLimit" SMALLINT NOT NULL DEFAULT 1,
    "totalLimit" INTEGER,
    "totalRedeemed" INTEGER NOT NULL DEFAULT 0,
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "source" "coupon_source_kind" NOT NULL DEFAULT 'campaign',
    "claimable" BOOLEAN NOT NULL DEFAULT true,
    "terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "offerId" VARCHAR(40),
    "issuerVendorId" VARCHAR(40),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdBy" VARCHAR(40),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_vendors" (
    "couponId" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,

    CONSTRAINT "coupon_vendors_pkey" PRIMARY KEY ("couponId","vendorId")
);

-- CreateTable
CREATE TABLE "coupon_categories" (
    "couponId" VARCHAR(40) NOT NULL,
    "categoryId" VARCHAR(40) NOT NULL,

    CONSTRAINT "coupon_categories_pkey" PRIMARY KEY ("couponId","categoryId")
);

-- CreateTable
CREATE TABLE "coupon_claims" (
    "userId" VARCHAR(40) NOT NULL,
    "couponId" VARCHAR(40) NOT NULL,
    "claimedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "via" "coupon_claim_via" NOT NULL DEFAULT 'code',
    "grantedBy" VARCHAR(40),

    CONSTRAINT "coupon_claims_pkey" PRIMARY KEY ("userId","couponId")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" VARCHAR(40) NOT NULL,
    "couponId" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40) NOT NULL,
    "orderId" VARCHAR(40) NOT NULL,
    "orderNumber" VARCHAR(24) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deliveryWaived" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cashback" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "redeemedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_policies" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "branchId" VARCHAR(40),
    "turnMinutes" SMALLINT NOT NULL,
    "largePartyTurnMinutes" SMALLINT NOT NULL,
    "largePartyFrom" SMALLINT NOT NULL,
    "slotMinutes" SMALLINT NOT NULL,
    "minPartySize" SMALLINT NOT NULL,
    "maxPartySize" SMALLINT NOT NULL,
    "lastSeatingBeforeClose" SMALLINT NOT NULL,
    "leadTimeMinutes" SMALLINT NOT NULL,
    "advanceDays" SMALLINT NOT NULL,
    "depositPerGuest" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "depositFrom" SMALLINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "cancelCutoffHours" SMALLINT NOT NULL,
    "autoConfirm" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "booking_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_policy_zones" (
    "policyId" VARCHAR(40) NOT NULL,
    "zone" "table_zone_kind" NOT NULL,

    CONSTRAINT "booking_policy_zones_pkey" PRIMARY KEY ("policyId","zone")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" VARCHAR(40) NOT NULL,
    "reference" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(40),
    "vendorId" VARCHAR(40) NOT NULL,
    "branchId" VARCHAR(40),
    "venueSnapshot" JSONB NOT NULL,
    "date" DATE NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMinutes" SMALLINT NOT NULL,
    "partySize" SMALLINT NOT NULL,
    "tableLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "zone" "table_zone_kind" NOT NULL DEFAULT 'indoor',
    "occasion" "occasion_kind" NOT NULL DEFAULT 'none',
    "guestName" VARCHAR(120) NOT NULL,
    "guestPhone" VARCHAR(24) NOT NULL,
    "guestEmail" VARCHAR(191) NOT NULL,
    "notes" VARCHAR(500),
    "status" "reservation_status_kind" NOT NULL DEFAULT 'confirmed',
    "depositAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "depositIntentId" VARCHAR(40),
    "confirmedAt" TIMESTAMPTZ(3),
    "seatedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledBy" "order_actor_kind",
    "cancelReason" VARCHAR(240),
    "noShowAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_tables" (
    "reservationId" VARCHAR(40) NOT NULL,
    "tableId" VARCHAR(40) NOT NULL,

    CONSTRAINT "reservation_tables_pkey" PRIMARY KEY ("reservationId","tableId")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" VARCHAR(40) NOT NULL,
    "subject" "review_subject_kind" NOT NULL,
    "subjectId" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "riderId" VARCHAR(40),
    "orderId" VARCHAR(40),
    "orderNumber" VARCHAR(24),
    "authorId" VARCHAR(40) NOT NULL,
    "authorName" VARCHAR(120) NOT NULL,
    "authorAvatar" VARCHAR(500),
    "rating" SMALLINT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "status" "review_moderation_status" NOT NULL DEFAULT 'published',
    "languageCode" VARCHAR(8),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_aspect_scores" (
    "reviewId" VARCHAR(40) NOT NULL,
    "aspect" "review_aspect_kind" NOT NULL,
    "score" SMALLINT NOT NULL,

    CONSTRAINT "review_aspect_scores_pkey" PRIMARY KEY ("reviewId","aspect")
);

-- CreateTable
CREATE TABLE "review_tags" (
    "reviewId" VARCHAR(40) NOT NULL,
    "tag" "review_tag_kind" NOT NULL,

    CONSTRAINT "review_tags_pkey" PRIMARY KEY ("reviewId","tag")
);

-- CreateTable
CREATE TABLE "review_dishes" (
    "reviewId" VARCHAR(40) NOT NULL,
    "foodId" VARCHAR(40) NOT NULL,

    CONSTRAINT "review_dishes_pkey" PRIMARY KEY ("reviewId","foodId")
);

-- CreateTable
CREATE TABLE "review_media" (
    "id" VARCHAR(40) NOT NULL,
    "reviewId" VARCHAR(40) NOT NULL,
    "kind" "review_media_kind" NOT NULL DEFAULT 'photo',
    "url" VARCHAR(600) NOT NULL,
    "thumbnail" VARCHAR(600) NOT NULL,
    "fileId" VARCHAR(40),
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_replies" (
    "reviewId" VARCHAR(40) NOT NULL,
    "body" TEXT NOT NULL,
    "authorName" VARCHAR(160) NOT NULL,
    "authorId" VARCHAR(40),
    "repliedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "review_replies_pkey" PRIMARY KEY ("reviewId")
);

-- CreateTable
CREATE TABLE "review_votes" (
    "reviewId" VARCHAR(40) NOT NULL,
    "userId" VARCHAR(40) NOT NULL,
    "votedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_votes_pkey" PRIMARY KEY ("reviewId","userId")
);

-- CreateTable
CREATE TABLE "review_reports" (
    "id" VARCHAR(40) NOT NULL,
    "reviewId" VARCHAR(40) NOT NULL,
    "reporterId" VARCHAR(40) NOT NULL,
    "reason" "report_reason_kind" NOT NULL,
    "comment" VARCHAR(500),
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedBy" VARCHAR(40),
    "outcome" VARCHAR(60),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_aggregates" (
    "id" VARCHAR(40) NOT NULL,
    "subject" "aggregate_subject" NOT NULL,
    "subjectId" VARCHAR(40) NOT NULL,
    "month" CHAR(7),
    "count" INTEGER NOT NULL DEFAULT 0,
    "starSum" INTEGER NOT NULL DEFAULT 0,
    "star1" INTEGER NOT NULL DEFAULT 0,
    "star2" INTEGER NOT NULL DEFAULT 0,
    "star3" INTEGER NOT NULL DEFAULT 0,
    "star4" INTEGER NOT NULL DEFAULT 0,
    "star5" INTEGER NOT NULL DEFAULT 0,
    "withMedia" INTEGER NOT NULL DEFAULT 0,
    "verified" INTEGER NOT NULL DEFAULT 0,
    "vendorId" VARCHAR(40),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rating_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" VARCHAR(40) NOT NULL,
    "vendorId" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "tagline" VARCHAR(240) NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "image" VARCHAR(500) NOT NULL DEFAULT '',
    "cover" VARCHAR(500) NOT NULL DEFAULT '',
    "goal" "plan_goal_kind" NOT NULL DEFAULT 'balanced',
    "caloriesPerDay" INTEGER NOT NULL,
    "proteinPerDay" DECIMAL(8,2) NOT NULL,
    "carbsPerDay" DECIMAL(8,2) NOT NULL,
    "fatPerDay" DECIMAL(8,2) NOT NULL,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "deliveryFeePerDay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "leadTimeDays" SMALLINT NOT NULL DEFAULT 1,
    "skipCutoffHours" SMALLINT NOT NULL DEFAULT 24,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plan_dietary" (
    "planId" VARCHAR(40) NOT NULL,
    "tag" "dietary_tag_kind" NOT NULL,

    CONSTRAINT "meal_plan_dietary_pkey" PRIMARY KEY ("planId","tag")
);

-- CreateTable
CREATE TABLE "meal_plan_days" (
    "planId" VARCHAR(40) NOT NULL,
    "day" "weekday_kind" NOT NULL,

    CONSTRAINT "meal_plan_days_pkey" PRIMARY KEY ("planId","day")
);

-- CreateTable
CREATE TABLE "meal_plan_slots" (
    "planId" VARCHAR(40) NOT NULL,
    "slot" "meal_slot_kind" NOT NULL,

    CONSTRAINT "meal_plan_slots_pkey" PRIMARY KEY ("planId","slot")
);

-- CreateTable
CREATE TABLE "plan_tiers" (
    "id" VARCHAR(40) NOT NULL,
    "planId" VARCHAR(40) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "cycle" "billing_cycle_kind" NOT NULL DEFAULT 'weekly',
    "mealsPerDay" SMALLINT NOT NULL,
    "pricePerMeal" DECIMAL(14,2) NOT NULL,
    "discountRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_meals" (
    "id" VARCHAR(40) NOT NULL,
    "planId" VARCHAR(40) NOT NULL,
    "day" "weekday_kind" NOT NULL,
    "slot" "meal_slot_kind" NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(600) NOT NULL DEFAULT '',
    "calories" INTEGER NOT NULL,
    "protein" DECIMAL(8,2) NOT NULL,
    "carbs" DECIMAL(8,2) NOT NULL,
    "fat" DECIMAL(8,2) NOT NULL,
    "image" VARCHAR(500),
    "weekIndex" SMALLINT NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plan_meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_meal_dietary" (
    "mealId" VARCHAR(40) NOT NULL,
    "tag" "dietary_tag_kind" NOT NULL,

    CONSTRAINT "plan_meal_dietary_pkey" PRIMARY KEY ("mealId","tag")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" VARCHAR(40) NOT NULL,
    "reference" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(40),
    "planId" VARCHAR(40) NOT NULL,
    "tierId" VARCHAR(40) NOT NULL,
    "planSnapshot" JSONB NOT NULL,
    "tierName" VARCHAR(120) NOT NULL,
    "cycle" "billing_cycle_kind" NOT NULL,
    "mealsPerDay" SMALLINT NOT NULL,
    "startDate" DATE NOT NULL,
    "deliveryWindow" VARCHAR(24) NOT NULL,
    "addressId" VARCHAR(40),
    "addressSnapshot" JSONB NOT NULL,
    "notes" VARCHAR(500),
    "currency" CHAR(3) NOT NULL,
    "pricePerMeal" DECIMAL(14,2) NOT NULL,
    "deliveryDaysPerWeek" SMALLINT NOT NULL,
    "weeks" SMALLINT NOT NULL,
    "mealCount" SMALLINT NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "deliveryFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxLabel" VARCHAR(40) NOT NULL DEFAULT 'VAT',
    "taxRate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "status" "subscription_status_kind" NOT NULL DEFAULT 'active',
    "pausedUntil" DATE,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" VARCHAR(240),
    "renewsOn" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_slots" (
    "subscriptionId" VARCHAR(40) NOT NULL,
    "slot" "meal_slot_kind" NOT NULL,

    CONSTRAINT "subscription_slots_pkey" PRIMARY KEY ("subscriptionId","slot")
);

-- CreateTable
CREATE TABLE "subscription_days" (
    "subscriptionId" VARCHAR(40) NOT NULL,
    "day" "weekday_kind" NOT NULL,

    CONSTRAINT "subscription_days_pkey" PRIMARY KEY ("subscriptionId","day")
);

-- CreateTable
CREATE TABLE "subscription_skips" (
    "subscriptionId" VARCHAR(40) NOT NULL,
    "date" DATE NOT NULL,
    "skippedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" VARCHAR(240),

    CONSTRAINT "subscription_skips_pkey" PRIMARY KEY ("subscriptionId","date")
);

-- CreateTable
CREATE TABLE "subscription_cycles" (
    "id" VARCHAR(40) NOT NULL,
    "subscriptionId" VARCHAR(40) NOT NULL,
    "cycleNumber" SMALLINT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "cycle_status" NOT NULL DEFAULT 'scheduled',
    "currency" CHAR(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mealCount" SMALLINT NOT NULL,
    "chargedAt" TIMESTAMPTZ(3),
    "failureReason" VARCHAR(240),
    "retryCount" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subscription_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_userId_lastMessageAt_idx" ON "ai_conversations"("userId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "ai_conversations_guestKey_idx" ON "ai_conversations"("guestKey");

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_at_idx" ON "ai_messages"("conversationId", "at");

-- CreateIndex
CREATE INDEX "ai_usage_logs_userId_at_idx" ON "ai_usage_logs"("userId", "at" DESC);

-- CreateIndex
CREATE INDEX "ai_usage_logs_surface_at_idx" ON "ai_usage_logs"("surface", "at" DESC);

-- CreateIndex
CREATE INDEX "ai_recognitions_userId_at_idx" ON "ai_recognitions"("userId", "at" DESC);

-- CreateIndex
CREATE INDEX "search_query_logs_term_at_idx" ON "search_query_logs"("term", "at" DESC);

-- CreateIndex
CREATE INDEX "search_query_logs_userId_at_idx" ON "search_query_logs"("userId", "at" DESC);

-- CreateIndex
CREATE INDEX "search_query_logs_at_idx" ON "search_query_logs"("at" DESC);

-- CreateIndex
CREATE INDEX "search_term_stats_countryCode_searches_idx" ON "search_term_stats"("countryCode", "searches" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "cuisines_slug_key" ON "cuisines"("slug");

-- CreateIndex
CREATE INDEX "cuisines_deletedAt_sort_idx" ON "cuisines"("deletedAt", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_deletedAt_sort_idx" ON "categories"("deletedAt", "sort");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE INDEX "category_keywords_term_idx" ON "category_keywords"("term");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_slug_key" ON "vendors"("slug");

-- CreateIndex
CREATE INDEX "vendors_type_status_deletedAt_idx" ON "vendors"("type", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "vendors_isFeatured_deletedAt_idx" ON "vendors"("isFeatured", "deletedAt");

-- CreateIndex
CREATE INDEX "vendors_isTrending_deletedAt_idx" ON "vendors"("isTrending", "deletedAt");

-- CreateIndex
CREATE INDEX "vendors_ownerId_idx" ON "vendors"("ownerId");

-- CreateIndex
CREATE INDEX "vendors_rating_idx" ON "vendors"("rating" DESC);

-- CreateIndex
CREATE INDEX "vendor_branches_city_countryCode_deletedAt_idx" ON "vendor_branches"("city", "countryCode", "deletedAt");

-- CreateIndex
CREATE INDEX "vendor_branches_vendorId_isPrimary_idx" ON "vendor_branches"("vendorId", "isPrimary");

-- CreateIndex
CREATE INDEX "vendor_branches_zoneId_idx" ON "vendor_branches"("zoneId");

-- CreateIndex
CREATE INDEX "vendor_branches_lat_lng_idx" ON "vendor_branches"("lat", "lng");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_branches_vendorId_slug_key" ON "vendor_branches"("vendorId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "branch_hours_branchId_weekday_sort_key" ON "branch_hours"("branchId", "weekday", "sort");

-- CreateIndex
CREATE INDEX "branch_closures_branchId_fromDate_toDate_idx" ON "branch_closures"("branchId", "fromDate", "toDate");

-- CreateIndex
CREATE INDEX "vendor_cuisines_cuisineId_idx" ON "vendor_cuisines"("cuisineId");

-- CreateIndex
CREATE INDEX "vendor_dietary_tag_idx" ON "vendor_dietary"("tag");

-- CreateIndex
CREATE INDEX "vendor_staff_userId_idx" ON "vendor_staff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_staff_vendorId_userId_key" ON "vendor_staff"("vendorId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_slug_key" ON "amenities"("slug");

-- CreateIndex
CREATE INDEX "branch_amenities_amenityId_idx" ON "branch_amenities"("amenityId");

-- CreateIndex
CREATE INDEX "menus_vendorId_isActive_idx" ON "menus"("vendorId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "menus_vendorId_kind_name_key" ON "menus"("vendorId", "kind", "name");

-- CreateIndex
CREATE INDEX "menu_sections_vendorId_deletedAt_sort_idx" ON "menu_sections"("vendorId", "deletedAt", "sort");

-- CreateIndex
CREATE INDEX "menu_sections_menuId_sort_idx" ON "menu_sections"("menuId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "food_items_slug_key" ON "food_items"("slug");

-- CreateIndex
CREATE INDEX "food_items_vendorId_deletedAt_isAvailable_idx" ON "food_items"("vendorId", "deletedAt", "isAvailable");

-- CreateIndex
CREATE INDEX "food_items_sectionId_sort_idx" ON "food_items"("sectionId", "sort");

-- CreateIndex
CREATE INDEX "food_items_isPopular_deletedAt_idx" ON "food_items"("isPopular", "deletedAt");

-- CreateIndex
CREATE INDEX "food_items_price_idx" ON "food_items"("price");

-- CreateIndex
CREATE INDEX "food_dietary_tag_idx" ON "food_dietary"("tag");

-- CreateIndex
CREATE INDEX "food_categories_categoryId_idx" ON "food_categories"("categoryId");

-- CreateIndex
CREATE INDEX "food_option_groups_foodId_sort_idx" ON "food_option_groups"("foodId", "sort");

-- CreateIndex
CREATE INDEX "food_options_groupId_sort_idx" ON "food_options"("groupId", "sort");

-- CreateIndex
CREATE INDEX "food_allergens_allergen_idx" ON "food_allergens"("allergen");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_foodId_key" ON "inventory_items"("foodId");

-- CreateIndex
CREATE INDEX "inventory_items_vendorId_deletedAt_idx" ON "inventory_items"("vendorId", "deletedAt");

-- CreateIndex
CREATE INDEX "inventory_items_branchId_idx" ON "inventory_items"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_vendorId_sku_key" ON "inventory_items"("vendorId", "sku");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_occurredAt_idx" ON "stock_movements"("itemId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_refEntity_refId_idx" ON "stock_movements"("refEntity", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "catering_services_slug_key" ON "catering_services"("slug");

-- CreateIndex
CREATE INDEX "catering_services_city_countryCode_isActive_idx" ON "catering_services"("city", "countryCode", "isActive");

-- CreateIndex
CREATE INDEX "catering_services_isFeatured_deletedAt_idx" ON "catering_services"("isFeatured", "deletedAt");

-- CreateIndex
CREATE INDEX "catering_service_cuisines_cuisineId_idx" ON "catering_service_cuisines"("cuisineId");

-- CreateIndex
CREATE INDEX "catering_service_dietary_tag_idx" ON "catering_service_dietary"("tag");

-- CreateIndex
CREATE INDEX "catering_service_events_eventType_idx" ON "catering_service_events"("eventType");

-- CreateIndex
CREATE INDEX "catering_service_styles_style_idx" ON "catering_service_styles"("style");

-- CreateIndex
CREATE INDEX "catering_packages_eventType_isActive_idx" ON "catering_packages"("eventType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "catering_packages_serviceId_slug_key" ON "catering_packages"("serviceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "catering_add_ons_slug_key" ON "catering_add_ons"("slug");

-- CreateIndex
CREATE INDEX "catering_service_add_ons_addOnId_idx" ON "catering_service_add_ons"("addOnId");

-- CreateIndex
CREATE UNIQUE INDEX "catering_quotes_quoteNumber_key" ON "catering_quotes"("quoteNumber");

-- CreateIndex
CREATE INDEX "catering_quotes_serviceId_status_requestedAt_idx" ON "catering_quotes"("serviceId", "status", "requestedAt" DESC);

-- CreateIndex
CREATE INDEX "catering_quotes_userId_requestedAt_idx" ON "catering_quotes"("userId", "requestedAt" DESC);

-- CreateIndex
CREATE INDEX "catering_quotes_eventDate_idx" ON "catering_quotes"("eventDate");

-- CreateIndex
CREATE INDEX "catering_quote_add_ons_addOnId_idx" ON "catering_quote_add_ons"("addOnId");

-- CreateIndex
CREATE INDEX "cms_documents_collection_sort_idx" ON "cms_documents"("collection", "sort");

-- CreateIndex
CREATE INDEX "cms_documents_publishAt_unpublishAt_idx" ON "cms_documents"("publishAt", "unpublishAt");

-- CreateIndex
CREATE INDEX "cms_documents_archivedAt_idx" ON "cms_documents"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "cms_documents_collection_key_key" ON "cms_documents"("collection", "key");

-- CreateIndex
CREATE INDEX "cms_revisions_documentId_at_idx" ON "cms_revisions"("documentId", "at" DESC);

-- CreateIndex
CREATE INDEX "cms_audit_entries_at_idx" ON "cms_audit_entries"("at" DESC);

-- CreateIndex
CREATE INDEX "cms_audit_entries_documentId_at_idx" ON "cms_audit_entries"("documentId", "at" DESC);

-- CreateIndex
CREATE INDEX "cms_contact_messages_status_at_idx" ON "cms_contact_messages"("status", "at" DESC);

-- CreateIndex
CREATE INDEX "cms_contact_messages_topic_idx" ON "cms_contact_messages"("topic");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_status_publishedAt_idx" ON "blog_posts"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "blog_posts_category_publishedAt_idx" ON "blog_posts"("category", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "post_tags_tag_idx" ON "post_tags"("tag");

-- CreateIndex
CREATE INDEX "testimonials_isPublished_sort_idx" ON "testimonials"("isPublished", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "job_openings_slug_key" ON "job_openings"("slug");

-- CreateIndex
CREATE INDEX "job_openings_status_postedAt_idx" ON "job_openings"("status", "postedAt" DESC);

-- CreateIndex
CREATE INDEX "job_openings_team_idx" ON "job_openings"("team");

-- CreateIndex
CREATE INDEX "delivery_zones_countryCode_city_isActive_idx" ON "delivery_zones"("countryCode", "city", "isActive");

-- CreateIndex
CREATE INDEX "zone_areas_area_idx" ON "zone_areas"("area");

-- CreateIndex
CREATE UNIQUE INDEX "riders_userId_key" ON "riders"("userId");

-- CreateIndex
CREATE INDEX "riders_zoneId_status_isOnShift_idx" ON "riders"("zoneId", "status", "isOnShift");

-- CreateIndex
CREATE INDEX "riders_userId_idx" ON "riders"("userId");

-- CreateIndex
CREATE INDEX "riders_lastLat_lastLng_idx" ON "riders"("lastLat", "lastLng");

-- CreateIndex
CREATE INDEX "rider_documents_status_expiresAt_idx" ON "rider_documents"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "rider_documents_riderId_kind_key" ON "rider_documents"("riderId", "kind");

-- CreateIndex
CREATE INDEX "rider_shifts_riderId_startedAt_idx" ON "rider_shifts"("riderId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "rider_shifts_zoneId_endedAt_idx" ON "rider_shifts"("zoneId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_jobs_jobNumber_key" ON "delivery_jobs"("jobNumber");

-- CreateIndex
CREATE INDEX "delivery_jobs_riderId_status_offeredAt_idx" ON "delivery_jobs"("riderId", "status", "offeredAt" DESC);

-- CreateIndex
CREATE INDEX "delivery_jobs_zoneId_status_expiresAt_idx" ON "delivery_jobs"("zoneId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "delivery_jobs_status_offeredAt_idx" ON "delivery_jobs"("status", "offeredAt" DESC);

-- CreateIndex
CREATE INDEX "delivery_jobs_completedAt_idx" ON "delivery_jobs"("completedAt" DESC);

-- CreateIndex
CREATE INDEX "delivery_job_orders_orderId_idx" ON "delivery_job_orders"("orderId");

-- CreateIndex
CREATE INDEX "delivery_stops_orderId_idx" ON "delivery_stops"("orderId");

-- CreateIndex
CREATE INDEX "delivery_stops_jobId_completedAt_idx" ON "delivery_stops"("jobId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_stops_jobId_sequence_key" ON "delivery_stops"("jobId", "sequence");

-- CreateIndex
CREATE INDEX "job_offers_riderId_outcome_offeredAt_idx" ON "job_offers"("riderId", "outcome", "offeredAt" DESC);

-- CreateIndex
CREATE INDEX "job_offers_expiresAt_outcome_idx" ON "job_offers"("expiresAt", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "job_offers_jobId_riderId_key" ON "job_offers"("jobId", "riderId");

-- CreateIndex
CREATE INDEX "rider_location_pings_riderId_at_idx" ON "rider_location_pings"("riderId", "at" DESC);

-- CreateIndex
CREATE INDEX "rider_location_pings_jobId_at_idx" ON "rider_location_pings"("jobId", "at");

-- CreateIndex
CREATE INDEX "rider_ledger_entries_riderId_occurredAt_idx" ON "rider_ledger_entries"("riderId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "rider_ledger_entries_riderId_affectsCash_isSettled_idx" ON "rider_ledger_entries"("riderId", "affectsCash", "isSettled");

-- CreateIndex
CREATE INDEX "rider_ledger_entries_jobId_idx" ON "rider_ledger_entries"("jobId");

-- CreateIndex
CREATE INDEX "rider_remittances_riderId_occurredAt_idx" ON "rider_remittances"("riderId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "rider_withdrawals_riderId_occurredAt_idx" ON "rider_withdrawals"("riderId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "rider_withdrawals_status_idx" ON "rider_withdrawals"("status");

-- CreateIndex
CREATE INDEX "restaurant_tables_vendorId_zone_deletedAt_idx" ON "restaurant_tables"("vendorId", "zone", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_tables_vendorId_label_key" ON "restaurant_tables"("vendorId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "qr_menu_configs_vendorId_key" ON "qr_menu_configs"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "dine_in_sessions_posSaleId_key" ON "dine_in_sessions"("posSaleId");

-- CreateIndex
CREATE INDEX "dine_in_sessions_vendorId_status_openedAt_idx" ON "dine_in_sessions"("vendorId", "status", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "dine_in_sessions_tableId_status_idx" ON "dine_in_sessions"("tableId", "status");

-- CreateIndex
CREATE INDEX "dine_in_sessions_guestKey_idx" ON "dine_in_sessions"("guestKey");

-- CreateIndex
CREATE INDEX "dine_in_rounds_sentAt_idx" ON "dine_in_rounds"("sentAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "dine_in_rounds_sessionId_roundNumber_key" ON "dine_in_rounds"("sessionId", "roundNumber");

-- CreateIndex
CREATE INDEX "dine_in_round_items_roundId_idx" ON "dine_in_round_items"("roundId");

-- CreateIndex
CREATE INDEX "dine_in_round_items_foodId_idx" ON "dine_in_round_items"("foodId");

-- CreateIndex
CREATE INDEX "service_requests_sessionId_requestedAt_idx" ON "service_requests"("sessionId", "requestedAt" DESC);

-- CreateIndex
CREATE INDEX "service_requests_resolvedAt_idx" ON "service_requests"("resolvedAt");

-- CreateIndex
CREATE INDEX "pos_shifts_vendorId_openedAt_idx" ON "pos_shifts"("vendorId", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "pos_shifts_closedAt_idx" ON "pos_shifts"("closedAt");

-- CreateIndex
CREATE INDEX "pos_held_tickets_vendorId_heldAt_idx" ON "pos_held_tickets"("vendorId", "heldAt" DESC);

-- CreateIndex
CREATE INDEX "pos_held_ticket_lines_ticketId_idx" ON "pos_held_ticket_lines"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sales_saleNumber_key" ON "pos_sales"("saleNumber");

-- CreateIndex
CREATE INDEX "pos_sales_vendorId_soldAt_idx" ON "pos_sales"("vendorId", "soldAt" DESC);

-- CreateIndex
CREATE INDEX "pos_sales_shiftId_idx" ON "pos_sales"("shiftId");

-- CreateIndex
CREATE INDEX "pos_sale_items_saleId_idx" ON "pos_sale_items"("saleId");

-- CreateIndex
CREATE INDEX "pos_sale_items_foodId_idx" ON "pos_sale_items"("foodId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_primaryRole_status_idx" ON "users"("primaryRole", "status");

-- CreateIndex
CREATE INDEX "users_countryCode_idx" ON "users"("countryCode");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "roles_slug_key" ON "roles"("slug");

-- CreateIndex
CREATE INDEX "roles_rank_idx" ON "roles"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_slug_key" ON "permissions"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "permissions"("resource", "action");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE INDEX "user_role_assignments_userId_idx" ON "user_role_assignments"("userId");

-- CreateIndex
CREATE INDEX "user_role_assignments_roleId_idx" ON "user_role_assignments"("roleId");

-- CreateIndex
CREATE INDEX "user_role_assignments_vendorId_idx" ON "user_role_assignments"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_assignments_userId_roleId_vendorId_key" ON "user_role_assignments"("userId", "roleId", "vendorId");

-- CreateIndex
CREATE INDEX "user_permissions_userId_idx" ON "user_permissions"("userId");

-- CreateIndex
CREATE INDEX "user_permissions_permissionId_idx" ON "user_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_userId_permissionId_vendorId_key" ON "user_permissions"("userId", "permissionId", "vendorId");

-- CreateIndex
CREATE INDEX "social_identities_userId_idx" ON "social_identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "social_identities_provider_providerUid_key" ON "social_identities"("provider", "providerUid");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_parentId_key" ON "refresh_tokens"("parentId");

-- CreateIndex
CREATE INDEX "refresh_tokens_sessionId_revokedAt_idx" ON "refresh_tokens"("sessionId", "revokedAt");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "devices_pushToken_idx" ON "devices"("pushToken");

-- CreateIndex
CREATE UNIQUE INDEX "devices_userId_installId_key" ON "devices"("userId", "installId");

-- CreateIndex
CREATE INDEX "otp_challenges_destination_purpose_createdAt_idx" ON "otp_challenges"("destination", "purpose", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "otp_challenges_expiresAt_idx" ON "otp_challenges"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_tokenHash_key" ON "password_resets"("tokenHash");

-- CreateIndex
CREATE INDEX "password_resets_userId_createdAt_idx" ON "password_resets"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "login_attempts_identifier_at_idx" ON "login_attempts"("identifier", "at" DESC);

-- CreateIndex
CREATE INDEX "login_attempts_ip_at_idx" ON "login_attempts"("ip", "at" DESC);

-- CreateIndex
CREATE INDEX "addresses_userId_deletedAt_idx" ON "addresses"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "addresses_city_area_idx" ON "addresses"("city", "area");

-- CreateIndex
CREATE INDEX "favorites_kind_targetId_idx" ON "favorites"("kind", "targetId");

-- CreateIndex
CREATE INDEX "notification_templates_category_idx" ON "notification_templates"("category");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_key_audience_key" ON "notification_templates"("key", "audience");

-- CreateIndex
CREATE INDEX "notifications_userId_at_idx" ON "notifications"("userId", "at" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_at_idx" ON "notifications"("userId", "readAt", "at" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_category_at_idx" ON "notifications"("userId", "category", "at" DESC);

-- CreateIndex
CREATE INDEX "notifications_audience_vendorId_at_idx" ON "notifications"("audience", "vendorId", "at" DESC);

-- CreateIndex
CREATE INDEX "notifications_audience_riderId_at_idx" ON "notifications"("audience", "riderId", "at" DESC);

-- CreateIndex
CREATE INDEX "notifications_subjectKind_subjectId_idx" ON "notifications"("subjectKind", "subjectId");

-- CreateIndex
CREATE INDEX "notification_dispatches_notificationId_idx" ON "notification_dispatches"("notificationId");

-- CreateIndex
CREATE INDEX "notification_dispatches_status_at_idx" ON "notification_dispatches"("status", "at");

-- CreateIndex
CREATE INDEX "notification_dispatches_channel_at_idx" ON "notification_dispatches"("channel", "at" DESC);

-- CreateIndex
CREATE INDEX "notification_dispatches_providerRef_idx" ON "notification_dispatches"("providerRef");

-- CreateIndex
CREATE INDEX "notification_campaigns_status_scheduledFor_idx" ON "notification_campaigns"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "notification_campaigns_sentAt_idx" ON "notification_campaigns"("sentAt" DESC);

-- CreateIndex
CREATE INDEX "carts_guestKey_idx" ON "carts"("guestKey");

-- CreateIndex
CREATE INDEX "carts_expiresAt_idx" ON "carts"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "carts_userId_vendorId_key" ON "carts"("userId", "vendorId");

-- CreateIndex
CREATE INDEX "cart_items_cartId_idx" ON "cart_items"("cartId");

-- CreateIndex
CREATE INDEX "cart_items_foodId_idx" ON "cart_items"("foodId");

-- CreateIndex
CREATE INDEX "cart_item_options_optionId_idx" ON "cart_item_options"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_vendorId_status_placedAt_idx" ON "orders"("vendorId", "status", "placedAt" DESC);

-- CreateIndex
CREATE INDEX "orders_userId_placedAt_idx" ON "orders"("userId", "placedAt" DESC);

-- CreateIndex
CREATE INDEX "orders_branchId_status_placedAt_idx" ON "orders"("branchId", "status", "placedAt" DESC);

-- CreateIndex
CREATE INDEX "orders_status_placedAt_idx" ON "orders"("status", "placedAt" DESC);

-- CreateIndex
CREATE INDEX "orders_riderId_status_idx" ON "orders"("riderId", "status");

-- CreateIndex
CREATE INDEX "orders_paymentStatus_placedAt_idx" ON "orders"("paymentStatus", "placedAt" DESC);

-- CreateIndex
CREATE INDEX "orders_scheduledFor_idx" ON "orders"("scheduledFor");

-- CreateIndex
CREATE INDEX "orders_deletedAt_idx" ON "orders"("deletedAt");

-- CreateIndex
CREATE INDEX "order_items_orderId_sort_idx" ON "order_items"("orderId", "sort");

-- CreateIndex
CREATE INDEX "order_items_foodId_idx" ON "order_items"("foodId");

-- CreateIndex
CREATE INDEX "order_item_options_orderItemId_idx" ON "order_item_options"("orderItemId");

-- CreateIndex
CREATE INDEX "order_events_orderId_at_idx" ON "order_events"("orderId", "at");

-- CreateIndex
CREATE INDEX "order_events_status_at_idx" ON "order_events"("status", "at" DESC);

-- CreateIndex
CREATE INDEX "order_rider_declines_riderId_idx" ON "order_rider_declines"("riderId");

-- CreateIndex
CREATE INDEX "refund_requests_orderId_idx" ON "refund_requests"("orderId");

-- CreateIndex
CREATE INDEX "refund_requests_status_createdAt_idx" ON "refund_requests"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_orderId_key" ON "invoices"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_countryCode_issuedAt_idx" ON "invoices"("countryCode", "issuedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payment_providers_kind_key" ON "payment_providers"("kind");

-- CreateIndex
CREATE INDEX "payment_providers_isEnabled_priority_idx" ON "payment_providers"("isEnabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_subscriptionCycleId_key" ON "payment_intents"("subscriptionCycleId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_clientRef_key" ON "payment_intents"("clientRef");

-- CreateIndex
CREATE INDEX "payment_intents_orderId_createdAt_idx" ON "payment_intents"("orderId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "payment_intents_userId_createdAt_idx" ON "payment_intents"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "payment_intents_status_createdAt_idx" ON "payment_intents"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_providerId_providerRef_key" ON "payment_intents"("providerId", "providerRef");

-- CreateIndex
CREATE INDEX "payment_transactions_intentId_at_idx" ON "payment_transactions"("intentId", "at");

-- CreateIndex
CREATE INDEX "payment_transactions_providerId_at_idx" ON "payment_transactions"("providerId", "at" DESC);

-- CreateIndex
CREATE INDEX "refunds_intentId_idx" ON "refunds"("intentId");

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_status_createdAt_idx" ON "refunds"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "payment_webhook_events_status_receivedAt_idx" ON "payment_webhook_events"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "payment_webhook_events_intentId_idx" ON "payment_webhook_events"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_providerId_eventId_key" ON "payment_webhook_events"("providerId", "eventId");

-- CreateIndex
CREATE INDEX "saved_payment_methods_userId_deletedAt_idx" ON "saved_payment_methods"("userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "saved_payment_methods_providerId_token_key" ON "saved_payment_methods"("providerId", "token");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");

-- CreateIndex
CREATE INDEX "wallet_transactions_walletId_occurredAt_idx" ON "wallet_transactions"("walletId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "wallet_transactions_orderId_idx" ON "wallet_transactions"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_kind_ownerId_currency_key" ON "ledger_accounts"("kind", "ownerId", "currency");

-- CreateIndex
CREATE INDEX "ledger_entries_accountId_occurredAt_idx" ON "ledger_entries"("accountId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "ledger_entries_transactionRef_idx" ON "ledger_entries"("transactionRef");

-- CreateIndex
CREATE INDEX "ledger_entries_orderId_idx" ON "ledger_entries"("orderId");

-- CreateIndex
CREATE INDEX "payout_accounts_vendorId_idx" ON "payout_accounts"("vendorId");

-- CreateIndex
CREATE INDEX "payout_accounts_riderId_idx" ON "payout_accounts"("riderId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_reference_key" ON "payouts"("reference");

-- CreateIndex
CREATE INDEX "payouts_vendorId_periodEnd_idx" ON "payouts"("vendorId", "periodEnd" DESC);

-- CreateIndex
CREATE INDEX "payouts_riderId_periodEnd_idx" ON "payouts"("riderId", "periodEnd" DESC);

-- CreateIndex
CREATE INDEX "payouts_status_periodEnd_idx" ON "payouts"("status", "periodEnd");

-- CreateIndex
CREATE INDEX "commission_rules_vendorId_effectiveFrom_idx" ON "commission_rules"("vendorId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "commission_rules_countryCode_vendorType_effectiveFrom_idx" ON "commission_rules"("countryCode", "vendorType", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "membership_plans_slug_key" ON "membership_plans"("slug");

-- CreateIndex
CREATE INDEX "vendor_memberships_vendorId_status_idx" ON "vendor_memberships"("vendorId", "status");

-- CreateIndex
CREATE INDEX "vendor_memberships_currentPeriodEnd_idx" ON "vendor_memberships"("currentPeriodEnd");

-- CreateIndex
CREATE INDEX "currencies_isActive_sort_idx" ON "currencies"("isActive", "sort");

-- CreateIndex
CREATE INDEX "exchange_rates_effectiveOn_idx" ON "exchange_rates"("effectiveOn");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_baseCode_quoteCode_effectiveOn_key" ON "exchange_rates"("baseCode", "quoteCode", "effectiveOn");

-- CreateIndex
CREATE INDEX "countries_isActive_sort_idx" ON "countries"("isActive", "sort");

-- CreateIndex
CREATE INDEX "languages_isActive_sort_idx" ON "languages"("isActive", "sort");

-- CreateIndex
CREATE INDEX "country_languages_languageCode_idx" ON "country_languages"("languageCode");

-- CreateIndex
CREATE INDEX "tax_rules_countryCode_appliesTo_effectiveFrom_effectiveTo_idx" ON "tax_rules"("countryCode", "appliesTo", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "tax_rules_vendorId_idx" ON "tax_rules"("vendorId");

-- CreateIndex
CREATE INDEX "settings_key_idx" ON "settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "settings_scope_scopeId_key_key" ON "settings"("scope", "scopeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "feature_flags_isEnabled_idx" ON "feature_flags"("isEnabled");

-- CreateIndex
CREATE INDEX "translations_languageCode_idx" ON "translations"("languageCode");

-- CreateIndex
CREATE UNIQUE INDEX "translations_entity_entityId_field_languageCode_key" ON "translations"("entity", "entityId", "field", "languageCode");

-- CreateIndex
CREATE INDEX "file_assets_ownerEntity_ownerId_idx" ON "file_assets"("ownerEntity", "ownerId");

-- CreateIndex
CREATE INDEX "file_assets_uploadedById_idx" ON "file_assets"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "file_assets_bucket_key_key" ON "file_assets"("bucket", "key");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_at_idx" ON "audit_logs"("entity", "entityId", "at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actorId_at_idx" ON "audit_logs"("actorId", "at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_at_idx" ON "audit_logs"("action", "at" DESC);

-- CreateIndex
CREATE INDEX "outbox_events_status_availableAt_idx" ON "outbox_events"("status", "availableAt");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_aggregateId_idx" ON "outbox_events"("aggregate", "aggregateId");

-- CreateIndex
CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");

-- CreateIndex
CREATE INDEX "idempotency_keys_userId_idx" ON "idempotency_keys"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "offers_slug_key" ON "offers"("slug");

-- CreateIndex
CREATE INDEX "offers_placement_startsAt_endsAt_idx" ON "offers"("placement", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "offers_startsAt_endsAt_deletedAt_idx" ON "offers"("startsAt", "endsAt", "deletedAt");

-- CreateIndex
CREATE INDEX "offers_code_idx" ON "offers"("code");

-- CreateIndex
CREATE INDEX "offer_vendors_vendorId_idx" ON "offer_vendors"("vendorId");

-- CreateIndex
CREATE INDEX "offer_categories_categoryId_idx" ON "offer_categories"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_startsAt_endsAt_deletedAt_idx" ON "coupons"("startsAt", "endsAt", "deletedAt");

-- CreateIndex
CREATE INDEX "coupons_issuerVendorId_deletedAt_idx" ON "coupons"("issuerVendorId", "deletedAt");

-- CreateIndex
CREATE INDEX "coupons_offerId_idx" ON "coupons"("offerId");

-- CreateIndex
CREATE INDEX "coupons_source_idx" ON "coupons"("source");

-- CreateIndex
CREATE INDEX "coupon_vendors_vendorId_idx" ON "coupon_vendors"("vendorId");

-- CreateIndex
CREATE INDEX "coupon_categories_categoryId_idx" ON "coupon_categories"("categoryId");

-- CreateIndex
CREATE INDEX "coupon_claims_couponId_idx" ON "coupon_claims"("couponId");

-- CreateIndex
CREATE INDEX "coupon_claims_userId_claimedAt_idx" ON "coupon_claims"("userId", "claimedAt" DESC);

-- CreateIndex
CREATE INDEX "coupon_redemptions_userId_couponId_idx" ON "coupon_redemptions"("userId", "couponId");

-- CreateIndex
CREATE INDEX "coupon_redemptions_orderId_idx" ON "coupon_redemptions"("orderId");

-- CreateIndex
CREATE INDEX "coupon_redemptions_redeemedAt_idx" ON "coupon_redemptions"("redeemedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_couponId_orderId_key" ON "coupon_redemptions"("couponId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_policies_vendorId_key" ON "booking_policies"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_reference_key" ON "reservations"("reference");

-- CreateIndex
CREATE INDEX "reservations_vendorId_date_status_idx" ON "reservations"("vendorId", "date", "status");

-- CreateIndex
CREATE INDEX "reservations_vendorId_startsAt_endsAt_idx" ON "reservations"("vendorId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "reservations_userId_startsAt_idx" ON "reservations"("userId", "startsAt" DESC);

-- CreateIndex
CREATE INDEX "reservations_status_startsAt_idx" ON "reservations"("status", "startsAt");

-- CreateIndex
CREATE INDEX "reservation_tables_tableId_idx" ON "reservation_tables"("tableId");

-- CreateIndex
CREATE INDEX "reviews_subject_subjectId_status_createdAt_idx" ON "reviews"("subject", "subjectId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "reviews_vendorId_status_createdAt_idx" ON "reviews"("vendorId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "reviews_authorId_createdAt_idx" ON "reviews"("authorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "reviews_vendorId_rating_idx" ON "reviews"("vendorId", "rating");

-- CreateIndex
CREATE INDEX "reviews_helpfulCount_idx" ON "reviews"("helpfulCount" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_orderId_subject_key" ON "reviews"("orderId", "subject");

-- CreateIndex
CREATE INDEX "review_aspect_scores_aspect_score_idx" ON "review_aspect_scores"("aspect", "score");

-- CreateIndex
CREATE INDEX "review_tags_tag_idx" ON "review_tags"("tag");

-- CreateIndex
CREATE INDEX "review_dishes_foodId_idx" ON "review_dishes"("foodId");

-- CreateIndex
CREATE INDEX "review_media_reviewId_sort_idx" ON "review_media"("reviewId", "sort");

-- CreateIndex
CREATE INDEX "review_votes_userId_idx" ON "review_votes"("userId");

-- CreateIndex
CREATE INDEX "review_reports_resolvedAt_idx" ON "review_reports"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_reports_reviewId_reporterId_key" ON "review_reports"("reviewId", "reporterId");

-- CreateIndex
CREATE INDEX "rating_aggregates_vendorId_idx" ON "rating_aggregates"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "rating_aggregates_subject_subjectId_month_key" ON "rating_aggregates"("subject", "subjectId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plans_slug_key" ON "meal_plans"("slug");

-- CreateIndex
CREATE INDEX "meal_plans_goal_isActive_deletedAt_idx" ON "meal_plans"("goal", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "meal_plans_vendorId_deletedAt_idx" ON "meal_plans"("vendorId", "deletedAt");

-- CreateIndex
CREATE INDEX "meal_plans_isFeatured_deletedAt_idx" ON "meal_plans"("isFeatured", "deletedAt");

-- CreateIndex
CREATE INDEX "meal_plan_dietary_tag_idx" ON "meal_plan_dietary"("tag");

-- CreateIndex
CREATE INDEX "plan_tiers_planId_sort_idx" ON "plan_tiers"("planId", "sort");

-- CreateIndex
CREATE INDEX "plan_meals_planId_idx" ON "plan_meals"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_meals_planId_weekIndex_day_slot_key" ON "plan_meals"("planId", "weekIndex", "day", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_reference_key" ON "subscriptions"("reference");

-- CreateIndex
CREATE INDEX "subscriptions_userId_startedAt_idx" ON "subscriptions"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "subscriptions_planId_status_idx" ON "subscriptions"("planId", "status");

-- CreateIndex
CREATE INDEX "subscriptions_status_renewsOn_idx" ON "subscriptions"("status", "renewsOn");

-- CreateIndex
CREATE INDEX "subscription_skips_date_idx" ON "subscription_skips"("date");

-- CreateIndex
CREATE INDEX "subscription_cycles_status_periodStart_idx" ON "subscription_cycles"("status", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_cycles_subscriptionId_cycleNumber_key" ON "subscription_cycles"("subscriptionId", "cycleNumber");

-- AddForeignKey
ALTER TABLE "food_profiles" ADD CONSTRAINT "food_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_query_logs" ADD CONSTRAINT "search_query_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_keywords" ADD CONSTRAINT "category_keywords_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_branches" ADD CONSTRAINT "vendor_branches_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_branches" ADD CONSTRAINT "vendor_branches_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_branches" ADD CONSTRAINT "vendor_branches_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_hours" ADD CONSTRAINT "branch_hours_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "vendor_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_closures" ADD CONSTRAINT "branch_closures_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "vendor_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_cuisines" ADD CONSTRAINT "vendor_cuisines_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_cuisines" ADD CONSTRAINT "vendor_cuisines_cuisineId_fkey" FOREIGN KEY ("cuisineId") REFERENCES "cuisines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_dietary" ADD CONSTRAINT "vendor_dietary_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_staff" ADD CONSTRAINT "vendor_staff_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_staff" ADD CONSTRAINT "vendor_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_amenities" ADD CONSTRAINT "branch_amenities_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "vendor_branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_amenities" ADD CONSTRAINT "branch_amenities_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "amenities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_sections" ADD CONSTRAINT "menu_sections_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_sections" ADD CONSTRAINT "menu_sections_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_items" ADD CONSTRAINT "food_items_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_items" ADD CONSTRAINT "food_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "menu_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_dietary" ADD CONSTRAINT "food_dietary_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "food_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_categories" ADD CONSTRAINT "food_categories_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "food_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_categories" ADD CONSTRAINT "food_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_option_groups" ADD CONSTRAINT "food_option_groups_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "food_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_options" ADD CONSTRAINT "food_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "food_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_nutrition" ADD CONSTRAINT "food_nutrition_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "food_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_allergens" ADD CONSTRAINT "food_allergens_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "food_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "food_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_service_cuisines" ADD CONSTRAINT "catering_service_cuisines_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "catering_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_service_cuisines" ADD CONSTRAINT "catering_service_cuisines_cuisineId_fkey" FOREIGN KEY ("cuisineId") REFERENCES "cuisines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_service_dietary" ADD CONSTRAINT "catering_service_dietary_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "catering_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_service_events" ADD CONSTRAINT "catering_service_events_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "catering_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_service_styles" ADD CONSTRAINT "catering_service_styles_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "catering_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_packages" ADD CONSTRAINT "catering_packages_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "catering_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_service_add_ons" ADD CONSTRAINT "catering_service_add_ons_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "catering_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_service_add_ons" ADD CONSTRAINT "catering_service_add_ons_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "catering_add_ons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_quotes" ADD CONSTRAINT "catering_quotes_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "catering_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_quotes" ADD CONSTRAINT "catering_quotes_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "catering_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_quotes" ADD CONSTRAINT "catering_quotes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_quote_add_ons" ADD CONSTRAINT "catering_quote_add_ons_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "catering_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_quote_add_ons" ADD CONSTRAINT "catering_quote_add_ons_addOnId_fkey" FOREIGN KEY ("addOnId") REFERENCES "catering_add_ons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cms_documents" ADD CONSTRAINT "cms_documents_collection_fkey" FOREIGN KEY ("collection") REFERENCES "cms_collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cms_revisions" ADD CONSTRAINT "cms_revisions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "cms_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cms_audit_entries" ADD CONSTRAINT "cms_audit_entries_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "cms_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_postId_fkey" FOREIGN KEY ("postId") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_areas" ADD CONSTRAINT "zone_areas_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_documents" ADD CONSTRAINT "rider_documents_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_shifts" ADD CONSTRAINT "rider_shifts_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_job_orders" ADD CONSTRAINT "delivery_job_orders_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "delivery_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_job_orders" ADD CONSTRAINT "delivery_job_orders_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_stops" ADD CONSTRAINT "delivery_stops_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "delivery_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "delivery_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_location_pings" ADD CONSTRAINT "rider_location_pings_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_location_pings" ADD CONSTRAINT "rider_location_pings_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "delivery_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_ledger_entries" ADD CONSTRAINT "rider_ledger_entries_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_ledger_entries" ADD CONSTRAINT "rider_ledger_entries_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "delivery_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_remittances" ADD CONSTRAINT "rider_remittances_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_withdrawals" ADD CONSTRAINT "rider_withdrawals_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_menu_configs" ADD CONSTRAINT "qr_menu_configs_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dine_in_sessions" ADD CONSTRAINT "dine_in_sessions_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dine_in_rounds" ADD CONSTRAINT "dine_in_rounds_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "dine_in_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dine_in_round_items" ADD CONSTRAINT "dine_in_round_items_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "dine_in_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dine_in_round_items" ADD CONSTRAINT "dine_in_round_items_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "food_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "dine_in_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_shifts" ADD CONSTRAINT "pos_shifts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_held_tickets" ADD CONSTRAINT "pos_held_tickets_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_held_tickets" ADD CONSTRAINT "pos_held_tickets_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_held_ticket_lines" ADD CONSTRAINT "pos_held_ticket_lines_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "pos_held_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_held_ticket_lines" ADD CONSTRAINT "pos_held_ticket_lines_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "food_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "pos_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "pos_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "food_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_identities" ADD CONSTRAINT "social_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "notification_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_dispatches" ADD CONSTRAINT "notification_dispatches_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_campaigns" ADD CONSTRAINT "notification_campaigns_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "notification_segments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "vendor_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "food_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_options" ADD CONSTRAINT "cart_item_options_cartItemId_fkey" FOREIGN KEY ("cartItemId") REFERENCES "cart_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_options" ADD CONSTRAINT "cart_item_options_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "food_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "vendor_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "food_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "food_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_rider_declines" ADD CONSTRAINT "order_rider_declines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_rider_declines" ADD CONSTRAINT "order_rider_declines_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "payment_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_subscriptionCycleId_fkey" FOREIGN KEY ("subscriptionCycleId") REFERENCES "subscription_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "payment_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "payment_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "payment_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "payment_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_payment_methods" ADD CONSTRAINT "saved_payment_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_payment_methods" ADD CONSTRAINT "saved_payment_methods_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "payment_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "payout_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "payment_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_memberships" ADD CONSTRAINT "vendor_memberships_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_memberships" ADD CONSTRAINT "vendor_memberships_planId_fkey" FOREIGN KEY ("planId") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_baseCode_fkey" FOREIGN KEY ("baseCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_quoteCode_fkey" FOREIGN KEY ("quoteCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "countries" ADD CONSTRAINT "countries_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country_languages" ADD CONSTRAINT "country_languages_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "country_languages" ADD CONSTRAINT "country_languages_languageCode_fkey" FOREIGN KEY ("languageCode") REFERENCES "languages"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rules" ADD CONSTRAINT "tax_rules_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translations" ADD CONSTRAINT "translations_languageCode_fkey" FOREIGN KEY ("languageCode") REFERENCES "languages"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_vendors" ADD CONSTRAINT "offer_vendors_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_vendors" ADD CONSTRAINT "offer_vendors_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_categories" ADD CONSTRAINT "offer_categories_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_categories" ADD CONSTRAINT "offer_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_issuerVendorId_fkey" FOREIGN KEY ("issuerVendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_vendors" ADD CONSTRAINT "coupon_vendors_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_vendors" ADD CONSTRAINT "coupon_vendors_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_claims" ADD CONSTRAINT "coupon_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_claims" ADD CONSTRAINT "coupon_claims_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_userId_couponId_fkey" FOREIGN KEY ("userId", "couponId") REFERENCES "coupon_claims"("userId", "couponId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_policies" ADD CONSTRAINT "booking_policies_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_policy_zones" ADD CONSTRAINT "booking_policy_zones_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "booking_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_tables" ADD CONSTRAINT "reservation_tables_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_tables" ADD CONSTRAINT "reservation_tables_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_aspect_scores" ADD CONSTRAINT "review_aspect_scores_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_tags" ADD CONSTRAINT "review_tags_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_dishes" ADD CONSTRAINT "review_dishes_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_dishes" ADD CONSTRAINT "review_dishes_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "food_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_media" ADD CONSTRAINT "review_media_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_media" ADD CONSTRAINT "review_media_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_votes" ADD CONSTRAINT "review_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_aggregates" ADD CONSTRAINT "rating_aggregates_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_dietary" ADD CONSTRAINT "meal_plan_dietary_planId_fkey" FOREIGN KEY ("planId") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_days" ADD CONSTRAINT "meal_plan_days_planId_fkey" FOREIGN KEY ("planId") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_slots" ADD CONSTRAINT "meal_plan_slots_planId_fkey" FOREIGN KEY ("planId") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_tiers" ADD CONSTRAINT "plan_tiers_planId_fkey" FOREIGN KEY ("planId") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_meals" ADD CONSTRAINT "plan_meals_planId_fkey" FOREIGN KEY ("planId") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_meal_dietary" ADD CONSTRAINT "plan_meal_dietary_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "plan_meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "meal_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "plan_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_slots" ADD CONSTRAINT "subscription_slots_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_days" ADD CONSTRAINT "subscription_days_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_skips" ADD CONSTRAINT "subscription_skips_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_cycles" ADD CONSTRAINT "subscription_cycles_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


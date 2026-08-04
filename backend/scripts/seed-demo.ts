/**
 * The demo catalog — V1 Unit 1's seeder.
 *
 *     bun run seed:demo          # needs `seed:reference` to have run first
 *
 * Writes the twenty-odd storefronts, their branches, menus, sections, dishes, variants
 * and add-ons that `frontend/lib/mock` has served since Phase C, so that flipping
 * `NEXT_PUBLIC_BACKEND_CATALOG=1` changes where the data comes from and nothing else.
 *
 * ## The three seeders, and why they are three
 *
 *   seed:reference   currencies · countries · languages · roles · permissions · settings
 *   seed:demo        the demo accounts, then the whole catalog          ← this file
 *   seed:order-demo  carts, orders and deliveries for the demo script
 *
 * The split is along "can you delete it": reference data is load-bearing — `User.countryCode`
 * is a non-null FK onto `countries`, so an empty `countries` table means no account can be
 * created by any means. Demo data is showcase, and a production install runs the first and
 * neither of the others. Keeping order data separate again matters because it is the only
 * one that is *destructive* to re-run: an order is a financial document, and a seeder that
 * upserts one is a seeder that can rewrite history.
 *
 * ## Data comes from a generated file, not from this file
 *
 * `scripts/data/catalog-demo.json` is produced by `frontend/bun run export:catalog`. A
 * thousand hand-copied values would be a thousand chances for the seeded catalog to differ
 * from the mock in one price or one slug — which surfaces as a UI that changes when the flag
 * is flipped, the one failure V1 exists to prevent. What this file owns is the *structure*:
 * splitting a flat `Vendor` into a brand and a branch, folding `WeeklyHours` into rows,
 * deriving a timezone. That belongs next to the schema, where it can be read against
 * `catalog.prisma`.
 *
 * ## Idempotent, and non-destructive
 *
 * Every write is an upsert on a primary key, and the mock's ids are used verbatim
 * (`ven_bella_napoli`, `sec_bella_pizzas`, `food_pizza-margherita`) rather than minted —
 * so a re-run updates in place, and any cart a browser has in `localStorage` still names
 * dishes that exist. Child collections with no data of their own (opening hours, cuisine
 * links, dietary tags, category keywords) are replaced wholesale; option groups and options
 * are upserted instead, because they are soft-deletable and the extension refuses
 * `deleteMany` on those by design.
 *
 * It never deletes a vendor. A storefront removed from the mock stays in the database,
 * because by then it may own orders.
 *
 * ## Not verified
 *
 * This machine has no PostgreSQL, so **this script has never been executed against a
 * database** — the same gap E1–E3 and Unit 0 left. It typechecks against the generated
 * client and every statement is an ordinary upsert, and that is the extent of the assurance.
 */
process.env.DATABASE_URL ??= 'postgresql://localhost:5432/foodora';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';

import { PASSWORD_HASHER, type PasswordHasherPort } from '../src/modules/auth/domain';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma';
import type { $Enums } from '../src/infrastructure/prisma/generated';

/**
 * The password every demo account shares, and the same string
 * `frontend/services/auth.ts` shows on the sign-in screen as a hint.
 *
 * Hashed with the real Argon2id parameters through the container's own hasher rather
 * than with a literal hash pasted in here — a pasted hash silently stops matching the
 * moment `argon2.memoryCost` changes, and the symptom is "the demo accounts stopped
 * working" with nothing to point at.
 */
const DEMO_PASSWORD = 'demo1234';

/** A branch has to be somewhere in time; `countries.timezone` is where it comes from. */
const FALLBACK_TIMEZONE = 'Asia/Dhaka';

// ---------------------------------------------------------------------------
// The generated dataset
// ---------------------------------------------------------------------------

interface MockAudit {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface MockCuisine extends MockAudit {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  image: string;
}

interface MockCategory extends MockCuisine {
  sort: number;
  keywords: string[];
}

interface MockDayHours {
  open: string | null;
  close: string | null;
}

interface MockVendor extends MockAudit {
  id: string;
  slug: string;
  type: string;
  ownerId: string | null;
  name: string;
  tagline: string;
  description: string;
  logo: string;
  cover: string;
  cuisineIds: string[];
  dietary: string[];
  priceLevel: number;
  rating: number;
  reviewCount: number;
  location: { lat: number; lng: number; address: string; city: string; countryCode: string };
  distanceKm: number;
  etaMinutes: [number, number];
  deliveryFee: number;
  minOrder: number;
  freeDeliveryOver: number | null;
  hours: Record<string, MockDayHours>;
  isOpen: boolean;
  isFeatured: boolean;
  isTrending: boolean;
  promoLabel: string | null;
  currency: string;
}

interface MockSection extends MockAudit {
  id: string;
  vendorId: string;
  name: string;
  sort: number;
}

interface MockOption {
  id: string;
  name: string;
  priceDelta: number;
}

interface MockOptionGroup {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: MockOption[];
}

interface MockFood extends MockAudit {
  id: string;
  slug: string;
  vendorId: string;
  sectionId: string;
  name: string;
  description: string;
  image: string;
  price: number;
  compareAtPrice: number | null;
  dietary: string[];
  spicyLevel: number;
  calories: number | null;
  rating: number;
  reviewCount: number;
  isPopular: boolean;
  isAvailable: boolean;
  optionGroups: MockOptionGroup[];
}

interface MockUser extends MockAudit {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  role: string;
  countryCode: string;
  currency: string;
  locale: string;
  isVerified: boolean;
}

interface CatalogDemo {
  generatedFrom: string;
  seedNow: string;
  cuisines: MockCuisine[];
  categories: MockCategory[];
  vendors: MockVendor[];
  menuSections: MockSection[];
  foods: MockFood[];
  users: MockUser[];
}

function loadDataset(): CatalogDemo {
  // `process.cwd()` rather than `import.meta.dirname`: the backend compiles with
  // `module: commonjs`, where `import.meta` is a type error. Every `seed:*` script is
  // run through its package script, so the working directory is `backend/`.
  const path = join(process.cwd(), 'scripts', 'data', 'catalog-demo.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CatalogDemo;
  } catch (error) {
    throw new Error(
      `Could not read ${path}. Generate it with \`bun run export:catalog\` in frontend/. ` +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Wire value → the Prisma client's enum member
// ---------------------------------------------------------------------------

/**
 * `cloud-kitchen` → `CLOUD_KITCHEN`, exactly the schema's `@map` convention in reverse.
 *
 * Inline rather than through `enumCodec`, for the reason `seed-reference.ts` gives: the
 * codec returns the literal union only when parameterised, and a script's handful of
 * call sites does not justify threading `$Enums` through. Wrong values fail loudly at
 * the first insert, not silently.
 */
function toEnum<T extends string>(wire: string): T {
  return wire.toUpperCase().replace(/-/g, '_') as T;
}

/**
 * The coupons the checkout screen can actually apply, copied from
 * `frontend/lib/mock/coupons.ts` — same ids, same codes, same rules.
 *
 * ## Why only these eight
 *
 * The frontend's catalogue is assembled from two sources: these granted and vendor-issued
 * tickets, and campaign coupons *minted from the C20 offer seed*. Porting the second half
 * means porting `offers`, which is the promotions unit's job and not checkout's. These eight
 * are the ones a customer holds in their wallet and can apply at the till, so seeding them
 * is what makes the demo's coupon path real rather than a client-side illusion.
 *
 * ## Why the windows are day offsets
 *
 * Because the frontend's are (`lib/mock/coupons.ts` stamps them from `now`), and a demo has
 * to have live tickets whenever it is opened. Two of them are deliberately *not* usable, and
 * that is the point: `HELLO-15` expired two days ago and `NAPOLIRIDE` starts in two, so the
 * expired and not-yet-started refusals are reachable on purpose rather than by waiting.
 *
 * `claimable` is carried faithfully even though V1 has no claim flow — the column is the
 * difference between a code you may pass to a friend and one issued to you alone, and
 * seeding it wrong would make the promotions unit's first job to un-seed it.
 */
const COUPONS = [
  {
    id: 'cpn_referral_reward',
    code: 'REF-KX9F',
    title: 'Referral reward',
    description: 'Rezwana joined on your invite and placed her first order.',
    kind: 'FIXED',
    value: '200',
    maxDiscount: null,
    minOrder: '700',
    scope: 'PLATFORM',
    startsInDays: -4,
    endsInDays: 26,
    usageLimit: 1,
    firstOrderOnly: false,
    source: 'REFERRAL',
    claimable: false,
    vendorIds: [] as string[],
  },
  {
    id: 'cpn_late_apology',
    code: 'SORRY-150',
    title: 'Sorry your order ran late',
    description: 'Your Bangkok House order arrived 34 minutes past its estimate.',
    kind: 'FIXED',
    value: '150',
    maxDiscount: null,
    minOrder: '0',
    scope: 'PLATFORM',
    startsInDays: -2,
    endsInDays: 12,
    usageLimit: 1,
    firstOrderOnly: false,
    source: 'APOLOGY',
    claimable: false,
    vendorIds: [] as string[],
  },
  {
    id: 'cpn_birthday_delivery',
    code: 'BDAY-FREE',
    title: 'Birthday delivery, on us',
    description: 'No delivery fee on anything you order this week.',
    kind: 'FREE_DELIVERY',
    value: '0',
    maxDiscount: null,
    minOrder: '0',
    scope: 'PLATFORM',
    startsInDays: -1,
    endsInDays: 2,
    usageLimit: 2,
    firstOrderOnly: false,
    source: 'BIRTHDAY',
    claimable: false,
    vendorIds: [] as string[],
  },
  {
    id: 'cpn_loyalty_cashback',
    code: 'LOYAL-5',
    title: '5% back for a hundred orders',
    description: 'Every order this month pays 5% back into your wallet.',
    kind: 'CASHBACK',
    value: '5',
    maxDiscount: '250',
    minOrder: '500',
    scope: 'PLATFORM',
    startsInDays: -6,
    endsInDays: 24,
    usageLimit: 10,
    firstOrderOnly: false,
    source: 'LOYALTY',
    claimable: false,
    vendorIds: [] as string[],
  },
  {
    id: 'cpn_welcome_gift',
    code: 'HELLO-15',
    title: 'Welcome to FoodOra',
    description: '15% off your first week with us.',
    kind: 'PERCENTAGE',
    value: '15',
    maxDiscount: '200',
    minOrder: '400',
    scope: 'PLATFORM',
    startsInDays: -21,
    // Already over — the `expired` refusal has to be reachable in a demo.
    endsInDays: -2,
    usageLimit: 1,
    firstOrderOnly: false,
    source: 'WELCOME',
    claimable: false,
    vendorIds: [] as string[],
  },
  {
    id: 'cpn_ven_bella_lunch',
    code: 'BELLALUNCH',
    title: 'Lunch at Bella Napoli',
    description: '15% off pizzas ordered before 4pm.',
    kind: 'PERCENTAGE',
    value: '15',
    maxDiscount: '250',
    minOrder: '500',
    scope: 'VENDOR',
    startsInDays: -12,
    endsInDays: 18,
    usageLimit: 3,
    firstOrderOnly: false,
    source: 'VENDOR',
    claimable: true,
    vendorIds: ['ven_bella_napoli'],
  },
  {
    id: 'cpn_ven_bella_family',
    code: 'NAPOLI300',
    title: '\u09f3300 off a family order',
    description: 'Feeding the whole table? Take \u09f3300 off any order over \u09f32,000.',
    kind: 'FIXED',
    value: '300',
    maxDiscount: null,
    minOrder: '2000',
    scope: 'VENDOR',
    startsInDays: -30,
    endsInDays: -3,
    usageLimit: 1,
    firstOrderOnly: false,
    source: 'VENDOR',
    claimable: true,
    vendorIds: ['ven_bella_napoli'],
  },
  {
    id: 'cpn_ven_bella_freeship',
    code: 'NAPOLIRIDE',
    title: 'Free delivery week',
    description: "We're covering the rider for every Bella Napoli order this week.",
    kind: 'FREE_DELIVERY',
    value: '0',
    maxDiscount: null,
    minOrder: '700',
    scope: 'VENDOR',
    // Starts on Monday — so the `notStarted` refusal is reachable too.
    startsInDays: 2,
    endsInDays: 16,
    usageLimit: 2,
    firstOrderOnly: false,
    source: 'VENDOR',
    claimable: true,
    vendorIds: ['ven_bella_napoli'],
  },
] as const;

const DAY_MS = 86_400_000;

interface Counts {
  users: number;
  cuisines: number;
  categories: number;
  categoryKeywords: number;
  vendors: number;
  branches: number;
  branchHours: number;
  menus: number;
  sections: number;
  foods: number;
  optionGroups: number;
  options: number;
  coupons: number;
}

async function main(): Promise<void> {
  const data = loadDataset();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const hasher = app.get<PasswordHasherPort>(PASSWORD_HASHER, { strict: false });
  const db = prisma.db;

  const counts: Counts = {
    users: 0,
    cuisines: 0,
    categories: 0,
    categoryKeywords: 0,
    vendors: 0,
    branches: 0,
    branchHours: 0,
    menus: 0,
    sections: 0,
    foods: 0,
    optionGroups: 0,
    options: 0,
    coupons: 0,
  };

  // --- the reference data this depends on ------------------------------------
  // Checked rather than assumed: without it the first `user.create` fails on a foreign
  // key with a message that says nothing about which seeder was skipped.
  const countries = await db.country.findMany({ select: { code: true, timezone: true } });
  if (countries.length === 0) {
    throw new Error(
      'No rows in `countries`. Run `bun run seed:reference` first — `User.countryCode` and ' +
        '`VendorBranch.countryCode` are non-null foreign keys onto it.',
    );
  }
  const timezoneOf = new Map(countries.map((country) => [country.code, country.timezone]));

  // --- demo accounts --------------------------------------------------------
  // Before vendors, because `Vendor.ownerId` points at one of them.
  const passwordHash = await hasher.hash(DEMO_PASSWORD);

  for (const user of data.users) {
    const role = toEnum<$Enums.UserRoleSlug>(user.role);
    const verifiedAt = user.isVerified ? new Date(user.createdAt) : null;

    await db.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        primaryRole: role,
        countryCode: user.countryCode,
        currency: user.currency,
        locale: user.locale,
        timezone: timezoneOf.get(user.countryCode) ?? FALLBACK_TIMEZONE,
        emailVerifiedAt: verifiedAt,
        isVerified: user.isVerified,
        credential: { create: { passwordHash, algorithm: 'argon2id' } },
        // Mirrors `PrismaIdentityRepository.createAccount`: created eagerly so every
        // read of settings has a row rather than a null branch.
        settings: { create: {} },
      },
      // The password is **not** rewritten on a re-run. Somebody demonstrating the
      // platform may have changed it, and a seeder that silently resets a credential
      // is a seeder that locks them out mid-demo.
      update: {
        name: user.name,
        phone: user.phone,
        avatar: user.avatar,
        primaryRole: role,
        deletedAt: null,
      },
    });

    await assignRole(db, user.id, user.role);
    counts.users += 1;
  }

  // --- cuisines -------------------------------------------------------------
  for (const [index, cuisine] of data.cuisines.entries()) {
    await db.cuisine.upsert({
      where: { id: cuisine.id },
      create: {
        id: cuisine.id,
        slug: cuisine.slug,
        name: cuisine.name,
        emoji: cuisine.emoji,
        image: cuisine.image,
        sort: index,
      },
      update: {
        slug: cuisine.slug,
        name: cuisine.name,
        emoji: cuisine.emoji,
        image: cuisine.image,
        sort: index,
        deletedAt: null,
      },
    });
    counts.cuisines += 1;
  }

  // --- categories and their keywords ----------------------------------------
  for (const category of data.categories) {
    await db.category.upsert({
      where: { id: category.id },
      create: {
        id: category.id,
        slug: category.slug,
        name: category.name,
        emoji: category.emoji,
        image: category.image,
        sort: category.sort,
      },
      update: {
        slug: category.slug,
        name: category.name,
        emoji: category.emoji,
        image: category.image,
        sort: category.sort,
        deletedAt: null,
      },
    });
    counts.categories += 1;

    // Replaced wholesale: the frontend's `keywords: string[]` has no per-term data a
    // diff would preserve, and `CategoryKeyword` is not soft-deletable so `deleteMany`
    // is permitted here.
    await db.categoryKeyword.deleteMany({ where: { categoryId: category.id } });
    if (category.keywords.length > 0) {
      await db.categoryKeyword.createMany({
        data: category.keywords.map((term, index) => ({
          categoryId: category.id,
          term: term.toLowerCase(),
          // First term listed is the one the tile is really about, so it scores highest.
          weight: category.keywords.length - index,
        })),
      });
      counts.categoryKeywords += category.keywords.length;
    }
  }

  // --- vendors, branches, menus ---------------------------------------------
  for (const vendor of data.vendors) {
    if (vendor.deletedAt !== null) continue;

    const type = toEnum<$Enums.VendorTypeKind>(vendor.type);
    // `ownerId` is only written when the account actually exists; the mock's owner is
    // seeded above, but a hand-edited dataset naming an absent account should not fail
    // the whole run on a foreign key.
    const ownerId =
      vendor.ownerId && data.users.some((user) => user.id === vendor.ownerId)
        ? vendor.ownerId
        : null;

    const brand = {
      slug: vendor.slug,
      type,
      ownerId,
      name: vendor.name,
      tagline: vendor.tagline,
      description: vendor.description,
      logo: vendor.logo,
      cover: vendor.cover,
      priceLevel: vendor.priceLevel,
      currency: vendor.currency,
      status: 'ACTIVE' as const,
      rating: vendor.rating,
      reviewCount: vendor.reviewCount,
      isFeatured: vendor.isFeatured,
      isTrending: vendor.isTrending,
      promoLabel: vendor.promoLabel,
    };

    await db.vendor.upsert({
      where: { id: vendor.id },
      create: { id: vendor.id, ...brand },
      update: { ...brand, deletedAt: null },
    });
    counts.vendors += 1;

    await db.vendorCuisine.deleteMany({ where: { vendorId: vendor.id } });
    if (vendor.cuisineIds.length > 0) {
      await db.vendorCuisine.createMany({
        data: vendor.cuisineIds.map((cuisineId, index) => ({
          vendorId: vendor.id,
          cuisineId,
          sort: index,
        })),
      });
    }

    await db.vendorDietary.deleteMany({ where: { vendorId: vendor.id } });
    if (vendor.dietary.length > 0) {
      await db.vendorDietary.createMany({
        data: vendor.dietary.map((tag) => ({
          vendorId: vendor.id,
          tag: toEnum<$Enums.DietaryTagKind>(tag),
        })),
      });
    }

    // --- the primary branch -------------------------------------------------
    const branchId = vendor.id.replace(/^ven_/, 'brn_');
    const branch = {
      vendorId: vendor.id,
      isPrimary: true,
      name: vendor.name,
      slug: 'main',
      lat: vendor.location.lat,
      lng: vendor.location.lng,
      address: vendor.location.address,
      city: vendor.location.city,
      countryCode: vendor.location.countryCode,
      timezone: timezoneOf.get(vendor.location.countryCode) ?? FALLBACK_TIMEZONE,
      etaMinMinutes: vendor.etaMinutes[0],
      etaMaxMinutes: vendor.etaMinutes[1],
      deliveryFee: vendor.deliveryFee,
      minOrder: vendor.minOrder,
      freeDeliveryOver: vendor.freeDeliveryOver,
      /**
       * The mock's `isOpen` was a stored flag; the read model derives openness from the
       * hours instead. Mapping a mock `isOpen: false` onto the merchant's kill switch is
       * what keeps the seeded directory looking like the mock one — the alternative is a
       * vendor the mock showed as closed appearing open because its grid happens to
       * cover right now.
       */
      acceptingOrders: vendor.isOpen,
      status: 'ACTIVE' as const,
    };

    await db.vendorBranch.upsert({
      where: { id: branchId },
      create: { id: branchId, ...branch },
      update: { ...branch, deletedAt: null },
    });
    counts.branches += 1;

    await db.branchHour.deleteMany({ where: { branchId } });
    const hours = Object.entries(vendor.hours).map(([weekday, window]) => ({
      id: `bhr_${branchId.replace(/^brn_/, '')}_${weekday}`,
      branchId,
      weekday: toEnum<$Enums.WeekdayKind>(weekday),
      openTime: window.open,
      closeTime: window.close,
      // A close time at or before the open time is a service that runs past midnight.
      // `isOpenNow` re-derives this defensively, but the column should still be right.
      overnight: crossesMidnight(window),
      sort: 0,
    }));
    if (hours.length > 0) {
      await db.branchHour.createMany({ data: hours });
      counts.branchHours += hours.length;
    }

    // --- the delivery menu --------------------------------------------------
    const menuId = vendor.id.replace(/^ven_/, 'men_');
    await db.menu.upsert({
      where: { id: menuId },
      create: {
        id: menuId,
        vendorId: vendor.id,
        kind: 'DELIVERY',
        name: 'Delivery menu',
        isDefault: true,
        isActive: true,
      },
      update: { name: 'Delivery menu', isActive: true, deletedAt: null },
    });
    counts.menus += 1;

    // --- sections -----------------------------------------------------------
    for (const section of data.menuSections.filter((row) => row.vendorId === vendor.id)) {
      await db.menuSection.upsert({
        where: { id: section.id },
        create: {
          id: section.id,
          menuId,
          vendorId: vendor.id,
          name: section.name,
          sort: section.sort,
        },
        update: { menuId, name: section.name, sort: section.sort, isActive: true, deletedAt: null },
      });
      counts.sections += 1;
    }
  }

  // --- dishes ---------------------------------------------------------------
  // After every vendor and section, because a dish has a foreign key onto both.
  const sectionIds = new Set(data.menuSections.map((section) => section.id));

  for (const [index, food] of data.foods.entries()) {
    if (food.deletedAt !== null) continue;
    if (!sectionIds.has(food.sectionId)) {
      throw new Error(
        `Dish ${food.id} references section ${food.sectionId}, which the dataset does not ` +
          'contain. Re-run `bun run export:catalog` in frontend/.',
      );
    }

    const dish = {
      slug: food.slug,
      vendorId: food.vendorId,
      sectionId: food.sectionId,
      name: food.name,
      description: food.description,
      image: food.image,
      price: food.price,
      compareAtPrice: food.compareAtPrice,
      spicyLevel: food.spicyLevel,
      calories: food.calories,
      rating: food.rating,
      reviewCount: food.reviewCount,
      isPopular: food.isPopular,
      isAvailable: food.isAvailable,
      // The mock has no explicit order within a section, and insertion order is the
      // order it renders in — so index it, or the menu reshuffles on every read.
      sort: index,
    };

    await db.foodItem.upsert({
      where: { id: food.id },
      create: { id: food.id, ...dish },
      update: { ...dish, deletedAt: null },
    });
    counts.foods += 1;

    await db.foodDietary.deleteMany({ where: { foodId: food.id } });
    if (food.dietary.length > 0) {
      await db.foodDietary.createMany({
        data: food.dietary.map((tag) => ({
          foodId: food.id,
          tag: toEnum<$Enums.DietaryTagKind>(tag),
        })),
      });
    }

    // Upserted rather than replaced: `FoodOptionGroup` and `FoodOption` carry
    // `deletedAt`, and the soft-delete extension refuses `deleteMany` on those — a
    // hard delete would orphan the `order_item_options` rows that reference them.
    for (const [groupIndex, group] of food.optionGroups.entries()) {
      await db.foodOptionGroup.upsert({
        where: { id: group.id },
        create: {
          id: group.id,
          foodId: food.id,
          name: group.name,
          required: group.required,
          min: group.min,
          max: group.max,
          sort: groupIndex,
        },
        update: {
          name: group.name,
          required: group.required,
          min: group.min,
          max: group.max,
          sort: groupIndex,
          deletedAt: null,
        },
      });
      counts.optionGroups += 1;

      for (const [optionIndex, option] of group.options.entries()) {
        await db.foodOption.upsert({
          where: { id: option.id },
          create: {
            id: option.id,
            groupId: group.id,
            name: option.name,
            priceDelta: option.priceDelta,
            isDefault: optionIndex === 0 && group.required,
            sort: optionIndex,
          },
          update: {
            name: option.name,
            priceDelta: option.priceDelta,
            sort: optionIndex,
            isAvailable: true,
            deletedAt: null,
          },
        });
        counts.options += 1;
      }
    }
  }

  // --- coupons --------------------------------------------------------------
  // After vendors, because `CouponVendor.vendorId` is a foreign key onto them.
  const seededAt = Date.now();
  for (const coupon of COUPONS) {
    const startsAt = new Date(seededAt + coupon.startsInDays * DAY_MS);
    const endsAt = new Date(seededAt + coupon.endsInDays * DAY_MS);

    await db.coupon.upsert({
      where: { id: coupon.id },
      create: {
        id: coupon.id,
        code: coupon.code,
        title: coupon.title,
        description: coupon.description,
        kind: coupon.kind,
        value: coupon.value,
        maxDiscount: coupon.maxDiscount,
        minOrder: coupon.minOrder,
        // Every demo coupon is priced in the vendor's currency; the engine refuses a
        // mismatch, so seeding the wrong one would make every code look broken.
        currency: 'BDT',
        scope: coupon.scope,
        startsAt,
        endsAt,
        usageLimit: coupon.usageLimit,
        firstOrderOnly: coupon.firstOrderOnly,
        source: coupon.source,
        claimable: coupon.claimable,
        issuerVendorId: coupon.vendorIds[0] ?? null,
      },
      update: {
        title: coupon.title,
        description: coupon.description,
        kind: coupon.kind,
        value: coupon.value,
        maxDiscount: coupon.maxDiscount,
        minOrder: coupon.minOrder,
        scope: coupon.scope,
        // Re-stamped on every run: a demo opened next month needs live windows, and
        // `totalRedeemed` is deliberately NOT reset — that is usage, not configuration.
        startsAt,
        endsAt,
        usageLimit: coupon.usageLimit,
        firstOrderOnly: coupon.firstOrderOnly,
        claimable: coupon.claimable,
        deletedAt: null,
      },
    });

    for (const vendorId of coupon.vendorIds) {
      await db.couponVendor.upsert({
        where: { couponId_vendorId: { couponId: coupon.id, vendorId } },
        create: { couponId: coupon.id, vendorId },
        update: {},
      });
    }
    counts.coupons += 1;
  }

  await app.close();

  console.log(`✓ Demo catalog written (${data.generatedFrom}).`);
  console.table(counts);
  console.log(
    `\nEvery demo account signs in with "${DEMO_PASSWORD}" — and only on a first run:\n` +
      'a re-run leaves existing credentials alone rather than resetting a password\n' +
      'somebody changed mid-demo.',
  );
}

/**
 * Mirrors `primaryRole` into `UserRoleAssignment`, which is where permissions hang off —
 * the same thing registration does, and skipped the same way when the `Role` row is
 * missing. `primaryRole` is authoritative for the role *gate* regardless; what is
 * missing without this row is the permission set.
 */
async function assignRole(
  db: PrismaService['db'],
  userId: string,
  roleSlug: string,
): Promise<void> {
  const role = await db.role.findUnique({ where: { slug: roleSlug }, select: { id: true } });
  if (!role) {
    console.warn(
      `  ! no Role row for "${roleSlug}" — ${userId} has no role assignment. ` +
        'Run `bun run seed:reference` for permissions to resolve.',
    );
    return;
  }

  const existing = await db.userRoleAssignment.findFirst({
    where: { userId, roleId: role.id, vendorId: null },
    select: { id: true },
  });
  if (existing) return;

  await db.userRoleAssignment.create({
    data: { id: `ura_${userId.replace(/^usr_/, '')}`, userId, roleId: role.id, vendorId: null },
  });
}

function crossesMidnight(window: MockDayHours): boolean {
  if (!window.open || !window.close) return false;
  return window.close <= window.open;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

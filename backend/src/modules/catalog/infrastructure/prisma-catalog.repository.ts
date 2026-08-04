import { Inject, Injectable } from '@nestjs/common';

import { enumCodec, TransactionManager } from '../../../infrastructure/prisma';
import { type $Enums, Prisma } from '../../../infrastructure/prisma/generated';
import type { DietaryTag, VendorType, Weekday } from '../../../shared/enums';
import { CLOCK, type Clock } from '../../../shared/kernel';
import {
  type CatalogRepositoryPort,
  type CategoryRecord,
  type CuisineRecord,
  type FoodItemRecord,
  type FoodOptionGroupRecord,
  isOpenNow,
  type MenuSectionWithItemsRecord,
  type OpeningWindow,
  toWeeklyHours,
  type VendorCandidateFilter,
  type VendorRecord,
} from '../domain';

const vendorTypes = enumCodec<VendorType, $Enums.VendorTypeKind>('VendorTypeKind');
const dietaryTags = enumCodec<DietaryTag, $Enums.DietaryTagKind>('DietaryTagKind');
const weekdays = enumCodec<Weekday, $Enums.WeekdayKind>('WeekdayKind');

/**
 * The only file in the module that knows Prisma exists.
 *
 * Three conventions carried over from E3, each invisible until it bites:
 *
 * - **Nothing here opens a transaction.** `this.db` is the transaction's client when
 *   one is open and the plain one otherwise.
 * - **The soft-delete extension filters the top-level `where` only.** Nested reads —
 *   a vendor's branches, a section's dishes, a dish's option groups — are *not*
 *   filtered, so every nested relation below states `deletedAt: null` itself. Left
 *   implicit, the first symptom is a deleted dish reappearing on a live menu.
 * - **`Decimal` never leaves this file.** `.toNumber()` happens here rather than in the
 *   `Money` scalar for the read models, because a domain record typed `number` that
 *   actually holds a `Decimal` is a lie the type system will not catch — it only
 *   surfaces when someone writes `price * quantity` and gets `NaN`.
 */
@Injectable()
export class PrismaCatalogRepository implements CatalogRepositoryPort {
  constructor(
    private readonly transactions: TransactionManager,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private get db() {
    return this.transactions.client;
  }

  // --- browse rails ---------------------------------------------------------

  async listCuisines(): Promise<CuisineRecord[]> {
    const rows = await this.db.cuisine.findMany({
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        emoji: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });
    return rows;
  }

  async listCategories(): Promise<CategoryRecord[]> {
    const rows = await this.db.category.findMany({
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        emoji: true,
        image: true,
        sort: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        keywords: {
          select: { term: true, weight: true },
          orderBy: [{ weight: 'desc' }, { term: 'asc' }],
        },
      },
    });

    return rows.map(({ keywords, ...category }) => ({
      ...category,
      keywords: keywords.map((keyword) => keyword.term),
    }));
  }

  // --- vendors --------------------------------------------------------------

  async listVendorCandidates(filter: VendorCandidateFilter): Promise<VendorRecord[]> {
    const rows = await this.db.vendor.findMany({
      where: {
        status: 'ACTIVE',
        ...(filter.type ? { type: vendorTypes.toDb(filter.type) } : {}),
        ...(filter.cuisineId ? { cuisines: { some: { cuisineId: filter.cuisineId } } } : {}),
        ...(filter.search
          ? {
              OR: [
                { name: { contains: filter.search, mode: 'insensitive' } },
                { tagline: { contains: filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
        // A storefront with no live location cannot be listed: the frontend's
        // `Vendor` has a non-null `location`, and there is nowhere to deliver from.
        branches: { some: { isPrimary: true, deletedAt: null, status: 'ACTIVE' } },
      },
      // Rating-first so that a candidate set truncated by the cap holds the best
      // rows rather than arbitrary ones. `id` breaks ties, so the set is stable
      // across identical requests.
      orderBy: [{ rating: 'desc' }, { id: 'asc' }],
      take: filter.limit,
      select: vendorSelect(this.startOfYesterday()),
    });

    return rows.map((row) => this.toVendor(row));
  }

  async findVendorBySlug(slug: string): Promise<VendorRecord | null> {
    const row = await this.db.vendor.findUnique({ where: { slug }, select: vendorSelect(this.startOfYesterday()) });
    if (!row || row.status !== 'ACTIVE') return null;
    // The detail page needs a location as much as the card does.
    return row.branches.length > 0 ? this.toVendor(row) : null;
  }

  /**
   * By id, for `CatalogReaderPort` — the cart's only way in.
   *
   * Same `status`/branch conditions as the slug lookup, deliberately: a cart must not be
   * able to hold a storefront the directory refuses to show. The alternative is a basket
   * that survives a vendor's suspension and fails at checkout, which is the worst place
   * to discover it.
   */
  async findVendorById(vendorId: string): Promise<VendorRecord | null> {
    const row = await this.db.vendor.findUnique({
      where: { id: vendorId },
      select: vendorSelect(this.startOfYesterday()),
    });
    if (!row || row.status !== 'ACTIVE') return null;
    return row.branches.length > 0 ? this.toVendor(row) : null;
  }

  /** By id, for `CatalogReaderPort`. Availability is the caller's rule, not this one's. */
  async findFoodById(foodId: string): Promise<FoodItemRecord | null> {
    const row = await this.db.foodItem.findUnique({ where: { id: foodId }, select: FOOD_SELECT });
    return row ? this.toFood(row) : null;
  }

  async listVendorsByFlag(flag: 'featured' | 'trending', limit: number): Promise<VendorRecord[]> {
    const rows = await this.db.vendor.findMany({
      where: {
        status: 'ACTIVE',
        ...(flag === 'featured' ? { isFeatured: true } : { isTrending: true }),
        branches: { some: { isPrimary: true, deletedAt: null, status: 'ACTIVE' } },
      },
      orderBy: [{ rating: 'desc' }, { id: 'asc' }],
      take: limit,
      select: vendorSelect(this.startOfYesterday()),
    });
    return rows.map((row) => this.toVendor(row));
  }

  // --- menu -----------------------------------------------------------------

  /**
   * One query for the whole menu, four levels deep: menu → sections → dishes →
   * option groups → options.
   *
   * Deliberately not five round trips and not a DataLoader: this is a single
   * vendor's menu, the nesting is bounded by the schema rather than by the request,
   * and Prisma issues one query per level regardless — so the alternative buys
   * nothing and costs the ordering guarantees that `orderBy` gives here.
   */
  async listVendorMenu(vendorId: string): Promise<MenuSectionWithItemsRecord[]> {
    const menu = await this.db.menu.findFirst({
      where: { vendorId, kind: 'DELIVERY', isActive: true },
      // A vendor should have exactly one default delivery menu; if a second exists,
      // the default wins rather than whichever row came back first.
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: {
        sections: {
          where: { deletedAt: null, isActive: true },
          orderBy: [{ sort: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            vendorId: true,
            name: true,
            sort: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
            foods: {
              where: { deletedAt: null },
              orderBy: [{ sort: 'asc' }, { name: 'asc' }],
              select: FOOD_SELECT,
            },
          },
        },
      },
    });

    if (!menu) return [];

    return menu.sections.map(({ foods, ...section }) => ({
      ...section,
      items: foods.map((food) => this.toFood(food)),
    }));
  }

  async listPopularFoods(vendorId: string, limit: number): Promise<FoodItemRecord[]> {
    const rows = await this.db.foodItem.findMany({
      where: { vendorId, isPopular: true },
      orderBy: [{ rating: 'desc' }, { id: 'asc' }],
      take: limit,
      select: FOOD_SELECT,
    });
    return rows.map((row) => this.toFood(row));
  }

  async findFoodBySlug(slug: string): Promise<FoodItemRecord | null> {
    const row = await this.db.foodItem.findUnique({ where: { slug }, select: FOOD_SELECT });
    return row ? this.toFood(row) : null;
  }

  /**
   * A day's grace on either side of "today", because the branch's calendar date may
   * be ahead of or behind UTC. `isOpenNow` does the exact comparison in the branch's
   * own timezone; this only has to avoid discarding a row it will need.
   */
  private startOfYesterday(): Date {
    return new Date(this.clock.now() - 24 * 60 * 60 * 1000);
  }

  private toVendor(row: VendorRow): VendorRecord {
    const branch = row.branches[0];
    if (!branch) {
      // Callers filter on `branches: { some: ... }`, so reaching this means the
      // filter and the select disagree — a bug, not a data condition.
      throw new Error(`Vendor ${row.id} was selected without its primary branch.`);
    }

    const windows: OpeningWindow[] = branch.hours.map((hour) => ({
      weekday: weekdays.toWire(hour.weekday),
      openTime: hour.openTime,
      closeTime: hour.closeTime,
      overnight: hour.overnight,
      sort: hour.sort,
    }));

    return {
      id: row.id,
      slug: row.slug,
      type: vendorTypes.toWire(row.type),
      ownerId: row.ownerId,
      name: row.name,
      tagline: row.tagline,
      description: row.description,
      logo: row.logo,
      cover: row.cover,
      cuisineIds: row.cuisines.map((link) => link.cuisineId),
      dietary: row.dietary.map((link) => dietaryTags.toWire(link.tag)),
      priceLevel: row.priceLevel,
      rating: row.rating.toNumber(),
      reviewCount: row.reviewCount,
      location: {
        lat: branch.lat.toNumber(),
        lng: branch.lng.toNumber(),
        address: branch.address,
        city: branch.city,
        countryCode: branch.countryCode,
      },
      // Filled in by the service, which is the layer that knows the caller's origin.
      distanceKm: 0,
      etaMinutes: [branch.etaMinMinutes, branch.etaMaxMinutes],
      deliveryFee: branch.deliveryFee.toNumber(),
      minOrder: branch.minOrder.toNumber(),
      freeDeliveryOver: branch.freeDeliveryOver?.toNumber() ?? null,
      hours: toWeeklyHours(windows),
      isOpen: isOpenNow(
        {
          timezone: branch.timezone,
          acceptingOrders: branch.acceptingOrders,
          pausedUntil: branch.pausedUntil,
          isActive: branch.status === 'ACTIVE',
          windows,
          closures: branch.closures,
        },
        this.clock.date(),
      ),
      isFeatured: row.isFeatured,
      isTrending: row.isTrending,
      promoLabel: row.promoLabel,
      currency: row.currency,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }

  private toFood(row: FoodRow): FoodItemRecord {
    const groups: FoodOptionGroupRecord[] = row.optionGroups.map((group) => ({
      id: group.id,
      name: group.name,
      required: group.required,
      min: group.min,
      max: group.max,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: option.priceDelta.toNumber(),
      })),
    }));

    return {
      id: row.id,
      slug: row.slug,
      vendorId: row.vendorId,
      sectionId: row.sectionId,
      name: row.name,
      description: row.description,
      image: row.image,
      price: row.price.toNumber(),
      compareAtPrice: row.compareAtPrice?.toNumber() ?? null,
      dietary: row.dietary.map((link) => dietaryTags.toWire(link.tag)),
      spicyLevel: row.spicyLevel,
      calories: row.calories,
      rating: row.rating.toNumber(),
      reviewCount: row.reviewCount,
      isPopular: row.isPopular,
      /**
       * The merchant's switch, and only that.
       *
       * `catalog.prisma` documents the eventual rule as `isAvailable AND (inventory
       * is null OR inventory.inStock)` — a tracked dish at zero available is off the
       * menu whether or not anyone toggled it. That second half needs the inventory
       * module, which is explicitly out of Unit 1's scope, and half a stock rule is
       * worse than none: it would read as enforced while a branch with no
       * `InventoryItem` row silently bypassed it. The join belongs in the unit that
       * owns the writes keeping `reserved` honest.
       */
      isAvailable: row.isAvailable,
      optionGroups: groups,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }

}

/**
 * The two `select`s, and the row types derived from them.
 *
 * `Prisma.validator` rather than a bare object literal, because `select` is checked
 * against `Exact<>`: an object literal assigned through a method's inferred return
 * type widens `true` to `boolean` and Prisma rejects it, while `as const` makes the
 * `orderBy` arrays `readonly` and Prisma rejects that too. The validator threads the
 * literal type through untouched — and then `GetPayload` derives the row shape from
 * the same constant, so the mapper below cannot disagree with what was fetched.
 */

/**
 * `isPrimary` with `take: 1`: the partial unique index in
 * `20260803120100_v1_partial_unique_indexes` is what makes "exactly one primary
 * branch" true, so taking one row is not a guess.
 *
 * `closuresFrom` is a parameter rather than a literal because the bound depends on
 * the clock, and no query in this repository reads the wall clock for itself.
 */
const vendorSelect = (closuresFrom: Date) =>
  Prisma.validator<Prisma.VendorSelect>()({
    id: true,
    slug: true,
    type: true,
    ownerId: true,
    name: true,
    tagline: true,
    description: true,
    logo: true,
    cover: true,
    priceLevel: true,
    currency: true,
    status: true,
    rating: true,
    reviewCount: true,
    isFeatured: true,
    isTrending: true,
    promoLabel: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
    cuisines: { select: { cuisineId: true }, orderBy: { sort: 'asc' } },
    dietary: { select: { tag: true } },
    branches: {
      where: { isPrimary: true, deletedAt: null },
      take: 1,
      select: {
        lat: true,
        lng: true,
        address: true,
        city: true,
        countryCode: true,
        timezone: true,
        etaMinMinutes: true,
        etaMaxMinutes: true,
        deliveryFee: true,
        minOrder: true,
        freeDeliveryOver: true,
        acceptingOrders: true,
        pausedUntil: true,
        status: true,
        hours: {
          select: { weekday: true, openTime: true, closeTime: true, overnight: true, sort: true },
          orderBy: { sort: 'asc' },
        },
        // Only closures that could still be in force. Bounded here rather than fetched
        // whole, because a branch open for five years has five years of holidays and
        // none of them affect today.
        closures: {
          where: { toDate: { gte: closuresFrom } },
          select: { fromDate: true, toDate: true },
        },
      },
    },
  });

const FOOD_SELECT = Prisma.validator<Prisma.FoodItemSelect>()({
  id: true,
  slug: true,
  vendorId: true,
  sectionId: true,
  name: true,
  description: true,
  image: true,
  price: true,
  compareAtPrice: true,
  spicyLevel: true,
  calories: true,
  rating: true,
  reviewCount: true,
  isPopular: true,
  isAvailable: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  dietary: { select: { tag: true } },
  optionGroups: {
    where: { deletedAt: null },
    orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      required: true,
      min: true,
      max: true,
      options: {
        where: { deletedAt: null, isAvailable: true },
        orderBy: [{ sort: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, priceDelta: true },
      },
    },
  },
});

type VendorRow = Prisma.VendorGetPayload<{ select: ReturnType<typeof vendorSelect> }>;
type FoodRow = Prisma.FoodItemGetPayload<{ select: typeof FOOD_SELECT }>;

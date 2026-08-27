/**
 * repository.js — every catalog read, and no rule about what any of them mean.
 *
 * The same split module 2 and 3 use: Prisma vocabulary lives here, the product's
 * lives in `service.js`. A `where` clause, a `select`, an `orderBy` and the enum
 * translation on the way in are this file's business; what "open now" means and
 * who may see a `pending` storefront are not.
 *
 * ## Three things this file has to remember for the whole module
 *
 *  - **Nested relations are not soft-delete filtered.** `plugins/prisma.js` says
 *    so explicitly: the query extension sees the top-level model only. Every
 *    `include`/`select` of a soft-deletable relation below therefore carries its
 *    own `deletedAt: null` — a deleted branch rendered as a vendor's address is
 *    exactly the leak `main.prisma` §3 is about.
 *  - **A vendor is a brand plus its primary branch.** `catalog.prisma`'s one
 *    deliberate structural change: the frontend's flat `Vendor` is `Vendor` +
 *    `VendorBranch`, and every projection needs the pair. A vendor whose primary
 *    branch is missing or deleted cannot be projected at all, so the listing
 *    `where` requires one to exist.
 *  - **Enums go in as identifiers.** `main.prisma` §6: `where: { status: "active" }`
 *    is rejected by the client. `toDbEnum` is applied to every enum value this
 *    file puts into a query, and `toApiEnum` on the way out is the service's job.
 */
import { toDbEnum } from "../../shared/utils/enums.js";

/** Statuses a `Vendor` or a `VendorBranch` may hold and still be discoverable. */
export const PUBLIC_STATUSES = Object.freeze(["active", "paused"]);

const dbStatuses = (statuses) => statuses.map((status) => toDbEnum("VendorStatus", status));

/** `Cuisine`, as `types/catalog.ts::Cuisine` selects it. */
const CUISINE_SELECT = Object.freeze({
  id: true,
  slug: true,
  name: true,
  emoji: true,
  image: true,
  sort: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

/** `Category` — `keywords` is the normalised table projected back to a string array. */
const CATEGORY_SELECT = Object.freeze({
  id: true,
  slug: true,
  name: true,
  emoji: true,
  image: true,
  sort: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  keywords: { select: { term: true, weight: true }, orderBy: [{ weight: "desc" }, { term: "asc" }] },
});

/**
 * Everything one vendor card or page needs, in one query.
 *
 * `relationJoins` is on in the generator, so this is a single statement rather
 * than the N+1 the same shape would cost through separate reads.
 *
 * `closures` is bounded to a three-day window around the instant asked about:
 * a branch may carry years of holiday history, `isOpen` only ever consults today,
 * and "today" in a branch's own timezone is at most fourteen hours from ours.
 * `commissionRate` is deliberately **not** selected — see `service.js`.
 */
function vendorSelect({ branchStatuses, closureFrom, closureTo }) {
  return {
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

    cuisines: {
      where: { cuisine: { deletedAt: null } },
      select: { cuisineId: true, sort: true },
      orderBy: [{ sort: "asc" }, { cuisineId: "asc" }],
    },
    dietary: { select: { tag: true }, orderBy: { tag: "asc" } },

    branches: {
      where: {
        isPrimary: true,
        deletedAt: null,
        ...(branchStatuses ? { status: { in: dbStatuses(branchStatuses) } } : {}),
      },
      take: 1,
      select: {
        id: true,
        lat: true,
        lng: true,
        address: true,
        area: true,
        city: true,
        countryCode: true,
        timezone: true,
        etaMinMinutes: true,
        etaMaxMinutes: true,
        deliveryFee: true,
        minOrder: true,
        freeDeliveryOver: true,
        deliveryRadiusKm: true,
        supportsDelivery: true,
        supportsPickup: true,
        acceptingOrders: true,
        pausedUntil: true,
        status: true,
        hours: {
          select: { weekday: true, openTime: true, closeTime: true, overnight: true, sort: true },
          orderBy: [{ sort: "asc" }],
        },
        closures: {
          where: { fromDate: { lte: closureTo }, toDate: { gte: closureFrom } },
          select: { fromDate: true, toDate: true },
        },
      },
    },
  };
}

/**
 * The `where` for a discovery listing, from the normalised filter `service.js` built.
 *
 * Only what SQL can decide. `openNow`, delivery radius and distance need the
 * branch's timezone and the caller's coordinates, so they are applied after the
 * rows arrive — see `service.js`'s two paths.
 */
function vendorWhere(filter) {
  const where = {
    status: { in: dbStatuses(filter.statuses) },
    // A brand with no primary branch cannot be projected into the read model,
    // so it is not a listing that was filtered out — it is not a listing.
    branches: {
      some: {
        isPrimary: true,
        deletedAt: null,
        status: { in: dbStatuses(filter.branchStatuses) },
      },
    },
  };

  /** Everything that has to be true at once. Collected here and attached once, below. */
  const and = [];

  if (filter.type) where.type = toDbEnum("VendorTypeKind", filter.type);
  if (filter.cuisineIds?.length) {
    // Every id, not any — the same rule as `dietary` below, and for the same
    // reason: `?cuisineId=…&cuisine=…` naming two different cuisines should
    // narrow to the vendors that are both, not widen to the union. The frontend
    // sends at most one, so this is about which way the surprise falls.
    and.push(...filter.cuisineIds.map((cuisineId) => ({ cuisines: { some: { cuisineId } } })));
  }
  if (filter.dietary?.length) {
    // Every tag, not any: a filter that widened as you added tags to it would be
    // the opposite of what the facet list does on the results page.
    and.push(
      ...filter.dietary.map((tag) => ({ dietary: { some: { tag: toDbEnum("DietaryTagKind", tag) } } })),
    );
  }
  if (filter.maxPriceLevel) where.priceLevel = { lte: filter.maxPriceLevel };
  if (filter.minRating) where.rating = { gte: filter.minRating };
  if (filter.offersOnly) and.push({ NOT: { promoLabel: null } });
  if (filter.isFeatured) where.isFeatured = true;
  if (filter.isTrending) where.isTrending = true;

  // Branch-level facets. Expressed against the primary branch, which is the one
  // the read model shows — `some` with `isPrimary` rather than a bare `some`,
  // or a second location's free delivery would sell the first one's.
  const branchFacets = {};
  if (filter.freeDelivery) branchFacets.freeDeliveryOver = { not: null };
  if (filter.maxEtaMinutes) branchFacets.etaMinMinutes = { lte: filter.maxEtaMinutes };
  if (filter.supportsDelivery) branchFacets.supportsDelivery = true;
  if (filter.supportsPickup) branchFacets.supportsPickup = true;
  if (Object.keys(branchFacets).length > 0) {
    and.push({
      branches: {
        some: {
          isPrimary: true,
          deletedAt: null,
          status: { in: dbStatuses(filter.branchStatuses) },
          ...branchFacets,
        },
      },
    });
  }

  // Free text: every term has to match somewhere. `contains` with
  // `mode: "insensitive"` is an ILIKE — see the M4 doc on why a trigram index is
  // named as the eventual answer rather than added here.
  for (const term of filter.terms ?? []) and.push({ OR: haystack(term) });

  // A category tile behaves like a query over its keywords: *any* of them, since
  // "pizza" and "margherita" are alternatives, not requirements.
  if (filter.keywords?.length) {
    and.push({ OR: filter.keywords.flatMap((keyword) => haystack(keyword)) });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

/** The fields a term is matched against — the vendor's own prose and its cuisines. */
function haystack(term) {
  const contains = { contains: term, mode: "insensitive" };
  return [
    { name: contains },
    { tagline: contains },
    { description: contains },
    { cuisines: { some: { cuisine: { name: contains, deletedAt: null } } } },
  ];
}

/**
 * `orderBy` for the sorts SQL can do.
 *
 * `delivery-time`, `distance` and `relevance` are absent on purpose: the first
 * orders by a column on a to-many relation, which Prisma cannot express, and the
 * other two are computed per request. `service.js` sorts those in memory and says
 * so.
 */
const SQL_ORDER = Object.freeze({
  recommended: [{ isFeatured: "desc" }, { rating: "desc" }, { reviewCount: "desc" }, { id: "asc" }],
  rating: [{ rating: "desc" }, { reviewCount: "desc" }, { id: "asc" }],
  "price-low": [{ priceLevel: "asc" }, { rating: "desc" }, { id: "asc" }],
  "price-high": [{ priceLevel: "desc" }, { rating: "desc" }, { id: "asc" }],
});

/** Whether a sort can be pushed into PostgreSQL. */
export const isSqlSort = (sort) => Object.hasOwn(SQL_ORDER, sort);

export function createRepository(prisma) {
  return {
    // -- Taxonomy -----------------------------------------------------------
    listCuisines: () =>
      prisma.cuisine.findMany({ select: CUISINE_SELECT, orderBy: [{ sort: "asc" }, { name: "asc" }] }),

    findCuisineBySlug: (slug) => prisma.cuisine.findUnique({ where: { slug }, select: CUISINE_SELECT }),

    listCategories: () =>
      prisma.category.findMany({ select: CATEGORY_SELECT, orderBy: [{ sort: "asc" }, { name: "asc" }] }),

    findCategoryBySlug: (slug) => prisma.category.findUnique({ where: { slug }, select: CATEGORY_SELECT }),

    /** Suggestion source: the taxonomy names, cheap enough to read whole. */
    listTaxonomyNames: async () => {
      const [cuisines, categories] = await Promise.all([
        prisma.cuisine.findMany({ select: { name: true, sort: true }, orderBy: { sort: "asc" } }),
        prisma.category.findMany({ select: { name: true, sort: true }, orderBy: { sort: "asc" } }),
      ]);
      return { cuisines, categories };
    },

    // -- Vendors ------------------------------------------------------------
    countVendors: (filter) => prisma.vendor.count({ where: vendorWhere(filter) }),

    /**
     * A page of vendors, or a scan of them.
     *
     * `skip`/`take` when the whole query is expressible in SQL; a bounded scan
     * with no `skip` when a derived filter or sort has to run first. The caller
     * decides which, because the caller is the one that knows whether `openNow`
     * was asked for.
     */
    findVendors: (filter, { orderBy, skip, take, closureFrom, closureTo }) =>
      prisma.vendor.findMany({
        where: vendorWhere(filter),
        select: vendorSelect({ branchStatuses: filter.branchStatuses, closureFrom, closureTo }),
        ...(orderBy ? { orderBy } : {}),
        ...(skip === undefined ? {} : { skip }),
        ...(take === undefined ? {} : { take }),
      }),

    /**
     * One vendor by slug, in **any** status, with its primary branch in any status.
     *
     * Deliberately unfiltered by status: whether this caller may see a `pending`
     * storefront is an authorization question, and answering it needs the row
     * first. Soft deletion is still absolute — the extension filters `deletedAt`
     * and nothing in this module bypasses it, so a deleted vendor is a 404 for
     * everyone including a super-admin.
     */
    findVendorBySlug: (slug, { closureFrom, closureTo }) =>
      prisma.vendor.findUnique({
        where: { slug },
        select: vendorSelect({ branchStatuses: null, closureFrom, closureTo }),
      }),

    /** Vendor names for type-ahead. Ordered by rating so the best match of equals wins. */
    findVendorNames: (filter, { take }) =>
      prisma.vendor.findMany({
        where: vendorWhere(filter),
        select: { name: true, slug: true, rating: true },
        orderBy: [{ rating: "desc" }, { reviewCount: "desc" }],
        take,
      }),

    /** The `orderBy` for a SQL-sortable sort. Exposed so the service can ask once. */
    orderFor: (sort) => SQL_ORDER[sort] ?? SQL_ORDER.recommended,
  };
}

export default createRepository;

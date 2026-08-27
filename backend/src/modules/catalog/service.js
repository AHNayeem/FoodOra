/**
 * service.js — discovery, and the two fields that are never stored.
 *
 * The module's whole job, in the order a request meets it:
 *
 *   normalise the query  →  what SQL can filter  →  read
 *   →  project brand + primary branch into the frontend's flat `Vendor`
 *   →  derive `isOpen` and `distanceKm`
 *   →  apply the filters and sorts that need those two
 *   →  page
 *
 * ## Why there are two paths and not one
 *
 * `openNow` and `distanceKm` cannot be expressed in the query. "Open" needs the
 * branch's weekly grid read in the branch's own timezone (`hours.js`), and
 * "distance" needs the caller's coordinates (`geo.js`) — which is exactly why
 * `catalog.prisma` refuses to store either. So:
 *
 *  - **the paged path**, when everything asked for is expressible: `WHERE` +
 *    `ORDER BY` + `LIMIT/OFFSET`, one `count`, and PostgreSQL does the work;
 *  - **the scan path**, when `openNow`, a delivery-radius filter or a
 *    `delivery-time`/`distance`/`relevance` sort is asked for: read the filtered
 *    candidates up to `CATALOG_SCAN_LIMIT`, derive, filter, sort and page in
 *    memory.
 *
 * The scan path is bounded and **says when it truncated** rather than quietly
 * reporting a short total: a cap nobody can see is a wrong answer that looks
 * right. At the catalogue sizes this product has (tens to hundreds of
 * storefronts per city) the bound is never reached; the log line is what tells us
 * the day it is, and the M4 doc names the two changes that would replace it.
 *
 * ## What is *not* in the read model
 *
 * `Vendor.commissionRate` exists in `types/catalog.ts` and is not selected, let
 * alone returned. A negotiated rate is a term of a merchant's contract, and a
 * public discovery endpoint that carries it hands every competitor the
 * platform's pricing. The frontend's own live selection set
 * (`lib/graphql/catalog.operations.ts::VENDOR_FIELDS`) already omits it, and the
 * surfaces that legitimately need it — the merchant's statement, admin
 * settlement — belong to module 12. See M4 §"Frontend contract".
 */
import { badRequest, forbidden, notFound, unauthenticated } from "../../shared/errors/app-error.js";
import { toApiEnum } from "../../shared/utils/enums.js";
import { toJsonSafe } from "../../shared/utils/serialize.js";
import { toSkipTake } from "../../shared/utils/pagination.js";
import { distanceKm as haversineKm, toPoint } from "./geo.js";
import { foldWeeklyHours, isOpenNow } from "./hours.js";
import { PUBLIC_STATUSES, isSqlSort } from "./repository.js";

/**
 * The viewer a caller gets when nobody built one.
 *
 * A default rather than a required argument, and deliberately the *narrow* one:
 * a call site that forgets to resolve the caller's rights should see the public
 * catalogue, not everything. `controller.js` always passes a real one.
 */
const PUBLIC_VIEWER = Object.freeze({ userId: null, canSeeAll: false, canAccessVendor: async () => false });

/**
 * The permission named in a refusal of `?includeHidden=true`.
 *
 * Stated as a constant because it appears in an error body a client may render,
 * and `index.js` passes the same slug to the controller as the one the viewer is
 * checked against. Two spellings of it would make the refusal name a permission
 * that was never asked for.
 */
export const VIEW_ALL_PERMISSION = "restaurants.view";

/** Every `VendorStatus`, for the desk that is allowed to see all of them. */
export const ALL_STATUSES = Object.freeze(["draft", "pending", "active", "paused", "rejected", "suspended"]);

/** The sorts the API accepts — `VendorQuery.sort` ∪ `SearchSort`, from the frontend. */
export const SORTS = Object.freeze([
  "recommended",
  "relevance",
  "rating",
  "delivery-time",
  "distance",
  "price-low",
  "price-high",
]);

/** One local day either side of the instant asked about — see the repository. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Split a raw query into terms, exactly as `services/search.ts::terms` does.
 *
 * Single characters are dropped there and dropped here: a one-letter `contains`
 * matches most of the catalogue and is never what somebody meant to type.
 */
export function terms(q) {
  return String(q ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1)
    .slice(0, 8);
}

/**
 * Relevance weight for a vendor.
 *
 * The frontend's `vendorScore`, copied rather than reinvented: the live path and
 * the mock path have to order the same results the same way, or switching
 * `LIVE.catalog` changes what the first card is and looks like a bug in whichever
 * one is running.
 */
function relevanceScore(model, scoreTerms) {
  const name = model.name.toLowerCase();
  const tagline = model.tagline.toLowerCase();
  let score = 0;
  for (const term of scoreTerms) {
    if (name === term) score += 100;
    else if (name.startsWith(term)) score += 60;
    else if (name.includes(term)) score += 40;
    if (tagline.includes(term)) score += 15;
  }
  if (model.isFeatured) score += 8;
  if (model.isTrending) score += 4;
  if (model.isOpen) score += 3;
  return score + model.rating;
}

const byNumber = (pick, direction = 1) => (a, b) => (pick(a) - pick(b)) * direction;

/** Nulls last, whichever way the sort runs — an unknown distance is not "nearest". */
const byDistance = (a, b) => {
  const left = a.model.distanceKm;
  const right = b.model.distanceKm;
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
};

export function createService({ repo, scanLimit = 500, log = null }) {
  // ---------------------------------------------------------------------------
  // Projection — brand + primary branch → the frontend's flat `Vendor`
  // ---------------------------------------------------------------------------

  /**
   * `CatalogService.toVendorModel(vendor, branch)`, as `catalog.prisma` names it.
   *
   * Returns the read model **and** the two things a derived filter needs that the
   * read model does not carry: the branch's delivery radius and its id. Keeping
   * them beside the model rather than in it is what stops a field the frontend
   * never asked for from reaching the wire.
   *
   * A vendor with no primary branch is `null`: there is no address, no hours and
   * no fees to show, so there is nothing to render. The caller logs it — it means
   * a storefront was minted without a location, which is an onboarding bug and
   * not something to paper over here.
   */
  function project(vendor, { origin, now }) {
    const [branch] = vendor.branches ?? [];
    if (!branch) return null;

    const status = toApiEnum("VendorStatus", vendor.status);
    const branchStatus = toApiEnum("VendorStatus", branch.status);
    const hours = (branch.hours ?? []).map((row) => ({
      ...row,
      weekday: toApiEnum("WeekdayKind", row.weekday),
    }));

    const open = isOpenNow({
      vendorStatus: status,
      branch: { ...branch, status: branchStatus },
      hours,
      closures: branch.closures ?? [],
      now,
    });

    if (open.local.fellBackToUtc) {
      log?.warn?.(
        { vendorId: vendor.id, branchId: branch.id, timezone: branch.timezone },
        "catalog: branch timezone is not a zone this runtime knows — read as UTC",
      );
    }

    const point = toPoint(branch.lat, branch.lng);
    const model = toJsonSafe({
      id: vendor.id,
      slug: vendor.slug,
      type: toApiEnum("VendorTypeKind", vendor.type),
      ownerId: vendor.ownerId,
      name: vendor.name,
      tagline: vendor.tagline,
      description: vendor.description,
      logo: vendor.logo,
      cover: vendor.cover,
      cuisineIds: (vendor.cuisines ?? []).map((row) => row.cuisineId),
      dietary: (vendor.dietary ?? []).map((row) => toApiEnum("DietaryTagKind", row.tag)),
      priceLevel: vendor.priceLevel,
      rating: vendor.rating,
      reviewCount: vendor.reviewCount,
      location: {
        lat: branch.lat,
        lng: branch.lng,
        address: branch.address,
        city: branch.city,
        countryCode: branch.countryCode,
      },
      /** Null, never 0, when the caller sent no coordinates. See `geo.js`. */
      distanceKm: haversineKm(origin, point),
      etaMinutes: [branch.etaMinMinutes, branch.etaMaxMinutes],
      deliveryFee: branch.deliveryFee,
      minOrder: branch.minOrder,
      freeDeliveryOver: branch.freeDeliveryOver,
      hours: foldWeeklyHours(hours),
      isOpen: open.open,
      isFeatured: vendor.isFeatured,
      isTrending: vendor.isTrending,
      promoLabel: vendor.promoLabel,
      currency: vendor.currency,
      createdAt: vendor.createdAt.toISOString(),
      updatedAt: vendor.updatedAt.toISOString(),
      deletedAt: vendor.deletedAt ? vendor.deletedAt.toISOString() : null,
    });

    return {
      model,
      /** Straight-line km beyond which this branch does not deliver. */
      radiusKm: Number(branch.deliveryRadiusKm),
      branchId: branch.id,
      status,
      branchStatus,
      closedBecause: open.reason,
    };
  }

  // ---------------------------------------------------------------------------
  // Query normalisation
  // ---------------------------------------------------------------------------

  /**
   * The wire query → the filter the repository speaks, with the facet slugs
   * resolved to rows.
   *
   * A `cuisine`/`category` slug that names nothing is **not** an error: the
   * results page renders "no results for X" perfectly well, and a 404 on a stale
   * bookmark from a renamed tile would be a worse answer than an empty list. It
   * must still narrow to *nothing*, though — a typo that silently showed the whole
   * directory would be the worse failure of the two.
   *
   * The resolved rows themselves are not returned. `SearchResults.category` and
   * `.cuisine` exist so the page can show a heading, and the page already holds
   * both lists from `/cuisines` and `/categories` — so resolving a slug a second
   * time here would be an endpoint field nothing reads.
   */
  async function normalise(query, { viewer }) {
    const sort = SORTS.includes(query.sort) ? query.sort : "recommended";
    const origin = toPoint(query.lat, query.lng);

    if (sort === "distance" && !origin) {
      throw badRequest("sort=distance needs the caller's coordinates — pass lat and lng");
    }
    if (query.deliverable && !origin) {
      throw badRequest("deliverable=true needs the caller's coordinates — pass lat and lng");
    }

    // `includeHidden` is refused rather than silently ignored: a caller asking to
    // see draft and suspended storefronts should be told no, not handed the
    // public list and left to believe there are none.
    //
    // 401 for nobody, 403 for somebody without the right — the same split
    // `authz/policy.js` makes, so a client sees one behaviour across the API. It
    // hides nothing: the *existence* of hidden storefronts is not a secret, only
    // which ones they are, and this refusal names no vendor.
    if (query.includeHidden && !viewer.canSeeAll) {
      if (!viewer.userId) throw unauthenticated("Authentication required");
      throw forbidden("Not permitted", { details: { required: [VIEW_ALL_PERMISSION] } });
    }

    const [cuisine, category] = await Promise.all([
      query.cuisine ? repo.findCuisineBySlug(query.cuisine) : null,
      query.category ? repo.findCategoryBySlug(query.category) : null,
    ]);

    const cuisineIds = [];
    if (query.cuisineId) cuisineIds.push(query.cuisineId);
    if (cuisine) cuisineIds.push(cuisine.id);
    // A cuisine slug that resolved to nothing must still narrow to nothing, or a
    // typo in the URL would silently show the whole directory.
    const unresolvedFacet = Boolean((query.cuisine && !cuisine) || (query.category && !category));

    const statuses = query.includeHidden ? ALL_STATUSES : PUBLIC_STATUSES;
    // Both `search` and `q` are accepted and **combined**, not one-or-the-other:
    // the directory names its parameter `search` and the results page names it
    // `q`, and a caller that sends both means both. Renaming either would be a
    // frontend change this module was not asked to make.
    const textTerms = terms([query.search, query.q].filter(Boolean).join(" "));

    return {
      sort,
      origin,
      unresolvedFacet,
      openNow: Boolean(query.openNow),
      deliverable: Boolean(query.deliverable),
      filter: {
        statuses,
        branchStatuses: statuses,
        type: query.type,
        cuisineIds: cuisineIds.length ? cuisineIds : undefined,
        dietary: query.dietary,
        maxPriceLevel: query.maxPrice,
        minRating: query.minRating,
        offersOnly: Boolean(query.offersOnly),
        freeDelivery: Boolean(query.freeDelivery),
        maxEtaMinutes: query.maxEta,
        supportsDelivery: Boolean(query.supportsDelivery),
        supportsPickup: Boolean(query.supportsPickup),
        terms: textTerms,
        // No free text but a category tile: the tile *is* the query, over the
        // keywords `CategoryKeyword` exists to hold.
        keywords: textTerms.length ? undefined : (category?.keywords ?? []).map((row) => row.term),
      },
    };
  }

  /** In-memory ordering for the sorts that need a projected model. */
  function sortProjected(rows, sort, scoreTerms) {
    switch (sort) {
      case "relevance":
        return rows.sort(
          (a, b) =>
            relevanceScore(b.model, scoreTerms) - relevanceScore(a.model, scoreTerms) ||
            b.model.rating - a.model.rating,
        );
      case "delivery-time":
        return rows.sort(byNumber((row) => row.model.etaMinutes[0]));
      case "distance":
        return rows.sort(byDistance);
      case "rating":
        return rows.sort((a, b) => b.model.rating - a.model.rating || b.model.reviewCount - a.model.reviewCount);
      case "price-low":
        return rows.sort(byNumber((row) => row.model.priceLevel));
      case "price-high":
        return rows.sort(byNumber((row) => row.model.priceLevel, -1));
      default:
        return rows.sort(
          (a, b) =>
            Number(b.model.isFeatured) - Number(a.model.isFeatured) || b.model.rating - a.model.rating,
        );
    }
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  const cuisines = async () => (await repo.listCuisines()).map(toCuisineModel);

  const categories = async () => (await repo.listCategories()).map(toCategoryModel);

  /**
   * The directory, and the search results page, and the cuisine landing — one
   * endpoint, because they are one question with different facets set.
   */
  async function listVendors(query = {}, { viewer = PUBLIC_VIEWER, now = new Date() } = {}) {
    const spec = await normalise(query, { viewer });
    const { page, pageSize, skip, take } = toSkipTake(query);
    const empty = { items: [], total: 0, page, pageSize };

    if (spec.unresolvedFacet) return empty;

    const closureFrom = new Date(now.getTime() - DAY_MS);
    const closureTo = new Date(now.getTime() + DAY_MS);

    // `delivery-time`, `distance` and `relevance` are exactly the sorts the
    // repository cannot push into SQL, so one question answers all three.
    const derived = spec.openNow || spec.deliverable || !isSqlSort(spec.sort);

    // -- The paged path: PostgreSQL does all of it --------------------------
    if (!derived) {
      const [rows, total] = await Promise.all([
        repo.findVendors(spec.filter, {
          orderBy: repo.orderFor(spec.sort),
          skip,
          take,
          closureFrom,
          closureTo,
        }),
        repo.countVendors(spec.filter),
      ]);
      return { items: projectAll(rows, spec, now), total, page, pageSize };
    }

    // -- The scan path: derive, then filter, sort and page ------------------
    const rows = await repo.findVendors(spec.filter, {
      // A stable base order, so a scan that *did* truncate truncated the least
      // interesting rows rather than an arbitrary set.
      orderBy: repo.orderFor(isSqlSort(spec.sort) ? spec.sort : "recommended"),
      take: scanLimit + 1,
      closureFrom,
      closureTo,
    });

    const truncated = rows.length > scanLimit;
    if (truncated) {
      rows.length = scanLimit;
      log?.warn?.(
        { scanLimit, sort: spec.sort, openNow: spec.openNow, deliverable: spec.deliverable },
        "catalog: derived-filter scan hit its limit — `total` counts the scanned window only",
      );
    }

    let projected = rows.map((vendor) => project(vendor, { origin: spec.origin, now })).filter(Boolean);

    if (spec.openNow) projected = projected.filter((row) => row.model.isOpen);
    if (spec.deliverable) {
      projected = projected.filter(
        (row) => row.model.distanceKm !== null && row.model.distanceKm <= row.radiusKm,
      );
    }

    sortProjected(projected, spec.sort, scoreTermsFor(spec));

    return {
      items: projected.slice(skip, skip + take).map((row) => row.model),
      total: projected.length,
      page,
      pageSize,
      truncated,
    };
  }

  /**
   * A home-page rail — the featured row, the trending row.
   *
   * Public statuses only, whoever asks: a rail is an editorial promise that these
   * are places you can order from, and there is no version of it that should show
   * a suspended one.
   */
  async function rail(kind, { limit, origin, now = new Date() }) {
    const filter = {
      statuses: PUBLIC_STATUSES,
      branchStatuses: PUBLIC_STATUSES,
      ...(kind === "trending" ? { isTrending: true } : { isFeatured: true }),
    };
    const rows = await repo.findVendors(filter, {
      orderBy: repo.orderFor("rating"),
      take: limit,
      closureFrom: new Date(now.getTime() - DAY_MS),
      closureTo: new Date(now.getTime() + DAY_MS),
    });
    return projectAll(rows, { origin }, now);
  }

  /**
   * One storefront, by slug — and the module's whole authorization question.
   *
   * The order matters. The row is read first because the decision needs it, and
   * every refusal below is a **404**: a `pending` application's slug is a fact
   * about a business that has not opened yet, and a 403 would confirm it exists
   * to anyone who guessed the name. That is the "hide" behaviour module 3's
   * `requireVendorAccess("…", { hide: true })` implements for a route; here it is
   * the service's own, because the vendor is found by slug rather than named by a
   * route parameter.
   *
   * Who gets past it:
   *
   *  - **anyone**, for an `active` or `paused` vendor with a live primary branch;
   *  - **the merchant** — owner, active staff, or a vendor-scoped assignment, as
   *    `authz.vendorAccess` decides — in any status, so a storefront can be
   *    previewed before it opens;
   *  - **a platform desk** holding `restaurants.view`, which is the permission
   *    the seeder gives partner operations, support, moderation and finance.
   */
  async function vendorBySlug(slug, { viewer = PUBLIC_VIEWER, origin = null, now = new Date() } = {}) {
    const row = await repo.findVendorBySlug(slug, {
      closureFrom: new Date(now.getTime() - DAY_MS),
      closureTo: new Date(now.getTime() + DAY_MS),
    });
    if (!row) throw notFound("Vendor");

    const projected = project(row, { origin, now });
    if (!projected) {
      log?.warn?.({ vendorId: row.id, slug }, "catalog: vendor has no live primary branch — not renderable");
      throw notFound("Vendor");
    }

    const isPublic =
      PUBLIC_STATUSES.includes(projected.status) && PUBLIC_STATUSES.includes(projected.branchStatus);
    if (isPublic) return projected.model;

    if (viewer.canSeeAll) return projected.model;
    if (viewer.userId && (await viewer.canAccessVendor(row.id))) return projected.model;

    throw notFound("Vendor");
  }

  /**
   * Type-ahead. Vendor names first, then the taxonomy's.
   *
   * `services/search.ts::getSearchSuggestions` puts vendor names before dish
   * names; dishes are module 5, so the second rank here is the cuisines and
   * categories a term matches — which is a better answer than nothing and is
   * data this module owns. Its `popularSearchTerms()` is documented there as "a
   * CMS-managed list in production", and there is no such collection yet, so an
   * empty query answers with the category rail in its own order rather than with
   * seven invented words.
   */
  async function suggestions(q, { limit }) {
    const scoreTerms = terms(q);
    const taxonomy = await repo.listTaxonomyNames();

    if (scoreTerms.length === 0) {
      return taxonomy.categories.map((row) => row.name).slice(0, limit);
    }

    const rows = await repo.findVendorNames(
      { statuses: PUBLIC_STATUSES, branchStatuses: PUBLIC_STATUSES, terms: scoreTerms },
      { take: limit * 2 },
    );

    const matches = (name) => scoreTerms.every((term) => name.toLowerCase().includes(term));
    const names = [
      ...rows.map((row) => row.name),
      ...taxonomy.cuisines.filter((row) => matches(row.name)).map((row) => row.name),
      ...taxonomy.categories.filter((row) => matches(row.name)).map((row) => row.name),
    ];

    return [...new Set(names)].slice(0, limit);
  }

  // -- helpers that need `project` in scope ---------------------------------

  function projectAll(rows, spec, now) {
    return rows
      .map((vendor) => project(vendor, { origin: spec.origin ?? null, now }))
      .filter(Boolean)
      .map((row) => row.model);
  }

  const scoreTermsFor = (spec) =>
    spec.filter.terms.length ? spec.filter.terms : (spec.filter.keywords ?? []);

  return {
    scanLimit,
    cuisines,
    categories,
    listVendors,
    rail,
    vendorBySlug,
    suggestions,
    /** Exposed for the tests, which assert the projection without an HTTP round trip. */
    project,
  };
}

/** `types/catalog.ts::Cuisine`. `sort` is not on the frontend's interface and is not sent. */
function toCuisineModel(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    emoji: row.emoji,
    image: row.image,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

/** `types/catalog.ts::Category` — `keywords` projected back to the string array. */
function toCategoryModel(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    emoji: row.emoji,
    image: row.image,
    sort: row.sort,
    keywords: (row.keywords ?? []).map((keyword) => keyword.term),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

export default createService;

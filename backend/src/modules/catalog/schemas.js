/**
 * schemas.js — the catalog's wire contract, as JSON Schema.
 *
 * Fastify's own validation, per F1 §7 and exactly as `modules/auth/schemas.js`
 * does it. The two consequences that file names apply here too, and the second is
 * load-bearing for this module:
 *
 *  - `removeAdditional: "all"` means a query parameter that is not declared here
 *    never reaches the handler;
 *  - the `response` schema **filters the body on the way out**. That is the second,
 *    independent guarantee that `commissionRate`, `Vendor.status`, the branch id
 *    and the `closedBecause` reason cannot leak into a public payload however the
 *    service is later changed. `vendorSchema` below is `types/catalog.ts::Vendor`
 *    field for field, and nothing else can pass through it.
 *
 * The shapes are the frontend's, not new ones:
 *
 *   cuisineSchema   types/catalog.ts::Cuisine
 *   categorySchema  types/catalog.ts::Category
 *   vendorSchema    types/catalog.ts::Vendor  (minus `commissionRate` — see service.js)
 *   the page        services/http.ts::Paginated<T>
 */
import { MAX_PAGE_SIZE, paginationProperties } from "../../shared/utils/pagination.js";
import { WEEKDAYS } from "./hours.js";
import { SORTS } from "./service.js";

/** `types/common.ts::VendorType`. */
const VENDOR_TYPES = ["restaurant", "cafe", "cloud-kitchen", "home-chef", "catering"];

/** `types/common.ts::DietaryTag`. */
const DIETARY_TAGS = ["halal", "vegetarian", "vegan", "gluten-free", "keto", "healthy", "spicy"];

const isoDate = { type: "string" };

/** `types/catalog.ts::Cuisine`. */
export const cuisineSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    slug: { type: "string" },
    name: { type: "string" },
    emoji: { type: "string" },
    image: { type: "string" },
    createdAt: isoDate,
    updatedAt: isoDate,
    deletedAt: { ...isoDate, nullable: true },
  },
};

/** `types/catalog.ts::Category`. */
export const categorySchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    slug: { type: "string" },
    name: { type: "string" },
    emoji: { type: "string" },
    image: { type: "string" },
    sort: { type: "integer" },
    keywords: { type: "array", items: { type: "string" } },
    createdAt: isoDate,
    updatedAt: isoDate,
    deletedAt: { ...isoDate, nullable: true },
  },
};

/** `types/common.ts::DayHours` — 24h "HH:mm", null when closed that day. */
const dayHoursSchema = {
  type: "object",
  properties: { open: { type: "string", nullable: true }, close: { type: "string", nullable: true } },
};

/** `types/common.ts::WeeklyHours` — seven named days, which is what components index by. */
const weeklyHoursSchema = {
  type: "object",
  properties: Object.fromEntries(WEEKDAYS.map((day) => [day, dayHoursSchema])),
};

/**
 * `types/catalog.ts::Vendor`.
 *
 * `distanceKm` is `nullable` and the frontend's is not — the one declared delta,
 * argued in M4 §"Frontend contract": a caller that sent no coordinates gets
 * `null` rather than a fabricated zero, and the frontend's own default origin
 * means it never sees one.
 */
export const vendorSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    slug: { type: "string" },
    type: { type: "string", enum: VENDOR_TYPES },
    ownerId: { type: "string", nullable: true },
    name: { type: "string" },
    tagline: { type: "string" },
    description: { type: "string" },
    logo: { type: "string" },
    cover: { type: "string" },
    cuisineIds: { type: "array", items: { type: "string" } },
    dietary: { type: "array", items: { type: "string", enum: DIETARY_TAGS } },
    priceLevel: { type: "integer" },
    rating: { type: "number" },
    reviewCount: { type: "integer" },
    location: {
      type: "object",
      properties: {
        lat: { type: "number" },
        lng: { type: "number" },
        address: { type: "string" },
        city: { type: "string" },
        countryCode: { type: "string" },
      },
    },
    distanceKm: { type: "number", nullable: true },
    etaMinutes: { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
    deliveryFee: { type: "number" },
    minOrder: { type: "number" },
    freeDeliveryOver: { type: "number", nullable: true },
    hours: weeklyHoursSchema,
    isOpen: { type: "boolean" },
    isFeatured: { type: "boolean" },
    isTrending: { type: "boolean" },
    promoLabel: { type: "string", nullable: true },
    currency: { type: "string" },
    createdAt: isoDate,
    updatedAt: isoDate,
    deletedAt: { ...isoDate, nullable: true },
  },
};

/** `services/http.ts::Paginated<T>`, which `envelope.okPage` builds. */
const pageOf = (item) => ({
  type: "object",
  properties: {
    items: { type: "array", items: item },
    total: { type: "integer" },
    page: { type: "integer" },
    pageSize: { type: "integer" },
    hasMore: { type: "boolean" },
  },
});

/** The success envelope. Declared here rather than shared because `data` differs per route. */
const ok = (data) => ({
  type: "object",
  required: ["success", "data"],
  properties: { success: { type: "boolean", const: true }, data },
});

// ---------------------------------------------------------------------------
// Query strings
// ---------------------------------------------------------------------------

/**
 * The caller's position. Two parameters rather than one `origin` object, because
 * a query string has no objects and `?lat=&lng=` is what a browser sends.
 *
 * Both or neither: half a coordinate is not a place. `toPoint` refuses a lone
 * one anyway, so the schema's job here is to document the pair.
 */
const originProperties = {
  lat: { type: "number", minimum: -90, maximum: 90 },
  lng: { type: "number", minimum: -180, maximum: 180 },
};

/**
 * Every facet the results page can set — `services/catalog.ts::VendorQuery` and
 * `services/search.ts::SearchQuery`, merged, because they are one query.
 *
 * `q` and `search` are both accepted: the directory calls its parameter `search`
 * and the results page calls it `q`, and renaming either would be a frontend
 * change this module was not asked to make.
 */
export const vendorQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...paginationProperties,
    ...originProperties,
    q: { type: "string", maxLength: 120 },
    search: { type: "string", maxLength: 120 },
    type: { type: "string", enum: VENDOR_TYPES },
    cuisineId: { $ref: "id#" },
    cuisine: { type: "string", maxLength: 80 },
    category: { type: "string", maxLength: 80 },
    dietary: { type: "array", items: { type: "string", enum: DIETARY_TAGS }, maxItems: 7 },
    maxPrice: { type: "integer", minimum: 1, maximum: 4 },
    minRating: { type: "number", minimum: 0, maximum: 5 },
    maxEta: { type: "integer", minimum: 1, maximum: 240 },
    openNow: { type: "boolean" },
    freeDelivery: { type: "boolean" },
    offersOnly: { type: "boolean" },
    supportsDelivery: { type: "boolean" },
    supportsPickup: { type: "boolean" },
    /** Only branches whose `deliveryRadiusKm` reaches the caller. Needs `lat`/`lng`. */
    deliverable: { type: "boolean" },
    /**
     * Include storefronts the public cannot see — `draft`, `pending`, `rejected`,
     * `suspended`. Requires `restaurants.view`; refused, not ignored, without it.
     */
    includeHidden: { type: "boolean" },
    sort: { type: "string", enum: [...SORTS] },
  },
};

const railQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...originProperties,
    limit: { type: "integer", minimum: 1, maximum: MAX_PAGE_SIZE, default: 12 },
  },
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const errors = Object.freeze({
  400: { $ref: "error#" },
  401: { $ref: "error#" },
  403: { $ref: "error#" },
  404: { $ref: "error#" },
  500: { $ref: "error#" },
});

/**
 * A vendor slug. Lower-case, hyphen-separated, which is the form
 * `lib/mock/vendors.ts` uses and `Vendor.slug`'s `VarChar(120)` allows.
 *
 * Validated rather than passed through, so a slug-shaped path is the only thing
 * that reaches a `findUnique` — and a 400 for `%00` is cheaper and clearer than a
 * 404 from the database.
 */
const slugParam = {
  type: "object",
  required: ["slug"],
  properties: { slug: { type: "string", minLength: 1, maxLength: 120, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" } },
};

export const ROUTE_SCHEMAS = Object.freeze({
  cuisines: {
    summary: "The cuisine grid",
    response: { 200: ok({ type: "array", items: cuisineSchema }), ...errors },
  },

  categories: {
    summary: "The craving rail, with the keywords that make each tile a query",
    response: { 200: ok({ type: "array", items: categorySchema }), ...errors },
  },

  vendors: {
    summary: "Discovery — the directory, the search results page and the cuisine landing",
    querystring: vendorQuerySchema,
    response: {
      200: ok(pageOf(vendorSchema)),
      ...errors,
    },
  },

  featured: {
    summary: "The featured rail",
    querystring: railQuerySchema,
    response: { 200: ok({ type: "array", items: vendorSchema }), ...errors },
  },

  trending: {
    summary: "The trending rail",
    querystring: railQuerySchema,
    response: { 200: ok({ type: "array", items: vendorSchema }), ...errors },
  },

  vendorBySlug: {
    summary: "One storefront",
    params: slugParam,
    querystring: { type: "object", additionalProperties: false, properties: { ...originProperties } },
    response: { 200: ok(vendorSchema), ...errors },
  },

  suggestions: {
    summary: "Type-ahead for the search box",
    querystring: {
      type: "object",
      additionalProperties: false,
      properties: {
        q: { type: "string", maxLength: 120 },
        limit: { type: "integer", minimum: 1, maximum: 20, default: 8 },
      },
    },
    response: { 200: ok({ type: "array", items: { type: "string" } }), ...errors },
  },
});

import { BACKEND_FALLBACK, LIVE } from "@/config/backend";
// Imported from the two modules directly rather than through `lib/graphql`: the barrel
// re-exports `./client`, which is a `"use client"` module, and this file is imported by
// Server Components. Reaching past the barrel is what keeps the client bundle out of
// the server graph.
import {
  CATEGORIES,
  CUISINES,
  FEATURED_VENDORS,
  FOOD,
  POPULAR_ITEMS,
  TRENDING_VENDORS,
  VENDOR,
  VENDOR_MENU,
  VENDORS,
  type VendorWire,
} from "@/lib/graphql/catalog.operations";
import { execute } from "@/lib/graphql/execute";
import {
  cuisineById,
  cuisines,
  foodBySlug,
  foodsByVendor,
  menuSectionsByVendor,
  vendorBySlug,
  vendors,
} from "@/lib/mock";
import type {
  Category,
  Cuisine,
  FoodItem,
  MenuSection,
  Vendor,
  VendorType,
} from "@/types";
import { cmsCategories, emptyCmsContext, readOptions } from "./cms";
import type { CmsPageOptions } from "./pages";
import { mockDelay, paginate, type Paginated } from "./http";

/**
 * catalog.ts — read API for the discoverable catalog. Every function is async
 * and returns the same shape a real endpoint would, so components/pages are
 * backend-ready. Filtering/sorting happen here (server-side, eventually).
 *
 * ## V1 Unit 1: "eventually" arrived
 *
 * Each function has two bodies. With `LIVE.catalog` off it is the Phase C mock layer,
 * unchanged; with it on the same signature is served by `vendors` / `vendorMenu` / … on
 * the API. No caller changed, and none can tell which body ran — which is the whole test
 * of whether the seam was in the right place.
 *
 * Filtering, sorting and pagination moved *behind* the flag rather than being deleted: a
 * live read does none of that work here, because `CatalogService` does it against
 * Postgres. The mock path keeps its copy because it has no server to delegate to.
 *
 * These functions are called from **Server Components** (the landing page, the directory,
 * restaurant detail, the QR menu) *and* from client components (`admin/live-ops`,
 * `dashboard/menu-manager`). `lib/graphql/execute` is what makes one function work in
 * both: Apollo in the browser, `fetch` on the server, for the reason documented there.
 *
 * ## V1 Unit 2: the mock path became the fallback
 *
 * Having two complete implementations of every read turns out to be worth more than a
 * migration aid. When a live read fails — the API is down, a deploy is mid-flight, a
 * request blew its deadline — `live()` serves the mock body instead of propagating the
 * error, so a *browse* surface degrades to a working catalogue rather than an error page.
 *
 * That is a deliberate trade with a real cost, argued in `config/backend.ts`
 * (`BACKEND_FALLBACK`). The two things that make it defensible are that every fallback is
 * logged, and that it is confined to reads. Nothing that *writes* falls back: a cart
 * mutation that quietly succeeded locally while failing server-side is a customer who
 * loses their basket at checkout, and no amount of graceful degradation is worth that.
 */

/**
 * Where distance is measured from while the app has no geolocation.
 *
 * `Vendor.distanceKm` is computed by the API from the query's origin, because how far a
 * restaurant is depends on who is asking — which is why `catalog.prisma` refuses to
 * store it. Until a real position is available this is the platform's reference point
 * (Gulshan 1, Dhaka), so the cards read as they always have. The mock layer's
 * `distanceKm` values were fixed numbers standing in for exactly this.
 */
const DEFAULT_ORIGIN = { lat: 23.7806, lng: 90.4152 };

export interface VendorQuery {
  type?: VendorType;
  cuisineId?: string;
  search?: string;
  openNow?: boolean;
  sort?: "recommended" | "rating" | "delivery-time" | "distance";
  page?: number;
  pageSize?: number;
}

/**
 * Run a live read, and fall back to the mock body if it fails.
 *
 * The `console.error` is not decoration. A fallback that is silent is indistinguishable
 * from a working app, which is how a wrong `NEXT_PUBLIC_API_URL` survives to production —
 * so the log names the operation and the reason, and appears once per failed read rather
 * than once per page.
 *
 * `BACKEND_FALLBACK=0` makes this a passthrough. That is the setting for CI and for
 * anyone whose actual question is "is the live path working", where a silent recovery is
 * the opposite of helpful.
 */
async function live<T>(
  operation: string,
  run: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!BACKEND_FALLBACK) throw error;
    console.error(
      `[catalog] ${operation} failed against the API and fell back to the mock layer:`,
      error instanceof Error ? error.message : error,
    );
    return fallback();
  }
}

/**
 * `etaMinutes` is `[Int!]!` on the wire and `[number, number]` here.
 *
 * The two ends are `etaMinMinutes` and `etaMaxMinutes`, two non-null columns, so the
 * server cannot send fewer than two — but GraphQL has no tuple, so the narrowing
 * happens once, here, instead of at each of the four components that read the pair.
 */
function toVendor(wire: VendorWire): Vendor {
  const [min = 0, max = 0] = wire.etaMinutes;
  return { ...wire, etaMinutes: [min, max] };
}

export async function getCuisines(): Promise<Cuisine[]> {
  if (!LIVE.catalog) return mockCuisines();
  return live("cuisines", async () => (await execute(CUISINES)).cuisines, mockCuisines);
}

const mockCuisines = (): Promise<Cuisine[]> => mockDelay(cuisines);

/**
 * The craving rail's categories. Since C26 they are CMS documents (seeded from
 * `lib/mock/categories.ts`), so an operator can rename a tile, change its emoji,
 * reorder the rail or hide a category — and because `keywords` is editable too,
 * a tile stays a real search rather than a decorative link.
 *
 * With `LIVE.catalog` on they come from `categories` instead, and the `options` are
 * ignored. That is a real trade and worth naming: the API is the source of truth for
 * the tiles, but the CMS's *device-local* edits (`options.ctx`) are a prototype
 * mechanism with no server behind it yet, so a live read cannot honour them. Nothing
 * is lost in translation — category names carry no `fallbacks` key, so the `translate`
 * option never resolved anything for them either. The editor comes back when the CMS
 * module lands and `Category` becomes writable.
 */
export async function getCategories(options: CmsPageOptions = {}): Promise<Category[]> {
  const fallback = () => mockCategories(options);
  if (!LIVE.catalog) return fallback();
  return live("categories", async () => (await execute(CATEGORIES)).categories, fallback);
}

function mockCategories(options: CmsPageOptions): Promise<Category[]> {
  const ctx = options.ctx ?? emptyCmsContext;
  return mockDelay(cmsCategories(ctx, readOptions(options.locale, options.translate)));
}

export async function getVendors(query: VendorQuery = {}): Promise<Paginated<Vendor>> {
  const fallback = () => mockVendors(query);
  if (!LIVE.catalog) return fallback();

  return live(
    "vendors",
    async () => {
      const { vendors: page } = await execute(VENDORS, {
        query: {
          type: query.type,
          cuisineId: query.cuisineId,
          search: query.search,
          openNow: query.openNow,
          sort: query.sort ?? "recommended",
          origin: DEFAULT_ORIGIN,
        },
        page: { page: query.page ?? 1, pageSize: query.pageSize ?? 12 },
      });
      return {
        items: page.items.map(toVendor),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
        hasMore: page.hasMore,
      };
    },
    fallback,
  );
}

function mockVendors(query: VendorQuery): Promise<Paginated<Vendor>> {
  let list = vendors.filter((v) => !v.deletedAt);

  if (query.type) list = list.filter((v) => v.type === query.type);
  if (query.cuisineId) list = list.filter((v) => v.cuisineIds.includes(query.cuisineId!));
  if (query.openNow) list = list.filter((v) => v.isOpen);
  if (query.search) {
    const q = query.search.toLowerCase();
    list = list.filter(
      (v) => v.name.toLowerCase().includes(q) || v.tagline.toLowerCase().includes(q),
    );
  }

  switch (query.sort) {
    case "rating":
      list = [...list].sort((a, b) => b.rating - a.rating);
      break;
    case "delivery-time":
      list = [...list].sort((a, b) => a.etaMinutes[0] - b.etaMinutes[0]);
      break;
    case "distance":
      list = [...list].sort((a, b) => a.distanceKm - b.distanceKm);
      break;
    default:
      // "recommended": featured first, then rating.
      list = [...list].sort(
        (a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.rating - a.rating,
      );
  }

  return mockDelay(paginate(list, query.page, query.pageSize));
}

export async function getTrendingVendors(limit = 8): Promise<Vendor[]> {
  const fallback = () =>
    mockDelay(
      vendors
        .filter((v) => v.isTrending && !v.deletedAt)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, limit),
    );

  if (!LIVE.catalog) return fallback();
  return live(
    "trendingVendors",
    async () => (await execute(TRENDING_VENDORS, { limit })).trendingVendors.map(toVendor),
    fallback,
  );
}

export async function getFeaturedVendors(limit = 6): Promise<Vendor[]> {
  const fallback = () =>
    mockDelay(vendors.filter((v) => v.isFeatured && !v.deletedAt).slice(0, limit));

  if (!LIVE.catalog) return fallback();
  return live(
    "featuredVendors",
    async () => (await execute(FEATURED_VENDORS, { limit })).featuredVendors.map(toVendor),
    fallback,
  );
}

export async function getVendorBySlug(slug: string): Promise<Vendor | null> {
  const fallback = () => mockDelay(vendorBySlug.get(slug) ?? null);
  if (!LIVE.catalog) return fallback();

  return live(
    "vendor",
    async () => {
      const { vendor } = await execute(VENDOR, { slug });
      return vendor ? toVendor(vendor) : null;
    },
    fallback,
  );
}

/**
 * Slugs for `generateStaticParams` — synchronous, build-time only.
 *
 * Still the mock list even with the flag on, and it has to be: the signature is
 * synchronous, so it cannot fetch, and making it async would change
 * `app/(marketing)/restaurants/[slug]/page.tsx` — the one thing V1 does not do. That is
 * benign rather than a compromise. `seed:demo` writes exactly these vendors, so the
 * prerendered set is the same set; and a vendor the seed adds later is not missing, it
 * is merely rendered on demand instead of at build time, which is Next's default for a
 * param `generateStaticParams` did not list.
 */
export function getVendorSlugs(): string[] {
  return vendors.filter((v) => !v.deletedAt).map((v) => v.slug);
}

/**
 * Resolve a vendor's cuisine names for display (FK lookup).
 *
 * Live, this is the cuisine list filtered by the vendor's ids — the same thing the
 * mock does with its map, and the same thing the *server* would do, since the rails are
 * a dozen rows held in Redis. A `vendorCuisines(vendorId)` query would be a round trip
 * to re-derive what the page already has.
 *
 * No `live()` wrapper: its only live dependency is `getCuisines`, which already has one,
 * so wrapping again would log the same failure twice and add a second fallback to a value
 * that has already been recovered.
 */
export async function getVendorCuisines(vendor: Vendor): Promise<Cuisine[]> {
  if (LIVE.catalog) {
    const all = await getCuisines();
    return vendor.cuisineIds
      .map((id) => all.find((c) => c.id === id))
      .filter((c): c is Cuisine => Boolean(c));
  }
  return mockDelay(
    vendor.cuisineIds.map((id) => cuisineById.get(id)).filter((c): c is Cuisine => Boolean(c)),
  );
}

/** A menu section with its (available) items attached, ordered for display. */
export interface MenuSectionWithItems extends MenuSection {
  items: FoodItem[];
}

/** Full menu for a vendor — sections in order, each with its food items. */
export async function getVendorMenu(vendorId: string): Promise<MenuSectionWithItems[]> {
  const fallback = () => mockVendorMenu(vendorId);
  if (!LIVE.catalog) return fallback();

  return live(
    "vendorMenu",
    // Sections arrive ordered and already stripped of empty ones — the server does both,
    // because a heading with nothing under it reads as a failed load. Since Unit 2 the
    // result is also held in Redis for `CATALOG_MENU_TTL_SECONDS`.
    async () => (await execute(VENDOR_MENU, { vendorId })).vendorMenu,
    fallback,
  );
}

function mockVendorMenu(vendorId: string): Promise<MenuSectionWithItems[]> {
  const sections = [...(menuSectionsByVendor[vendorId] ?? [])].sort((a, b) => a.sort - b.sort);
  const items = foodsByVendor[vendorId] ?? [];
  const menu = sections.map((section) => ({
    ...section,
    items: items.filter((f) => f.sectionId === section.id && !f.deletedAt),
  }));
  return mockDelay(menu.filter((s) => s.items.length > 0));
}

/** Popular items across a vendor's menu, for the "Popular" rail. */
export async function getPopularItems(vendorId: string, limit = 6): Promise<FoodItem[]> {
  const fallback = () =>
    mockDelay(
      (foodsByVendor[vendorId] ?? [])
        .filter((f) => f.isPopular && !f.deletedAt)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, limit),
    );

  if (!LIVE.catalog) return fallback();
  return live(
    "popularItems",
    async () => (await execute(POPULAR_ITEMS, { vendorId, limit })).popularItems,
    fallback,
  );
}

export async function getFoodBySlug(slug: string): Promise<FoodItem | null> {
  const fallback = () => mockDelay(foodBySlug.get(slug) ?? null);
  if (!LIVE.catalog) return fallback();
  return live("food", async () => (await execute(FOOD, { slug })).food, fallback);
}

import {
  categoryBySlug,
  cuisineById,
  cuisineBySlug,
  foods,
  vendorById,
  vendors,
} from "@/frontend/lib/mock";
import type {
  Category,
  Cuisine,
  DietaryTag,
  FoodItem,
  Vendor,
  VendorType,
} from "@/frontend/types";
import { mockDelay } from "./http";

/**
 * search.ts — the smart-search read API (spec: Smart Search). One entry point
 * that resolves a query across both vendors and dishes, applies the facet
 * filters and returns everything a results page needs in a single round trip,
 * exactly as a real `/search` endpoint would.
 *
 * All matching happens here (server-side eventually); the page is a pure
 * renderer over `SearchResults`.
 */

/** Sort options offered on the results page. */
export type SearchSort =
  | "relevance"
  | "rating"
  | "delivery-time"
  | "distance"
  | "price-low"
  | "price-high";

/** Every facet the results page can filter on — mirrors the URL query string. */
export interface SearchQuery {
  /** Free-text term, matched against vendor and dish fields. */
  q?: string;
  /** Browse-category slug (from the landing rail). */
  category?: string;
  /** Cuisine slug (from the landing cuisine grid). */
  cuisine?: string;
  /** Delivery address typed into the hero — echoed back, not geocoded. */
  near?: string;
  type?: VendorType;
  dietary?: DietaryTag[];
  /** Inclusive ceiling on `Vendor.priceLevel` (1–4). */
  maxPrice?: number;
  /** Minimum vendor rating, e.g. 4.5. */
  minRating?: number;
  openNow?: boolean;
  /** Only vendors that offer free delivery above some basket value. */
  freeDelivery?: boolean;
  /** Only vendors currently running a promotion. */
  offersOnly?: boolean;
  /** Ceiling on the low end of the ETA window, minutes. */
  maxEta?: number;
  sort?: SearchSort;
}

/** A dish result carries its vendor so the card can link and label itself. */
export interface FoodHit {
  food: FoodItem;
  vendor: Vendor;
}

/** The full payload for a search results page. */
export interface SearchResults {
  vendors: Vendor[];
  foods: FoodHit[];
  /** Resolved facet entities, so the page can show a proper heading. */
  category: Category | null;
  cuisine: Cuisine | null;
  totalVendors: number;
  totalFoods: number;
  /** Alternative queries offered when nothing matched. */
  suggestions: string[];
}

/** Lower-case haystack for a vendor: name, tagline, description, cuisines. */
function vendorHaystack(vendor: Vendor): string {
  const cuisineNames = vendor.cuisineIds
    .map((id) => cuisineById.get(id)?.name ?? "")
    .join(" ");
  return `${vendor.name} ${vendor.tagline} ${vendor.description} ${cuisineNames}`.toLowerCase();
}

/** Lower-case haystack for a dish: name, description, plus its vendor's name. */
function foodHaystack(food: FoodItem): string {
  const vendorName = vendorById.get(food.vendorId)?.name ?? "";
  return `${food.name} ${food.description} ${vendorName}`.toLowerCase();
}

/** True when every search term appears somewhere in the haystack. */
function matchesTerms(haystack: string, terms: string[]): boolean {
  return terms.every((term) => haystack.includes(term));
}

/** True when any of the category/cuisine keywords appear in the haystack. */
function matchesAny(haystack: string, keywords: string[]): boolean {
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

/**
 * Relevance weight for a vendor: exact name hits beat tagline hits, which beat
 * description hits; featured and highly-rated vendors break ties. Deterministic,
 * so results are stable between renders.
 */
function vendorScore(vendor: Vendor, terms: string[]): number {
  const name = vendor.name.toLowerCase();
  const tagline = vendor.tagline.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (name === term) score += 100;
    else if (name.startsWith(term)) score += 60;
    else if (name.includes(term)) score += 40;
    if (tagline.includes(term)) score += 15;
  }
  if (vendor.isFeatured) score += 8;
  if (vendor.isTrending) score += 4;
  if (vendor.isOpen) score += 3;
  return score + vendor.rating;
}

/** Relevance weight for a dish — same shape as {@link vendorScore}. */
function foodScore(food: FoodItem, terms: string[]): number {
  const name = food.name.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (name === term) score += 100;
    else if (name.startsWith(term)) score += 60;
    else if (name.includes(term)) score += 40;
    if (food.description.toLowerCase().includes(term)) score += 10;
  }
  if (food.isPopular) score += 8;
  return score + food.rating;
}

/** Split a raw query into normalised, non-trivial terms. */
function terms(q: string | undefined): string[] {
  return (q ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

/**
 * Run a search. Returns matching vendors *and* dishes: a query like "biryani"
 * should surface both the restaurants known for it and the specific dishes.
 */
export async function search(query: SearchQuery = {}): Promise<SearchResults> {
  const category = query.category ? categoryBySlug.get(query.category) ?? null : null;
  const cuisine = query.cuisine ? cuisineBySlug.get(query.cuisine) ?? null : null;
  const textTerms = terms(query.q);

  // Category/cuisine tiles behave like a query: both narrow vendors and dishes.
  const keywords = [
    ...(category?.keywords ?? []),
    ...(cuisine ? [cuisine.name] : []),
  ];

  // ---- Vendors -------------------------------------------------------------
  let vendorList = vendors.filter((v) => !v.deletedAt);

  if (cuisine) vendorList = vendorList.filter((v) => v.cuisineIds.includes(cuisine.id));
  if (query.type) vendorList = vendorList.filter((v) => v.type === query.type);
  if (query.openNow) vendorList = vendorList.filter((v) => v.isOpen);
  if (query.freeDelivery) {
    vendorList = vendorList.filter((v) => v.freeDeliveryOver !== null);
  }
  if (query.offersOnly) vendorList = vendorList.filter((v) => v.promoLabel !== null);
  if (query.maxPrice) vendorList = vendorList.filter((v) => v.priceLevel <= query.maxPrice!);
  if (query.minRating) vendorList = vendorList.filter((v) => v.rating >= query.minRating!);
  if (query.maxEta) vendorList = vendorList.filter((v) => v.etaMinutes[0] <= query.maxEta!);
  if (query.dietary?.length) {
    vendorList = vendorList.filter((v) =>
      query.dietary!.every((tag) => v.dietary.includes(tag)),
    );
  }
  if (textTerms.length) {
    vendorList = vendorList.filter((v) => matchesTerms(vendorHaystack(v), textTerms));
  } else if (category) {
    // No free text, but a category tile: keep vendors whose menu or profile
    // actually covers it, so "Pizza" never lists a sushi bar.
    vendorList = vendorList.filter(
      (v) =>
        matchesAny(vendorHaystack(v), category.keywords) ||
        foods.some(
          (f) =>
            f.vendorId === v.id && !f.deletedAt && matchesAny(foodHaystack(f), category.keywords),
        ),
    );
  }

  // ---- Dishes --------------------------------------------------------------
  const vendorIds = new Set(vendorList.map((v) => v.id));
  let foodList = foods.filter((f) => !f.deletedAt && f.isAvailable);

  if (textTerms.length) {
    foodList = foodList.filter((f) => matchesTerms(foodHaystack(f), textTerms));
  } else if (keywords.length) {
    foodList = foodList.filter((f) => matchesAny(foodHaystack(f), keywords));
  } else {
    // Bare `/search` with only facets: show the popular dishes of the vendors
    // that survived the filters rather than an arbitrary slice of everything.
    foodList = foodList.filter((f) => f.isPopular && vendorIds.has(f.vendorId));
  }

  if (query.dietary?.length) {
    foodList = foodList.filter((f) =>
      query.dietary!.every((tag) => f.dietary.includes(tag)),
    );
  }
  // A dish is only orderable through a vendor that passed the vendor filters.
  const facetsActive =
    Boolean(query.type || query.openNow || query.freeDelivery || query.offersOnly) ||
    Boolean(query.maxPrice || query.minRating || query.maxEta || query.dietary?.length) ||
    Boolean(cuisine);
  if (facetsActive) foodList = foodList.filter((f) => vendorIds.has(f.vendorId));

  // ---- Sorting -------------------------------------------------------------
  switch (query.sort) {
    case "rating":
      vendorList = [...vendorList].sort((a, b) => b.rating - a.rating);
      foodList = [...foodList].sort((a, b) => b.rating - a.rating);
      break;
    case "delivery-time":
      vendorList = [...vendorList].sort((a, b) => a.etaMinutes[0] - b.etaMinutes[0]);
      break;
    case "distance":
      vendorList = [...vendorList].sort((a, b) => a.distanceKm - b.distanceKm);
      break;
    case "price-low":
      vendorList = [...vendorList].sort((a, b) => a.priceLevel - b.priceLevel);
      foodList = [...foodList].sort((a, b) => a.price - b.price);
      break;
    case "price-high":
      vendorList = [...vendorList].sort((a, b) => b.priceLevel - a.priceLevel);
      foodList = [...foodList].sort((a, b) => b.price - a.price);
      break;
    default: {
      // Relevance: score against the free-text terms (or the facet keywords, so
      // category/cuisine landings are ordered sensibly too).
      const scoreTerms = textTerms.length ? textTerms : keywords.map((k) => k.toLowerCase());
      vendorList = [...vendorList].sort(
        (a, b) => vendorScore(b, scoreTerms) - vendorScore(a, scoreTerms),
      );
      foodList = [...foodList].sort(
        (a, b) => foodScore(b, scoreTerms) - foodScore(a, scoreTerms),
      );
    }
  }

  const hits: FoodHit[] = foodList
    .map((food) => ({ food, vendor: vendorById.get(food.vendorId)! }))
    .filter((hit) => Boolean(hit.vendor));

  return mockDelay({
    vendors: vendorList,
    foods: hits,
    category,
    cuisine,
    totalVendors: vendorList.length,
    totalFoods: hits.length,
    suggestions:
      vendorList.length === 0 && hits.length === 0 ? popularSearchTerms() : [],
  });
}

/**
 * Type-ahead suggestions for the search box: matching vendor names first, then
 * dish names. Capped, deduplicated and ordered by relevance.
 */
export async function getSearchSuggestions(q: string, limit = 8): Promise<string[]> {
  const textTerms = terms(q);
  if (!textTerms.length) return mockDelay(popularSearchTerms().slice(0, limit), 120);

  const vendorNames = vendors
    .filter((v) => !v.deletedAt && matchesTerms(vendorHaystack(v), textTerms))
    .sort((a, b) => vendorScore(b, textTerms) - vendorScore(a, textTerms))
    .map((v) => v.name);

  const foodNames = foods
    .filter((f) => !f.deletedAt && matchesTerms(foodHaystack(f), textTerms))
    .sort((a, b) => foodScore(b, textTerms) - foodScore(a, textTerms))
    .map((f) => f.name);

  const unique = Array.from(new Set([...vendorNames, ...foodNames])).slice(0, limit);
  return mockDelay(unique, 120);
}

/** Static "people also search for" terms — a CMS-managed list in production. */
export function popularSearchTerms(): string[] {
  return ["Biryani", "Pizza", "Sushi", "Burgers", "Coffee", "Vegan bowls", "Pad Thai"];
}

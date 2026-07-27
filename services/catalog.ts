import {
  categories,
  cuisines,
  vendorBySlug,
  vendors,
} from "@/lib/mock";
import type { Category, Cuisine, Vendor, VendorType } from "@/types";
import { mockDelay, paginate, type Paginated } from "./http";

/**
 * catalog.ts — read API for the discoverable catalog. Every function is async
 * and returns the same shape a real endpoint would, so components/pages are
 * backend-ready. Filtering/sorting happen here (server-side, eventually).
 */

export interface VendorQuery {
  type?: VendorType;
  cuisineId?: string;
  search?: string;
  openNow?: boolean;
  sort?: "recommended" | "rating" | "delivery-time" | "distance";
  page?: number;
  pageSize?: number;
}

export async function getCuisines(): Promise<Cuisine[]> {
  return mockDelay(cuisines);
}

export async function getCategories(): Promise<Category[]> {
  return mockDelay([...categories].sort((a, b) => a.sort - b.sort));
}

export async function getVendors(query: VendorQuery = {}): Promise<Paginated<Vendor>> {
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
  const list = vendors
    .filter((v) => v.isTrending && !v.deletedAt)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
  return mockDelay(list);
}

export async function getFeaturedVendors(limit = 6): Promise<Vendor[]> {
  const list = vendors
    .filter((v) => v.isFeatured && !v.deletedAt)
    .slice(0, limit);
  return mockDelay(list);
}

export async function getVendorBySlug(slug: string): Promise<Vendor | null> {
  return mockDelay(vendorBySlug.get(slug) ?? null);
}

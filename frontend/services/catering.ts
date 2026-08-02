import {
  addOnById,
  cateringPackagesByService,
  cateringServiceBySlug,
  cateringServices,
  cuisineById,
} from "@/lib/mock";
import type {
  CateringAddOn,
  CateringPackage,
  CateringPricing,
  CateringQuote,
  CateringService,
  Cuisine,
  EventType,
  QuoteAddOnLine,
  QuoteContact,
  QuoteService,
  QuoteVenue,
  ServiceStyle,
} from "@/types";
import { mockDelay, ok, paginate, type Paginated, type Result } from "./http";

/**
 * catering.ts — read + write API for the catering vertical (Phase C17). Every
 * function is async and returns the shape a real endpoint would, so pages are
 * backend-ready. `requestQuote` fabricates the immutable quote record a real
 * endpoint would return (number, timestamps, status); the client then caches it
 * in the quotes store. Swapping in the Phase E backend touches only this file.
 */

export interface CateringQuery {
  eventType?: EventType;
  serviceStyle?: ServiceStyle;
  search?: string;
  sort?: "recommended" | "rating" | "price-low" | "capacity";
  page?: number;
  pageSize?: number;
}

export async function getCateringServices(
  query: CateringQuery = {},
): Promise<Paginated<CateringService>> {
  let list = cateringServices.filter((s) => !s.deletedAt);

  if (query.eventType) list = list.filter((s) => s.eventTypes.includes(query.eventType!));
  if (query.serviceStyle) list = list.filter((s) => s.serviceStyles.includes(query.serviceStyle!));
  if (query.search) {
    const q = query.search.toLowerCase();
    list = list.filter(
      (s) => s.name.toLowerCase().includes(q) || s.tagline.toLowerCase().includes(q),
    );
  }

  switch (query.sort) {
    case "rating":
      list = [...list].sort((a, b) => b.rating - a.rating);
      break;
    case "price-low":
      list = [...list].sort((a, b) => a.pricePerGuestFrom - b.pricePerGuestFrom);
      break;
    case "capacity":
      list = [...list].sort((a, b) => b.maxGuests - a.maxGuests);
      break;
    default:
      // "recommended": featured first, then rating.
      list = [...list].sort(
        (a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.rating - a.rating,
      );
  }

  return mockDelay(paginate(list, query.page, query.pageSize));
}

export async function getFeaturedCateringServices(limit = 3): Promise<CateringService[]> {
  const list = cateringServices
    .filter((s) => s.isFeatured && !s.deletedAt)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);
  return mockDelay(list);
}

export async function getCateringServiceBySlug(slug: string): Promise<CateringService | null> {
  return mockDelay(cateringServiceBySlug.get(slug) ?? null);
}

/** Slugs for `generateStaticParams` — synchronous, build-time only. */
export function getCateringServiceSlugs(): string[] {
  return cateringServices.filter((s) => !s.deletedAt).map((s) => s.slug);
}

/** A caterer's packages, popular first (FK lookup by serviceId). */
export async function getServicePackages(serviceId: string): Promise<CateringPackage[]> {
  const list = [...(cateringPackagesByService[serviceId] ?? [])]
    .filter((p) => !p.deletedAt)
    .sort((a, b) => Number(b.isPopular) - Number(a.isPopular) || a.pricePerGuest - b.pricePerGuest);
  return mockDelay(list);
}

/** Resolve a caterer's offered add-ons for display (FK lookup). */
export async function getServiceAddOns(service: CateringService): Promise<CateringAddOn[]> {
  return mockDelay(
    service.addOnIds.map((id) => addOnById.get(id)).filter((a): a is CateringAddOn => Boolean(a)),
  );
}

/** Resolve a caterer's cuisine names for display (FK lookup). */
export async function getServiceCuisines(service: CateringService): Promise<Cuisine[]> {
  return mockDelay(
    service.cuisineIds.map((id) => cuisineById.get(id)).filter((c): c is Cuisine => Boolean(c)),
  );
}

/** 6-char human quote reference, e.g. "QT-8F3A21", derived from a timestamp. */
function quoteNumberFrom(ms: number): string {
  return `QT-${ms.toString(36).toUpperCase().slice(-6).padStart(6, "0")}`;
}

export interface RequestQuoteInput {
  service: QuoteService;
  packageId: string | null;
  packageName: string | null;
  eventType: EventType;
  serviceStyle: ServiceStyle;
  eventDate: string;
  guests: number;
  venue: QuoteVenue;
  contact: QuoteContact;
  addOns: QuoteAddOnLine[];
  notes: string | null;
  pricing: CateringPricing;
}

/**
 * Submit a quotation request. Simulated: a real endpoint would notify the
 * caterer and enqueue a workflow; here we model the round-trip latency and
 * return the fully-formed quote in `requested` status. The client caches it in
 * the quotes store, where the confirmation/status page reads it back by id.
 */
export async function requestQuote(input: RequestQuoteInput): Promise<Result<CateringQuote>> {
  await mockDelay(null, 900);

  if (input.guests <= 0) return { data: null, error: "errors.guestsRequired" };
  if (!input.eventDate) return { data: null, error: "errors.dateRequired" };

  const now = Date.now();
  const iso = new Date(now).toISOString();

  const quote: CateringQuote = {
    id: `qte_${now.toString(36)}`,
    quoteNumber: quoteNumberFrom(now),
    service: input.service,
    packageId: input.packageId,
    packageName: input.packageName,
    eventType: input.eventType,
    serviceStyle: input.serviceStyle,
    eventDate: input.eventDate,
    guests: input.guests,
    venue: input.venue,
    contact: input.contact,
    addOns: input.addOns,
    notes: input.notes,
    pricing: input.pricing,
    status: "requested",
    requestedAt: iso,
    createdAt: iso,
    updatedAt: iso,
    deletedAt: null,
  };

  return ok(quote);
}

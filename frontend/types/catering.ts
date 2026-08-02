import type { BaseEntity, DietaryTag, GeoPoint } from "./common";

/**
 * catering.ts — the event-catering vertical (Phase C17). A `CateringService` is
 * a caterer that quotes for events rather than a delivery vendor; it offers
 * per-guest `CateringPackage`s and optional `CateringAddOn`s, and a customer
 * submits a `CateringQuote` request (custom quotation + package builder +
 * calendar booking). IDs are stable and every cross-reference (package.serviceId,
 * service.addOnIds, quote.packageId, …) resolves against another seed, exactly
 * as foreign keys would.
 */

/** Event categories the platform caters for (spec: CATERING). */
export type EventType =
  | "wedding"
  | "corporate"
  | "birthday"
  | "conference"
  | "outdoor";

/** How the food is served — drives both filtering and the package builder. */
export type ServiceStyle =
  | "buffet"
  | "plated"
  | "family-style"
  | "food-stations"
  | "drop-off";

export interface CateringService extends BaseEntity {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  logo: string;
  cover: string;
  /** Portfolio imagery shown on the detail page. */
  gallery: string[];
  eventTypes: EventType[];
  /** Cuisines this caterer covers (FK → cuisines.ts `cus_*`). */
  cuisineIds: string[];
  dietary: DietaryTag[];
  serviceStyles: ServiceStyle[];
  /** Optional extras this caterer offers (FK → cateringAddOns `cao_*`). */
  addOnIds: string[];
  rating: number; // 0–5
  reviewCount: number;
  location: GeoPoint;
  /** Guest-capacity window this caterer accepts. */
  minGuests: number;
  maxGuests: number;
  /** Advertised "from" price per guest, in `currency`. */
  pricePerGuestFrom: number;
  currency: string;
  /** Minimum notice required to book, in days. */
  leadTimeDays: number;
  /** Short selling points (staffing, setup…) — DATA strings, like taglines. */
  highlights: string[];
  isFeatured: boolean;
}

/** A per-guest menu package offered by a caterer for a given event type. */
export interface CateringPackage extends BaseEntity {
  serviceId: string;
  slug: string;
  name: string;
  description: string;
  image: string;
  eventType: EventType;
  serviceStyle: ServiceStyle;
  pricePerGuest: number; // in the caterer's currency
  minGuests: number;
  /** What each guest is served — menu highlights (DATA strings). */
  courses: string[];
  /** Service inclusions bundled with the package (staff, setup, tableware…). */
  includes: string[];
  isPopular: boolean;
}

/** Whether an add-on is priced per guest or as a flat event fee. */
export type AddOnUnit = "per-guest" | "flat";

export interface CateringAddOn extends BaseEntity {
  slug: string;
  name: string;
  description: string;
  price: number; // per guest or flat, per `unit`
  unit: AddOnUnit;
  currency: string;
}

/** Lifecycle of a quotation request. Simulated — starts at `requested`. */
export type QuoteStatus =
  | "requested"
  | "reviewing"
  | "quoted"
  | "confirmed"
  | "declined";

/** Immutable snapshot of the caterer stored on a quote (like CartVendor). */
export interface QuoteService {
  id: string;
  slug: string;
  name: string;
  currency: string;
  countryCode: string;
}

/** A resolved add-on line on a quote, with its computed amount for this event. */
export interface QuoteAddOnLine {
  id: string;
  name: string;
  unit: AddOnUnit;
  price: number;
  /** price × guests for per-guest add-ons, else the flat price. */
  amount: number;
}

export interface QuoteContact {
  name: string;
  phone: string;
  email: string;
  company: string | null;
}

export interface QuoteVenue {
  city: string;
  area: string;
  address: string | null;
}

/**
 * The estimated pricing snapshot on a quote — pure-derived, mirrors
 * `OrderPricing`. In production the caterer confirms a final figure; this is the
 * indicative estimate shown to the customer at request time.
 */
export interface CateringPricing {
  currency: string;
  pricePerGuest: number;
  guests: number;
  /** pricePerGuest × guests. */
  packageSubtotal: number;
  addOnsTotal: number;
  serviceFee: number;
  serviceFeeRate: number;
  tax: number;
  taxLabel: string;
  taxRate: number;
  total: number;
}

/** A submitted quotation request — the record `requestQuote` fabricates. */
export interface CateringQuote extends BaseEntity {
  quoteNumber: string;
  service: QuoteService;
  /** Selected package, or null for a fully custom menu request. */
  packageId: string | null;
  packageName: string | null;
  eventType: EventType;
  serviceStyle: ServiceStyle;
  /** Event date as a plain ISO date ("YYYY-MM-DD"). */
  eventDate: string;
  guests: number;
  venue: QuoteVenue;
  contact: QuoteContact;
  addOns: QuoteAddOnLine[];
  notes: string | null;
  pricing: CateringPricing;
  status: QuoteStatus;
  requestedAt: string;
}

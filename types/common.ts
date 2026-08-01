/**
 * common.ts — shared primitives referenced across domain entities.
 *
 * Every mock entity carries the same audit/soft-delete shape a real database
 * row would (spec: Soft Delete, Audit Fields), so the mock layer maps 1:1 onto
 * the eventual Prisma models with minimal refactoring.
 */

/** ISO-8601 timestamp string. */
export type ISODate = string;

/** Base fields every persisted entity shares. */
export interface BaseEntity {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  /** Soft-delete marker; null when active. */
  deletedAt: ISODate | null;
}

/** Geographic point + human-readable address. */
export interface GeoPoint {
  lat: number;
  lng: number;
  address: string;
  city: string;
  countryCode: string;
}

/** A monetary amount is always a plain number in the entity's currency code. */
export interface Money {
  amount: number;
  currency: string;
}

/** Dietary / attribute tags used across search & filters. */
export type DietaryTag =
  | "halal"
  | "vegetarian"
  | "vegan"
  | "gluten-free"
  | "keto"
  | "healthy"
  | "spicy";

/** Vendor kinds the platform lists. */
export type VendorType =
  | "restaurant"
  | "cafe"
  | "cloud-kitchen"
  | "home-chef"
  | "catering";

/**
 * How a courier gets around. Shared vocabulary: it is both a property of the
 * rider (their registered vehicle, Phase C18) and of the courier snapshot the
 * customer's tracker shows (Phase C9).
 */
export type RiderVehicle = "bike" | "scooter" | "bicycle" | "car";

/** Weekday key — the vocabulary for opening hours and recurring schedules. */
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** Opening hours for a single weekday (24h "HH:mm", null = closed). */
export interface DayHours {
  open: string | null;
  close: string | null;
}
export type WeeklyHours = Record<Weekday, DayHours>;

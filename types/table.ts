import type { BaseEntity } from "./common";

/**
 * table.ts — dine-in tables belonging to a vendor.
 *
 * Seeded now for POS Lite (Phase C11) dine-in ticketing and reused by Table
 * Booking (Phase C16). Occupancy/reservation is runtime state derived from
 * reservations, not stored on the entity, so a table row maps cleanly onto the
 * eventual Prisma `Table` model.
 */

/** Seating area a table sits in. */
export type TableZone = "indoor" | "outdoor" | "rooftop" | "private";

export interface RestaurantTable extends BaseEntity {
  vendorId: string;
  /** Short floor label, e.g. "T1", "P2". */
  label: string;
  seats: number;
  zone: TableZone;
}

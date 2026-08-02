import type { RestaurantTable, TableZone } from "@/frontend/types";
import { SEED_NOW } from "./cuisines";

/**
 * tables.ts — dine-in floor plans per vendor. Seeded for POS Lite (C11) dine-in
 * ticketing and reused by Table Booking (C16). Only sit-down venues
 * (restaurants + cafes) have tables; cloud kitchens / home chefs do not.
 */
const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

type TableDef = [label: string, seats: number, zone: TableZone];

function floor(vendorId: string, defs: TableDef[]): RestaurantTable[] {
  const short = vendorId.replace(/^ven_/, "");
  return defs.map(([label, seats, zone]) => ({
    ...base,
    id: `tbl_${short}_${label.toLowerCase()}`,
    vendorId,
    label,
    seats,
    zone,
  }));
}

export const tables: RestaurantTable[] = [
  ...floor("ven_bella_napoli", [
    ["T1", 2, "indoor"],
    ["T2", 2, "indoor"],
    ["T3", 4, "indoor"],
    ["T4", 4, "indoor"],
    ["T5", 6, "indoor"],
    ["P1", 8, "private"],
    ["R1", 4, "rooftop"],
    ["R2", 4, "rooftop"],
  ]),
  ...floor("ven_sakura_sushi", [
    ["T1", 2, "indoor"],
    ["T2", 2, "indoor"],
    ["T3", 4, "indoor"],
    ["B1", 1, "indoor"],
    ["B2", 1, "indoor"],
    ["P1", 6, "private"],
  ]),
  ...floor("ven_spice_route", [
    ["T1", 4, "indoor"],
    ["T2", 4, "indoor"],
    ["T3", 6, "indoor"],
    ["O1", 4, "outdoor"],
    ["O2", 4, "outdoor"],
  ]),
  ...floor("ven_bangkok_house", [
    ["T1", 2, "indoor"],
    ["T2", 4, "indoor"],
    ["T3", 4, "indoor"],
    ["T4", 6, "indoor"],
  ]),
  ...floor("ven_the_daily_grind", [
    ["C1", 2, "indoor"],
    ["C2", 2, "indoor"],
    ["C3", 4, "indoor"],
    ["O1", 2, "outdoor"],
  ]),
  ...floor("ven_sugar_spoon", [
    ["T1", 2, "indoor"],
    ["T2", 2, "indoor"],
    ["T3", 4, "indoor"],
  ]),
];

export const tablesByVendor: Record<string, RestaurantTable[]> = tables.reduce(
  (acc, t) => {
    (acc[t.vendorId] ??= []).push(t);
    return acc;
  },
  {} as Record<string, RestaurantTable[]>,
);

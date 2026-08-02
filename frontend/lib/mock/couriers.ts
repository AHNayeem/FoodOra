import type { Courier } from "@/frontend/types";
import { SEED_NOW } from "./cuisines";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

/**
 * couriers.ts — the demo rider pool. A courier is assigned to a delivery order
 * once it is picked up (Phase C9 tracking). Deterministically selected per
 * order id in `services/orders.getCourier`, so the same order always shows the
 * same rider. Maps onto the future `Courier` / `Rider` model.
 */
export const couriers: Courier[] = [
  {
    ...base,
    id: "cour_rakib",
    name: "Rakib Hasan",
    phone: "+8801811556677",
    vehicle: "bike",
    rating: 4.9,
    trips: 1284,
    photo: null,
  },
  {
    ...base,
    id: "cour_shanto",
    name: "Shanto Ahmed",
    phone: "+8801922334455",
    vehicle: "scooter",
    rating: 4.8,
    trips: 973,
    photo: null,
  },
  {
    ...base,
    id: "cour_jamil",
    name: "Jamil Uddin",
    phone: "+8801733445566",
    vehicle: "bicycle",
    rating: 4.7,
    trips: 612,
    photo: null,
  },
];

export const courierById = new Map(couriers.map((c) => [c.id, c]));

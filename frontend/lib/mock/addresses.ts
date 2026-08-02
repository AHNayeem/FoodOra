import type { SavedAddress } from "@/frontend/types";
import { SEED_NOW } from "./cuisines";

const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

/**
 * addresses.ts — the demo customer's address book, surfaced at checkout so a
 * reviewer can place an order in one tap without typing an address. Tied to
 * `usr_customer` (see users seed); maps onto the future `Address` model.
 */
export const savedAddresses: SavedAddress[] = [
  {
    ...base,
    id: "addr_home",
    userId: "usr_customer",
    label: "Home",
    recipient: "Ayasha Rahman",
    phone: "+8801711223344",
    line1: "House 42, Road 11",
    line2: "Flat B3",
    area: "Banani",
    city: "Dhaka",
    countryCode: "BD",
    instructions: "Ring the bell twice; leave at the door if no answer.",
    isDefault: true,
  },
  {
    ...base,
    id: "addr_work",
    userId: "usr_customer",
    label: "Work",
    recipient: "Ayasha Rahman",
    phone: "+8801711223344",
    line1: "Level 7, Kawran Bazar Tower",
    line2: null,
    area: "Tejgaon",
    city: "Dhaka",
    countryCode: "BD",
    instructions: "Call on arrival — reception will not accept deliveries.",
    isDefault: false,
  },
];

export const addressById = new Map(savedAddresses.map((a) => [a.id, a]));

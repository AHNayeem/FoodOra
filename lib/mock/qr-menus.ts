import type { QrMenuConfig } from "@/types";
import { SEED_NOW } from "./cuisines";

/**
 * qr-menus.ts — per-venue QR menu settings (Phase C12).
 *
 * Only sit-down venues run a table QR programme, so this seed lines up with
 * `tables.ts`. Venues differ deliberately: the fine-dining rooms take orders
 * and charge service, the coffee shop is browse-and-call-the-counter, the
 * dessert bar has no service charge. A venue with no row falls back to
 * `defaultQrConfig` in `services/qr.ts`, so every vendor still has a code.
 */
const base = { createdAt: SEED_NOW, updatedAt: SEED_NOW, deletedAt: null };

export const qrMenuConfigs: QrMenuConfig[] = [
  {
    ...base,
    id: "qrc_bella_napoli",
    vendorId: "ven_bella_napoli",
    welcomeMessage:
      "Benvenuti! Order straight from your table — the kitchen sees it instantly.",
    ordering: true,
    waiterCall: true,
    billRequest: true,
    serviceChargeRate: 0.1,
    askGuestName: true,
  },
  {
    ...base,
    id: "qrc_sakura_sushi",
    vendorId: "ven_sakura_sushi",
    welcomeMessage: "Irasshaimase. Send your nigiri order whenever you're ready.",
    ordering: true,
    waiterCall: true,
    billRequest: true,
    serviceChargeRate: 0.1,
    askGuestName: true,
  },
  {
    ...base,
    id: "qrc_spice_route",
    vendorId: "ven_spice_route",
    welcomeMessage: "Welcome in. Order in rounds — starters first is our advice.",
    ordering: true,
    waiterCall: true,
    billRequest: true,
    serviceChargeRate: 0.05,
    askGuestName: false,
  },
  {
    ...base,
    id: "qrc_bangkok_house",
    vendorId: "ven_bangkok_house",
    welcomeMessage: "Sawasdee! Tap to order, and tell us how hot you like it.",
    ordering: true,
    waiterCall: true,
    billRequest: true,
    serviceChargeRate: 0.05,
    askGuestName: false,
  },
  {
    ...base,
    id: "qrc_the_daily_grind",
    // A counter-service coffee shop: the menu is here, the ordering isn't.
    vendorId: "ven_the_daily_grind",
    welcomeMessage: "Have a browse, then order at the counter whenever you like.",
    ordering: false,
    waiterCall: false,
    billRequest: false,
    serviceChargeRate: 0,
    askGuestName: false,
  },
  {
    ...base,
    id: "qrc_sugar_spoon",
    vendorId: "ven_sugar_spoon",
    welcomeMessage: "Sweet things ahead. Order from your table — no service charge.",
    ordering: true,
    waiterCall: true,
    billRequest: true,
    serviceChargeRate: 0,
    askGuestName: false,
  },
];

export const qrMenuConfigByVendor: Record<string, QrMenuConfig> =
  qrMenuConfigs.reduce(
    (acc, c) => {
      acc[c.vendorId] = c;
      return acc;
    },
    {} as Record<string, QrMenuConfig>,
  );

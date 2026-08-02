import { foodsByVendor, menuSectionsByVendor, tablesByVendor } from "@/frontend/lib/mock";
import type {
  PosOrderType,
  PosPayment,
  PosPricing,
  PosSale,
  PosTicketLine,
  RestaurantTable,
} from "@/frontend/types";
import { saleNumberFrom } from "@/frontend/lib/pos";
import type { MenuSectionWithItems } from "./catalog";
import { mockDelay, ok, type Result } from "./http";

/**
 * pos.ts — read/write seam for POS Lite (Phase C11).
 *
 * `getPosCatalog` / `getPosTables` are backend-ready reads over the mock; the
 * terminal never touches `lib/mock` directly. `completeSale` simulates the
 * "close the drawer" write: it validates the ticket, then fabricates an
 * immutable `PosSale` the client commits to the register store (Phase E swaps
 * this for a real mutation and the terminal stays unchanged).
 */

/** Sellable menu for the terminal — sections with their available items only. */
export async function getPosCatalog(vendorId: string): Promise<MenuSectionWithItems[]> {
  const sections = [...(menuSectionsByVendor[vendorId] ?? [])].sort((a, b) => a.sort - b.sort);
  const items = foodsByVendor[vendorId] ?? [];
  const menu = sections.map((section) => ({
    ...section,
    items: items.filter(
      (f) => f.sectionId === section.id && f.isAvailable && !f.deletedAt,
    ),
  }));
  return mockDelay(menu.filter((s) => s.items.length > 0), 300);
}

/** The vendor's dine-in tables for the order-type selector. */
export async function getPosTables(vendorId: string): Promise<RestaurantTable[]> {
  return mockDelay((tablesByVendor[vendorId] ?? []).filter((t) => !t.deletedAt), 200);
}

export interface CompleteSaleInput {
  vendorId: string;
  orderType: PosOrderType;
  tableLabel: string | null;
  lines: PosTicketLine[];
  pricing: PosPricing;
  payment: PosPayment;
  cashierName: string;
}

/**
 * Close a sale. Validates the ticket is non-empty and (for cash) that enough
 * was tendered, then returns an immutable sale record. Error strings are
 * `pos`-scoped i18n keys the terminal surfaces via a toast.
 */
export async function completeSale(input: CompleteSaleInput): Promise<Result<PosSale>> {
  if (input.lines.length === 0) {
    return { data: null, error: "errors.empty" };
  }
  if (
    input.payment.method === "cash" &&
    input.payment.tendered != null &&
    input.payment.tendered < input.pricing.total
  ) {
    return { data: null, error: "errors.insufficientCash" };
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const sale: PosSale = {
    id: `pos_${nowMs.toString(36)}`,
    saleNumber: saleNumberFrom(nowMs),
    vendorId: input.vendorId,
    orderType: input.orderType,
    tableLabel: input.tableLabel,
    lines: input.lines,
    pricing: input.pricing,
    payment: input.payment,
    cashierName: input.cashierName,
    soldAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
  };

  return mockDelay(ok(sale), 500);
}

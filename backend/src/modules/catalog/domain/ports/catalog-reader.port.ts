import type { FoodItemRecord, VendorRecord } from '../models';

export const CATALOG_READER = Symbol('CATALOG_READER');

/**
 * The catalog, as another module is allowed to see it.
 *
 * D1's dependency rule lets a module import another module's `domain/` and nothing else,
 * which is what makes this file the cart's only legitimate route to a dish's price. The
 * alternative — the cart's repository reading `food_items` directly — would put two
 * modules' `select` clauses on one table and give the option-group projection two owners.
 *
 * It is deliberately two by-id lookups rather than anything richer. The cart does not
 * browse, search or page; it needs to answer "does this dish exist, what does it really
 * cost, and which options may be chosen for it" — and the price has to come from here
 * rather than from the client, because a client-supplied price is a discount anyone can
 * grant themselves.
 *
 * `CATALOG_REPOSITORY` already satisfies this shape, so `CatalogModule` binds this token
 * with `useExisting`. That is not a shortcut: the reader is a *narrowed view* of the
 * repository, and expressing it as a separate interface is what stops the cart from
 * reaching the other six methods.
 */
export interface CatalogReaderPort {
  findVendorById(vendorId: string): Promise<VendorRecord | null>;
  findFoodById(foodId: string): Promise<FoodItemRecord | null>;
}

import type { FoodItem, FoodOptionGroup, MenuSection } from "./catalog";
import type { ISODate } from "./common";

/**
 * menu.ts — authoring a menu, and the stock behind it (Phase 9, G19–G21).
 *
 * **There is no second menu model here.** A section a merchant creates is a
 * `MenuSection`; an item they create is a `FoodItem`; an option group they build is
 * a `FoodOptionGroup`. Those three shapes already existed, the customer's menu and
 * its customiser already consume them, and inventing a parallel `VendorMenuItem`
 * would have meant a translation layer between what a restaurant edits and what a
 * customer orders — which is the one place a food platform cannot afford a
 * translation layer.
 *
 * What this file adds is the two things the catalog genuinely does not have:
 *
 *  - **A draft.** The catalog is a read-only seed (and, behind `LIVE.catalog`, a
 *    server-owned table), so an edit cannot be written into it. `MenuDraft` is the
 *    *diff* — created rows, field patches, removals, ordering — expressed in the
 *    catalog's own types, exactly as `stores/merchant.unavailable` has always been
 *    the diff for availability. `lib/menu` applies it. Phase E replays the same
 *    patches as mutations and the shapes do not change.
 *  - **Stock.** `FoodItem.isAvailable` is a boolean, and the spec asks for counts,
 *    a low-stock warning and an automatic out-of-stock state. A count is not a
 *    field the catalog has, so it is recorded per item here — and availability
 *    stays *derived* from it rather than being written twice.
 */

/**
 * How much of one item is left.
 *
 * Only tracked items have a record: most of a menu is cooked to order and counting
 * it would be fiction. Absence therefore means "not tracked", which is why there is
 * no `tracked: boolean` — a flag on a record that only exists when tracking is on
 * would be a second way to say the same thing, and the two could disagree.
 */
export interface MenuItemStock {
  foodId: string;
  /** Units left. Zero means the item sells itself out — see `stockStateOf`. */
  quantity: number;
  /** At or below this, the desk is warned. Zero disables the warning. */
  lowStockThreshold: number;
  updatedAt: ISODate;
}

/** What the stock count means, once. */
export type StockState =
  /** No count kept — availability is the merchant's own switch. */
  | "untracked"
  | "in-stock"
  | "low"
  | "out";

/**
 * The fields a merchant may edit on an item.
 *
 * A subset of `FoodItem`, and the omissions are the argument: `id`, `slug` and
 * `vendorId` are identity, and `rating`/`reviewCount` are what customers said —
 * a menu editor that could rewrite its own rating would make every rating on the
 * platform worthless (spec §5.4). `isAvailable` is absent too: availability is
 * derived from the 86 switch and the stock count, so there is one answer.
 */
export type MenuItemPatch = Partial<
  Pick<
    FoodItem,
    | "name"
    | "description"
    | "image"
    | "price"
    | "compareAtPrice"
    | "dietary"
    | "spicyLevel"
    | "calories"
    | "isPopular"
    | "sectionId"
    | "optionGroups"
  >
>;

/** The fields a merchant may edit on a section. `sort` is how reordering is stored. */
export type MenuSectionPatch = Partial<Pick<MenuSection, "name" | "sort">>;

/**
 * Everything one restaurant has changed about its menu.
 *
 * Keyed by vendor in `stores/menu` rather than carrying a global list, because a
 * draft is only ever applied to the menu it belongs to and an id collision across
 * two restaurants would be silent.
 *
 * `removedSectionIds` / `removedItemIds` are removals rather than deletions on
 * purpose: the seed cannot be mutated, so "delete" records that this restaurant no
 * longer offers the row. That is also what a real soft delete would do — the
 * catalog's own `deletedAt` — and it means an accidental deletion is recoverable
 * rather than a hole in somebody's menu.
 */
export interface MenuDraft {
  vendorId: string;
  createdSections: MenuSection[];
  sectionPatch: Record<string, MenuSectionPatch>;
  /**
   * Sections switched off. Distinct from removed: a disabled section is still the
   * restaurant's menu (a seasonal set, a breakfast list at dinner time) and comes
   * back with one tap, while a removed one is gone from the board.
   */
  disabledSectionIds: string[];
  removedSectionIds: string[];
  createdItems: FoodItem[];
  itemPatch: Record<string, MenuItemPatch>;
  removedItemIds: string[];
  /** Food id → stock. Only tracked items appear. */
  stock: Record<string, MenuItemStock>;
}

/**
 * One item as the merchant's board shows it: the effective record, plus why it is
 * or is not orderable.
 *
 * Derived, never stored. `live` is the single answer to "can a customer order this
 * right now", computed from three separate facts — the section being enabled, the
 * merchant's 86 switch, and the stock count — so no surface has to remember all
 * three.
 */
export interface MenuBoardItem {
  item: FoodItem;
  /** Created on this device rather than seeded — the row says so. */
  authored: boolean;
  stock: MenuItemStock | null;
  stockState: StockState;
  /** The merchant has marked it unavailable by hand. */
  suppressed: boolean;
  /** The count ran out, so it took itself off the menu. */
  outOfStock: boolean;
  live: boolean;
}

/** One section as the merchant's board shows it. */
export interface MenuBoardSection {
  section: MenuSection;
  authored: boolean;
  enabled: boolean;
  items: MenuBoardItem[];
}

/** A new or edited option group, before it is validated. */
export interface OptionGroupDraft {
  id: string | null;
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: FoodOptionGroup["options"];
}

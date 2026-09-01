/**
 * availability.js — the derived answers, and nothing that touches a database.
 *
 * Module 5's counterpart to module 4's `hours.js` and `geo.js`: the fields that
 * are computed on every read because storing them would mean storing the same
 * fact twice. `tests/menu-rules.test.js` covers this whole file with no
 * PostgreSQL at all, which is only possible because nothing here reads a clock it
 * was not handed or a row it did not receive.
 *
 * ## The one rule the whole module turns on
 *
 * BACKEND-REQUIREMENTS §3 row 5 states it in a line —
 *
 *     availability = merchant switch AND (untracked OR in stock)
 *
 * — and `catalog.prisma` says the same thing on `FoodItem.isAvailable` in the
 * schema's own words: *"The read model ANDs this with stock: `isAvailable =
 * isAvailable AND (inventory is null OR inventory.inStock)`"*. So `isAvailable` is
 * **two different fields with one name**, and keeping them straight is the whole
 * of `deriveItemAvailability`:
 *
 *  - the **column** is the merchant's 86 switch. A person flicked it. It is
 *    written by `PUT /items/:id/availability` and by nothing else;
 *  - the **read-model field** is that switch ANDed with stock, the section being
 *    active and the menu being active. It is written by nobody.
 *
 * `frontend/lib/menu.ts::isLive` is the same fold on the mock path — item switch
 * AND section enabled AND not suppressed AND not out of stock — so the two sides
 * take a dish off the menu at the same moment. The one term this file does not
 * carry is `suppressed`, the frontend's `stores/merchant.unavailable` list: that
 * is a client-side 86 list layered over a read-only seed, and the column here *is*
 * the switch it stands in for. Folding it in twice would be the same fact counted
 * twice.
 *
 * ## Why stock is a Decimal and not a number
 *
 * `onHand`, `reserved` and `lowStockAt` are `Decimal(14,3)` because a kilogram of
 * chicken is not an integer. `main.prisma` §5 keeps the arithmetic in `Decimal`
 * and converts once at the API boundary, so every comparison below is a `Decimal`
 * comparison and the conversion happens in `service.js`'s projection.
 */
import { Prisma } from "@foodora/database";
import { localParts, toMinutes } from "../catalog/hours.js";

const ZERO = new Prisma.Decimal(0);

/** A `Decimal` from whatever the caller had — a row's Decimal, a JSON number, a string. */
export function dec(value) {
  if (Prisma.Decimal.isDecimal(value)) return value;
  if (value === null || value === undefined) return ZERO;
  return new Prisma.Decimal(typeof value === "number" ? value.toString() : String(value));
}

/**
 * `types/menu.ts::StockState` — the four answers a count can give.
 *
 * `untracked` is a real answer rather than a default, and `lib/menu.ts` explains
 * why in the words the product needs: *"most of a menu is cooked to order, and
 * reporting '0 left' for a dish nobody counts would take the whole menu off
 * sale"*. So the absence of a row means untracked, and so does a row whose
 * `trackStock` is false — the schema's own switch for "never auto-disable this
 * one".
 */
export const STOCK_STATES = Object.freeze(["untracked", "in-stock", "low", "out"]);

/**
 * What is left, and what that means.
 *
 * `available = onHand − reserved` is `catalog.prisma`'s definition on
 * `InventoryItem.reserved`, not a choice made here: stock held by an order that
 * has not been handed over is not stock a second customer can buy. Nothing
 * reserves anything yet — the cart is module 6 and the order is module 8 — so
 * `reserved` is zero across this module's own writes, and the subtraction is here
 * so that it keeps being right when they land rather than being retrofitted.
 *
 * The low-stock threshold is *inclusive* and a threshold of zero disables the
 * warning, both copied from `lib/menu.ts::stockStateOf` so the merchant's board
 * turns amber at the same count on either path.
 *
 * @param {{ trackStock: boolean, onHand: unknown, reserved: unknown, lowStockAt: unknown } | null} inventory
 */
export function stockStateOf(inventory) {
  if (!inventory || inventory.trackStock !== true) return "untracked";
  const available = dec(inventory.onHand).minus(dec(inventory.reserved));
  if (available.lte(ZERO)) return "out";
  const threshold = dec(inventory.lowStockAt);
  if (threshold.gt(ZERO) && available.lte(threshold)) return "low";
  return "in-stock";
}

/** `available = onHand − reserved`, as a `Decimal`. The number availability is decided on. */
export const availableQuantity = (inventory) =>
  inventory ? dec(inventory.onHand).minus(dec(inventory.reserved)) : ZERO;

/**
 * Can a customer order this dish right now, and if not, why not?
 *
 * The reason is returned beside the boolean because the merchant's board has to
 * show it — "you turned this off" and "it sold out" are different problems with
 * different fixes, and a bare `false` makes the screen guess. The customer's menu
 * ignores the reason and reads the boolean.
 *
 * The order of the checks is the order of the fixes: a dish inside a switched-off
 * section is not fixed by restocking it.
 */
export function deriveItemAvailability({ item, inventory = null, sectionActive = true, menuActive = true }) {
  const stockState = stockStateOf(inventory);

  if (!menuActive) return { isAvailable: false, reason: "menu-inactive", stockState };
  if (!sectionActive) return { isAvailable: false, reason: "section-inactive", stockState };
  if (item.isAvailable !== true) return { isAvailable: false, reason: "switched-off", stockState };
  if (stockState === "out") return { isAvailable: false, reason: "out-of-stock", stockState };

  return { isAvailable: true, reason: null, stockState };
}

/**
 * Is a menu inside its own availability window?
 *
 * `Menu.availableFrom` / `availableTo` are the schema's optional `"HH:mm"` pair —
 * *"e.g. a breakfast menu"*. A menu with neither serves all day, which is the
 * common case and the only one onboarding will mint.
 *
 * Read in the **branch's** timezone, through module 4's `localParts`, for the
 * reason module 4 gave about `isOpen`: a breakfast menu belongs to the morning
 * where the restaurant is, not where the server is. A menu whose window is
 * unparseable serves all day rather than never — the failure of a decorative
 * field should not take a restaurant's whole menu off sale.
 *
 * An inverted pair (`22:00`–`02:00`) is read as an overnight window, the same
 * reading `hours.js` gives an overnight service, because "from ten at night to
 * two in the morning" is the only thing a late menu can mean.
 */
export function menuServesAt(menu, { now = new Date(), timezone = "UTC" } = {}) {
  const from = toMinutes(menu.availableFrom);
  const to = toMinutes(menu.availableTo);
  if (from === null || to === null) return true;

  const { minutes } = localParts(now, timezone);
  if (from === to) return true;
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

/**
 * Which of a vendor's menus is *the* menu for a kind, right now.
 *
 * Resolution order, and each step is a decision rather than a tie-break:
 *
 *  1. **active, undeleted menus of the requested kind.** `MenuKind` separates the
 *     delivery board from the QR, POS, dine-in and catering ones — that is what
 *     `catalog.prisma` says the column is for — so they never merge;
 *  2. **serving right now.** A breakfast menu at dinner time is not the menu, and
 *     there is deliberately **no fallback to a closed one**: answering with a
 *     board the kitchen will not cook from is worse than answering with nothing.
 *     A vendor whose only menu is windowed is closed for that kind out of hours,
 *     which is what the window was set to mean;
 *  3. **`isDefault` first, then name.** `@@unique([vendorId, kind, name])` makes
 *     the name a stable tie-break, so two callers a millisecond apart get the same
 *     menu.
 *
 * Returns `null` when nothing serves. The caller renders an empty menu, not a 404:
 * the vendor exists and has simply nothing on the board at this hour.
 */
export function resolveMenu(menus, { now = new Date(), timezone = "UTC" } = {}) {
  const serving = menus
    .filter((menu) => menu.isActive === true)
    .filter((menu) => menuServesAt(menu, { now, timezone }));

  if (serving.length === 0) return null;

  return [...serving].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name),
  )[0];
}

export default { dec, stockStateOf, availableQuantity, deriveItemAvailability, menuServesAt, resolveMenu };

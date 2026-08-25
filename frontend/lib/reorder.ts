import type {
  CartLine,
  CartSelectedOption,
  CartVendor,
  MenuBoardItem,
  MenuDraft,
  MenuSectionWithItems,
  Order,
} from "@/types";
import { lineUnitPrice, makeLineId } from "./cart";
import { buildMenuBoard, emptyMenuDraft } from "./menu";

/**
 * reorder.ts — turning a past order back into a basket (Phase 17, G35).
 *
 * "Reorder" used to be a link to the restaurant's page, which is a suggestion
 * rather than a reorder: the customer still had to remember what they had, find
 * each dish and re-pick every option. Rebuilding the basket is the actual
 * feature, and the whole difficulty of it is that **the menu has moved on**.
 * Phase 9 made that a real possibility rather than a hypothetical — a restaurant
 * can now delete a dish, reprice it, 86 it, sell out of it, or rebuild its option
 * groups — so a reorder that trusted the order's own snapshot would put a price
 * in the basket that checkout does not charge and dishes in it that the kitchen
 * cannot cook.
 *
 * So every line is re-resolved against the menu *as it is now*, and what comes
 * back is a **plan** rather than a basket: what can be reordered, what changed,
 * and what cannot be had. The decision belongs on screen — dropping a sold-out
 * side silently changes somebody's dinner, and refusing the whole order over one
 * missing drink is worse (the open question Phase 16 left for this one).
 *
 * Pure, and free of both stores and mock data: the caller supplies the current
 * menu (`services/catalog`), the restaurant's own edits (`stores/menu`) and its 86
 * list (`stores/merchant`), and this folds them through `lib/menu` — the same fold
 * the merchant's board and the customer's add-to-cart button use, so a reorder
 * cannot disagree with either about what is orderable.
 */

/**
 * What is different about a line now.
 *
 * `null` means nothing is — same dish, same options, same money. The four cases
 * are separated because they need different answers from the customer: a price
 * change is information, a dropped extra is a change to what they will eat, a
 * required choice that no longer exists needs them to make a new one, and a
 * missing dish cannot be resolved here at all.
 */
export type ReorderIssue =
  /** The dish is off the menu, 86'd or sold out. Nothing to add. */
  | "unavailable"
  /**
   * A group the dish *requires* no longer offers what was chosen, so the line
   * cannot be rebuilt without a decision. Excluded from the basket and linked to
   * the dish, rather than guessed at: substituting somebody's size or spice level
   * for them is the one failure mode a reorder must not have.
   */
  | "needs-choice"
  /** Optional extras that no longer exist were dropped; the line still works. */
  | "options-changed"
  /** Same dish, same options, different price. */
  | "repriced";

export interface ReorderLine {
  /** The line as it was ordered, for the "you had…" column. */
  original: CartLine;
  /** The line as it would go in the basket now; null when it cannot. */
  line: CartLine | null;
  issue: ReorderIssue | null;
  /** Names of the choices that no longer exist — what the customer is told. */
  droppedOptions: string[];
}

export interface ReorderPlan {
  /**
   * The vendor snapshot the new basket carries — the restaurant *as it is now*,
   * not as the order remembers it. Delivery fee, minimum and the free-delivery
   * threshold all live on this snapshot and all can have changed since.
   */
  vendor: CartVendor;
  lines: ReorderLine[];
  /** What can go in the basket, in the order's own order. */
  available: CartLine[];
  /** Lines needing the customer to know something before they commit. */
  changed: ReorderLine[];
  /** Lines that cannot be reordered at all. */
  unavailable: ReorderLine[];
  /** Nothing on this order is orderable any more. */
  empty: boolean;
  /** What the basket would come to, before delivery — and what it came to then. */
  subtotal: number;
  previousSubtotal: number;
}

/**
 * The menu as it actually is, indexed by dish id.
 *
 * The fold is `lib/menu.buildMenuBoard` — the merchant's own — so an item this
 * says is orderable is an item their board says is orderable. A dish the
 * restaurant deleted is simply absent from the map, which is why every lookup
 * below treats "missing" and "not live" as the same answer.
 */
function currentMenuItems(
  menu: MenuSectionWithItems[],
  vendorId: string,
  draft: MenuDraft | null | undefined,
  suppressed: readonly string[] = [],
): Map<string, MenuBoardItem> {
  const board = buildMenuBoard(menu, draft ?? emptyMenuDraft(vendorId), suppressed);
  const index = new Map<string, MenuBoardItem>();
  for (const section of board) {
    // A disabled section is not on the customer's menu, so nothing in it can be
    // reordered — the same rule `publishedMenu` applies.
    if (!section.enabled) continue;
    for (const entry of section.items) index.set(entry.item.id, entry);
  }
  return index;
}

/** Rebuild one line against the dish as it is now. */
function replanLine(original: CartLine, entry: MenuBoardItem | undefined): ReorderLine {
  if (!entry || !entry.live) {
    return {
      original,
      line: null,
      issue: "unavailable",
      droppedOptions: [],
    };
  }

  const item = entry.item;
  const kept: CartSelectedOption[] = [];
  const dropped: string[] = [];

  for (const chosen of original.options) {
    const group = item.optionGroups.find((g) => g.id === chosen.groupId);
    const option = group?.options.find((o) => o.id === chosen.optionId);
    if (!group || !option) {
      dropped.push(chosen.name);
      continue;
    }
    // Re-read the name and the delta from the menu rather than from the order:
    // a "Large" that now costs ৳40 more must cost ৳40 more in the new basket.
    kept.push({
      groupId: group.id,
      optionId: option.id,
      name: option.name,
      priceDelta: option.priceDelta,
    });
  }

  /**
   * A required group that lost its answer.
   *
   * `min` is the number of choices the group demands; a required group demands at
   * least one whether or not its `min` says so, which is the same reading
   * `optionGroupError` enforces when the group is authored.
   */
  const unsatisfied = item.optionGroups.some((group) => {
    const need = group.required ? Math.max(1, group.min) : group.min;
    if (need === 0) return false;
    return kept.filter((o) => o.groupId === group.id).length < need;
  });

  if (unsatisfied) {
    return {
      original,
      line: null,
      issue: "needs-choice",
      droppedOptions: dropped,
    };
  }

  const unitPrice = lineUnitPrice(item.price, kept);
  const line: CartLine = {
    id: makeLineId(item.id, kept.map((o) => o.optionId)),
    foodId: item.id,
    name: item.name,
    image: item.image,
    basePrice: item.price,
    unitPrice,
    quantity: original.quantity,
    options: kept,
  };

  const issue: ReorderIssue | null =
    dropped.length > 0
      ? "options-changed"
      : unitPrice !== original.unitPrice
        ? "repriced"
        : null;

  return { original, line, issue, droppedOptions: dropped };
}

/**
 * Plan a reorder of `order` against the restaurant's current menu.
 *
 * Note what it does *not* do: put anything in a basket, or decide what to do
 * about a line it could not rebuild. Both belong to the surface, because both are
 * the customer's call.
 */
export function planReorder(input: {
  order: Order;
  /** The restaurant now. Falls back to the order's snapshot if it has vanished. */
  vendor: CartVendor | null;
  menu: MenuSectionWithItems[];
  draft: MenuDraft | null | undefined;
  suppressed?: readonly string[];
}): ReorderPlan {
  const { order, menu, draft, suppressed = [] } = input;
  const vendor = input.vendor ?? order.vendor;
  const items = currentMenuItems(menu, order.vendor.id, draft, suppressed);

  const lines = order.lines.map((line) => replanLine(line, items.get(line.foodId)));
  const available = lines.map((l) => l.line).filter((l): l is CartLine => l !== null);

  return {
    vendor,
    lines,
    available,
    changed: lines.filter((l) => l.line !== null && l.issue !== null),
    unavailable: lines.filter((l) => l.line === null),
    empty: available.length === 0,
    subtotal: available.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    previousSubtotal: order.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
  };
}

/** Is anything about this reorder worth stopping the customer for? */
export function hasReorderChanges(plan: ReorderPlan): boolean {
  return plan.changed.length > 0 || plan.unavailable.length > 0;
}

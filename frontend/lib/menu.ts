import type {
  DietaryTag,
  FoodItem,
  FoodOptionGroup,
  MenuBoardItem,
  MenuBoardSection,
  MenuDraft,
  MenuItemPatch,
  MenuItemStock,
  MenuSection,
  MenuSectionPatch,
  MenuSectionWithItems,
  OptionGroupDraft,
  StockState,
} from "@/types";
import { slugify } from "./utils";

/**
 * menu.ts — the menu builder's domain (Phase 9, G19–G21).
 *
 * The dashboard's menu screen was a read-only list with an availability switch, and
 * the file said so: "full item authoring — the Menu Builder — lands in a later
 * phase". This is that phase, and it is written to the same rule as every other
 * domain module here: **one model, and nothing computes anything twice.**
 *
 * Three things live in this file and nowhere else:
 *
 *  1. **The authoring operations.** Every one takes a draft and returns a new
 *     draft; none of them reads a clock or a store (`now` is passed in, as
 *     `lib/settlement` takes it). So `stores/menu` is a thin commit layer and the
 *     rules are testable without a browser.
 *  2. **The overlay.** `buildMenuBoard` folds the draft over the read-only catalog
 *     to produce the menu as it actually is. There is one fold, used by the
 *     merchant's board and by the customer's item resolution, so the two cannot
 *     drift — which is exactly how a menu editor ends up showing a price the
 *     checkout does not charge.
 *  3. **What "available" means.** Three separate facts decide it — the section
 *     being enabled, the merchant's 86 switch, and the stock count — and they are
 *     combined in `isLive` alone. `FoodItem.isAvailable` is *not* written by any
 *     operation here: an item that sold out has a count of zero, and the boolean is
 *     derived from it. Storing both is how a menu ends up with an item that is
 *     simultaneously in stock and unavailable.
 *
 * The 86 switch itself stays in `stores/merchant.unavailable`, where it has always
 * been and where the POS terminal already reads it. Moving it here would have meant
 * migrating a persisted list and giving availability two homes for the sake of
 * tidiness.
 */

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

export function emptyMenuDraft(vendorId: string): MenuDraft {
  return {
    vendorId,
    createdSections: [],
    sectionPatch: {},
    disabledSectionIds: [],
    removedSectionIds: [],
    createdItems: [],
    itemPatch: {},
    removedItemIds: [],
    stock: {},
  };
}

/** Has this restaurant changed anything? Used to decide whether to say so. */
export function isMenuDraftEmpty(draft: MenuDraft): boolean {
  return (
    draft.createdSections.length === 0 &&
    Object.keys(draft.sectionPatch).length === 0 &&
    draft.disabledSectionIds.length === 0 &&
    draft.removedSectionIds.length === 0 &&
    draft.createdItems.length === 0 &&
    Object.keys(draft.itemPatch).length === 0 &&
    draft.removedItemIds.length === 0 &&
    Object.keys(draft.stock).length === 0
  );
}

/** What the builder can refuse. Keys, so callers translate them. */
export type MenuError =
  | "errors.nameRequired"
  | "errors.priceRequired"
  | "errors.sectionRequired"
  | "errors.sectionNotFound"
  | "errors.itemNotFound"
  | "errors.optionRangeInvalid"
  | "errors.optionsRequired"
  | "errors.stockInvalid";

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/**
 * A new section, appended after everything already on the board.
 *
 * `sort` is read off the existing sections rather than counted from the created
 * ones, because a restaurant that has reordered its seeded sections has sort values
 * this needs to come after. `now` gives the id its uniqueness — two sections created
 * in the same second would collide, which is why the id also carries the name.
 */
export function createSection(
  draft: MenuDraft,
  existing: MenuSection[],
  name: string,
  now: number,
): { draft: MenuDraft; section: MenuSection | null; error: MenuError | null } {
  const clean = name.trim();
  if (!clean) return { draft, section: null, error: "errors.nameRequired" };

  const at = new Date(now).toISOString();
  const sort = existing.reduce((max, s) => Math.max(max, s.sort), 0) + 1;
  const taken = new Set([
    ...existing.map((s) => s.id),
    ...draft.createdSections.map((s) => s.id),
  ]);
  const section: MenuSection = {
    id: uniqueId(`sec_${slugify(draft.vendorId)}_${slugify(clean)}_${now.toString(36)}`, taken),
    vendorId: draft.vendorId,
    name: clean,
    sort,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
  return {
    draft: { ...draft, createdSections: [...draft.createdSections, section] },
    section,
    error: null,
  };
}

/**
 * Rename or re-sort a section.
 *
 * A created section is edited in place; a seeded one gets a patch. Deliberately not
 * "always patch", because a created section that also carried a patch of itself
 * would have two names in one draft and the fold would have to pick.
 */
export function patchSection(
  draft: MenuDraft,
  sectionId: string,
  patch: MenuSectionPatch,
): { draft: MenuDraft; error: MenuError | null } {
  if (patch.name != null && !patch.name.trim()) {
    return { draft, error: "errors.nameRequired" };
  }
  const clean: MenuSectionPatch = {
    ...patch,
    ...(patch.name != null ? { name: patch.name.trim() } : {}),
  };

  const created = draft.createdSections.find((s) => s.id === sectionId);
  if (created) {
    return {
      draft: {
        ...draft,
        createdSections: draft.createdSections.map((s) =>
          s.id === sectionId ? { ...s, ...clean } : s,
        ),
      },
      error: null,
    };
  }
  return {
    draft: {
      ...draft,
      sectionPatch: {
        ...draft.sectionPatch,
        [sectionId]: { ...draft.sectionPatch[sectionId], ...clean },
      },
    },
    error: null,
  };
}

/**
 * Move a section one place up or down.
 *
 * Implemented as a *swap of sort values* with its neighbour on the resolved board,
 * not as a rewrite of every row: only the two sections that actually changed places
 * get a patch, so a restaurant that nudges one heading does not end up with a draft
 * claiming it edited all nine. `sections` must be the board's current order — the
 * caller has it, and re-deriving it here would need the whole catalog.
 */
export function moveSection(
  draft: MenuDraft,
  sections: MenuSection[],
  sectionId: string,
  direction: "up" | "down",
): { draft: MenuDraft; error: MenuError | null } {
  const ordered = [...sections].sort((a, b) => a.sort - b.sort);
  const index = ordered.findIndex((s) => s.id === sectionId);
  if (index === -1) return { draft, error: "errors.sectionNotFound" };

  const target = ordered[index + (direction === "up" ? -1 : 1)];
  // Already at the end. Not an error: the button is disabled there, and a caller
  // that asks anyway should get the board back unchanged rather than a message.
  if (!target) return { draft, error: null };

  const self = ordered[index]!;
  let next = patchSection(draft, self.id, { sort: target.sort }).draft;
  next = patchSection(next, target.id, { sort: self.sort }).draft;
  return { draft: next, error: null };
}

/**
 * Switch a section off, or back on.
 *
 * Off hides the whole section from customers and leaves it on the merchant's board.
 * The items inside keep their own state, so turning a breakfast section back on at
 * 7am restores exactly what was there — including anything that was 86'd.
 */
export function setSectionEnabled(
  draft: MenuDraft,
  sectionId: string,
  enabled: boolean,
): MenuDraft {
  const disabled = new Set(draft.disabledSectionIds);
  if (enabled) disabled.delete(sectionId);
  else disabled.add(sectionId);
  return { ...draft, disabledSectionIds: [...disabled] };
}

/**
 * Remove a section, and everything in it.
 *
 * The items go too, because a section is how a menu is navigated: leaving its items
 * behind would put them nowhere a customer could find them and nowhere the merchant
 * could get them back. A created section is dropped from the draft outright — there
 * is no seed row to remember — while a seeded one is recorded as removed.
 */
export function removeSection(
  draft: MenuDraft,
  sectionId: string,
  itemIds: string[],
): MenuDraft {
  const wasCreated = draft.createdSections.some((s) => s.id === sectionId);
  const removedItems = new Set(draft.removedItemIds);
  const createdItemIds = new Set(draft.createdItems.map((i) => i.id));
  for (const id of itemIds) {
    if (!createdItemIds.has(id)) removedItems.add(id);
  }

  return {
    ...draft,
    createdSections: draft.createdSections.filter((s) => s.id !== sectionId),
    createdItems: draft.createdItems.filter((i) => !itemIds.includes(i.id)),
    sectionPatch: omit(draft.sectionPatch, sectionId),
    disabledSectionIds: draft.disabledSectionIds.filter((id) => id !== sectionId),
    removedSectionIds: wasCreated
      ? draft.removedSectionIds
      : [...new Set([...draft.removedSectionIds, sectionId])],
    removedItemIds: [...removedItems],
    itemPatch: itemIds.reduce((acc, id) => omit(acc, id), draft.itemPatch),
    stock: itemIds.reduce((acc, id) => omit(acc, id), draft.stock),
  };
}

/** Undo a removal — the seed row is still there, so it can come back. */
export function restoreSection(draft: MenuDraft, sectionId: string): MenuDraft {
  return {
    ...draft,
    removedSectionIds: draft.removedSectionIds.filter((id) => id !== sectionId),
  };
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** What the item form collects. A `FoodItem` minus everything it may not set. */
export interface MenuItemDraft {
  sectionId: string;
  name: string;
  description: string;
  image: string;
  price: number;
  compareAtPrice: number | null;
  dietary: DietaryTag[];
  spicyLevel: 0 | 1 | 2 | 3;
  calories: number | null;
  isPopular: boolean;
  optionGroups: FoodOptionGroup[];
}

export function emptyMenuItemDraft(sectionId = ""): MenuItemDraft {
  return {
    sectionId,
    name: "",
    description: "",
    image: "",
    price: 0,
    compareAtPrice: null,
    dietary: [],
    spicyLevel: 0,
    calories: null,
    isPopular: false,
    optionGroups: [],
  };
}

/**
 * Field errors for an item, keyed by field.
 *
 * The same shape `vendorStepErrors` returns, for the same reason: the form renders
 * them beside the inputs and the domain decides what is wrong, so the dialog cannot
 * accept something the store would refuse.
 */
export function menuItemErrors(draft: MenuItemDraft): Record<string, MenuError> {
  const errors: Record<string, MenuError> = {};
  if (!draft.name.trim()) errors.name = "errors.nameRequired";
  if (!draft.sectionId) errors.sectionId = "errors.sectionRequired";
  if (!Number.isFinite(draft.price) || draft.price <= 0) {
    errors.price = "errors.priceRequired";
  }
  for (const group of draft.optionGroups) {
    const problem = optionGroupError(group);
    if (problem) errors[`optionGroups.${group.id}`] = problem;
  }
  return errors;
}

/**
 * A new item.
 *
 * Built as a real `FoodItem` — the same record the seed holds and the same one the
 * customer's card, customiser and cart line consume — so nothing downstream can
 * tell an authored dish from a seeded one. Rating and reviews start at zero rather
 * than at a flattering default, for the reason Phase 6 gave when minting a listing:
 * a seeded 4.6 on a dish nobody has eaten is exactly the fake value §5.4 forbids.
 */
export function createItem(
  draft: MenuDraft,
  input: MenuItemDraft,
  now: number,
): { draft: MenuDraft; item: FoodItem | null; errors: Record<string, MenuError> } {
  const errors = menuItemErrors(input);
  if (Object.keys(errors).length) return { draft, item: null, errors };

  const at = new Date(now).toISOString();
  const slug = uniqueId(
    `${slugify(input.name)}-${now.toString(36)}`,
    new Set(draft.createdItems.map((i) => i.slug)),
  );
  const item: FoodItem = {
    id: `food_${slug}`,
    slug,
    vendorId: draft.vendorId,
    sectionId: input.sectionId,
    name: input.name.trim(),
    description: input.description.trim(),
    image: input.image.trim(),
    price: input.price,
    compareAtPrice: input.compareAtPrice,
    dietary: input.dietary,
    spicyLevel: input.spicyLevel,
    calories: input.calories,
    rating: 0,
    reviewCount: 0,
    isPopular: input.isPopular,
    isAvailable: true,
    optionGroups: input.optionGroups,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
  return {
    draft: { ...draft, createdItems: [...draft.createdItems, item] },
    item,
    errors: {},
  };
}

/** Save an edit. A created item is edited in place; a seeded one gets a patch. */
export function editItem(
  draft: MenuDraft,
  itemId: string,
  input: MenuItemDraft,
): { draft: MenuDraft; errors: Record<string, MenuError> } {
  const errors = menuItemErrors(input);
  if (Object.keys(errors).length) return { draft, errors };

  const patch: MenuItemPatch = {
    sectionId: input.sectionId,
    name: input.name.trim(),
    description: input.description.trim(),
    image: input.image.trim(),
    price: input.price,
    compareAtPrice: input.compareAtPrice,
    dietary: input.dietary,
    spicyLevel: input.spicyLevel,
    calories: input.calories,
    isPopular: input.isPopular,
    optionGroups: input.optionGroups,
  };

  if (draft.createdItems.some((i) => i.id === itemId)) {
    return {
      draft: {
        ...draft,
        createdItems: draft.createdItems.map((i) =>
          i.id === itemId ? { ...i, ...patch } : i,
        ),
      },
      errors: {},
    };
  }
  return {
    draft: {
      ...draft,
      itemPatch: { ...draft.itemPatch, [itemId]: { ...draft.itemPatch[itemId], ...patch } },
    },
    errors: {},
  };
}

/** Take an item off the menu for good. Its stock record goes with it. */
export function removeItem(draft: MenuDraft, itemId: string): MenuDraft {
  const wasCreated = draft.createdItems.some((i) => i.id === itemId);
  return {
    ...draft,
    createdItems: draft.createdItems.filter((i) => i.id !== itemId),
    itemPatch: omit(draft.itemPatch, itemId),
    stock: omit(draft.stock, itemId),
    removedItemIds: wasCreated
      ? draft.removedItemIds
      : [...new Set([...draft.removedItemIds, itemId])],
  };
}

export function restoreItem(draft: MenuDraft, itemId: string): MenuDraft {
  return { ...draft, removedItemIds: draft.removedItemIds.filter((id) => id !== itemId) };
}

/** The form's starting values for an existing item. */
export function itemDraftFrom(item: FoodItem): MenuItemDraft {
  return {
    sectionId: item.sectionId,
    name: item.name,
    description: item.description,
    image: item.image,
    price: item.price,
    compareAtPrice: item.compareAtPrice,
    dietary: item.dietary,
    spicyLevel: item.spicyLevel,
    calories: item.calories,
    isPopular: item.isPopular,
    optionGroups: item.optionGroups,
  };
}

// ---------------------------------------------------------------------------
// Option groups (G20)
// ---------------------------------------------------------------------------

/**
 * What is wrong with an option group, if anything.
 *
 * The rules are the customiser's own, read backwards. `ItemCustomizer` preselects a
 * required group up to `min` and caps selection at `max`, so a group with `min > max`
 * or no options renders as a control the customer cannot satisfy — and a required
 * group with `min` of zero is not required at all. Validating here rather than in
 * the dialog is what stops an unorderable dish reaching a customer.
 */
export function optionGroupError(group: OptionGroupDraft | FoodOptionGroup): MenuError | null {
  if (!group.name.trim()) return "errors.nameRequired";
  if (group.options.length === 0) return "errors.optionsRequired";
  if (
    group.min < 0 ||
    group.max < 1 ||
    group.min > group.max ||
    group.max > group.options.length ||
    (group.required && group.min < 1)
  ) {
    return "errors.optionRangeInvalid";
  }
  if (group.options.some((o) => !o.name.trim())) return "errors.nameRequired";
  return null;
}

/**
 * Add or replace one option group on an item draft.
 *
 * Works on the *item draft* rather than on the menu draft, because a group is only
 * ever edited inside the item dialog and saving the item is what commits it. That
 * keeps "cancel" meaning cancel: an abandoned dialog leaves no half-built group
 * behind on the menu.
 */
export function putOptionGroup(
  item: MenuItemDraft,
  group: OptionGroupDraft,
  now: number,
): { item: MenuItemDraft; error: MenuError | null } {
  const error = optionGroupError(group);
  if (error) return { item, error };

  const id = group.id ?? `opt_${slugify(group.name)}_${now.toString(36)}`;
  const built: FoodOptionGroup = {
    id,
    name: group.name.trim(),
    required: group.required,
    min: group.min,
    max: group.max,
    options: group.options.map((o, index) => ({
      id: o.id || `${id}_${index}`,
      name: o.name.trim(),
      priceDelta: o.priceDelta,
    })),
  };

  const exists = item.optionGroups.some((g) => g.id === id);
  return {
    item: {
      ...item,
      optionGroups: exists
        ? item.optionGroups.map((g) => (g.id === id ? built : g))
        : [...item.optionGroups, built],
    },
    error: null,
  };
}

export function removeOptionGroup(item: MenuItemDraft, groupId: string): MenuItemDraft {
  return { ...item, optionGroups: item.optionGroups.filter((g) => g.id !== groupId) };
}

export function emptyOptionGroupDraft(): OptionGroupDraft {
  return { id: null, name: "", required: false, min: 0, max: 1, options: [] };
}

export function optionGroupDraftFrom(group: FoodOptionGroup): OptionGroupDraft {
  return { ...group, options: [...group.options] };
}

// ---------------------------------------------------------------------------
// Inventory (G21)
// ---------------------------------------------------------------------------

/**
 * What a stock record means.
 *
 * No record is `untracked`, and that is a real answer rather than a default: most of
 * a menu is cooked to order, and reporting "0 left" for a dish nobody counts would
 * take the whole menu off sale.
 */
export function stockStateOf(stock: MenuItemStock | null | undefined): StockState {
  if (!stock) return "untracked";
  if (stock.quantity <= 0) return "out";
  if (stock.lowStockThreshold > 0 && stock.quantity <= stock.lowStockThreshold) {
    return "low";
  }
  return "in-stock";
}

/** Start tracking an item, or set its count outright. */
export function setStock(
  draft: MenuDraft,
  foodId: string,
  { quantity, lowStockThreshold }: { quantity: number; lowStockThreshold: number },
  now: number,
): { draft: MenuDraft; error: MenuError | null } {
  if (
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    !Number.isInteger(lowStockThreshold) ||
    lowStockThreshold < 0
  ) {
    return { draft, error: "errors.stockInvalid" };
  }
  return {
    draft: {
      ...draft,
      stock: {
        ...draft.stock,
        [foodId]: {
          foodId,
          quantity,
          lowStockThreshold,
          updatedAt: new Date(now).toISOString(),
        },
      },
    },
    error: null,
  };
}

/**
 * Move a tracked count by a delta — the spec's manual adjustment.
 *
 * Floors at zero rather than going negative: "minus three" on a count of two means
 * the shelf is empty, not that the kitchen owes anybody a curry. An untracked item
 * is left alone, because adjusting a count that does not exist would start tracking
 * something the merchant never asked to track.
 */
export function adjustStock(
  draft: MenuDraft,
  foodId: string,
  delta: number,
  now: number,
): { draft: MenuDraft; error: MenuError | null } {
  const current = draft.stock[foodId];
  if (!current) return { draft, error: "errors.stockInvalid" };
  if (!Number.isInteger(delta)) return { draft, error: "errors.stockInvalid" };
  return setStock(
    draft,
    foodId,
    {
      quantity: Math.max(0, current.quantity + delta),
      lowStockThreshold: current.lowStockThreshold,
    },
    now,
  );
}

/** Stop counting. Availability falls back to the merchant's own switch. */
export function untrackStock(draft: MenuDraft, foodId: string): MenuDraft {
  return { ...draft, stock: omit(draft.stock, foodId) };
}

// ---------------------------------------------------------------------------
// The fold — one menu, two readers
// ---------------------------------------------------------------------------

/**
 * Is this item orderable right now?
 *
 * The one place the three facts meet. Called by the fold below and by
 * `effectiveItem` for a single dish, so the merchant's board, the POS grid and the
 * customer's add-to-cart button all get the same answer.
 */
export function isLive({
  item,
  sectionEnabled,
  suppressed,
  stockState,
}: {
  item: FoodItem;
  sectionEnabled: boolean;
  suppressed: boolean;
  stockState: StockState;
}): boolean {
  return item.isAvailable && sectionEnabled && !suppressed && stockState !== "out";
}

/**
 * The menu as it actually is: the read-only catalog with the draft folded over it.
 *
 * Sections come from the seed plus anything created, minus anything removed, ordered
 * by the `sort` the reordering wrote. Items are re-bucketed by their *effective*
 * `sectionId`, so moving a dish between sections is a field edit rather than a
 * special case.
 *
 * `suppressed` is `stores/merchant.unavailable`, injected rather than read: this
 * module has no store, and the 86 list is deliberately still where the POS terminal
 * already finds it.
 */
export function buildMenuBoard(
  base: MenuSectionWithItems[],
  draft: MenuDraft,
  suppressed: readonly string[] = [],
): MenuBoardSection[] {
  const removedSections = new Set(draft.removedSectionIds);
  const removedItems = new Set(draft.removedItemIds);
  const disabled = new Set(draft.disabledSectionIds);
  const suppressedIds = new Set(suppressed);
  const createdItemIds = new Set(draft.createdItems.map((i) => i.id));

  const sections: MenuSection[] = [
    // The items are stripped here and re-bucketed below, so a dish moved between
    // sections needs no special case.
    ...base.map((s) => ({ ...sectionOf(s), ...draft.sectionPatch[s.id] })),
    ...draft.createdSections.map((s) => ({ ...s, ...draft.sectionPatch[s.id] })),
  ].filter((s) => !removedSections.has(s.id));

  const items: FoodItem[] = [
    ...base
      .flatMap((s) => s.items)
      .filter((i) => !removedItems.has(i.id))
      .map((i) => ({ ...i, ...draft.itemPatch[i.id] })),
    ...draft.createdItems.map((i) => ({ ...i, ...draft.itemPatch[i.id] })),
  ];

  return sections
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((section) => {
      const enabled = !disabled.has(section.id);
      return {
        section,
        authored: draft.createdSections.some((s) => s.id === section.id),
        enabled,
        items: items
          .filter((item) => item.sectionId === section.id)
          .map((item) => {
            const stock = draft.stock[item.id] ?? null;
            const stockState = stockStateOf(stock);
            const isSuppressed = suppressedIds.has(item.id);
            return {
              item,
              authored: createdItemIds.has(item.id),
              stock,
              stockState,
              suppressed: isSuppressed,
              outOfStock: stockState === "out",
              live: isLive({
                item,
                sectionEnabled: enabled,
                suppressed: isSuppressed,
                stockState,
              }),
            } satisfies MenuBoardItem;
          }),
      } satisfies MenuBoardSection;
    });
}

/**
 * The same board as a customer sees it: only what is live, and only sections that
 * still have something in them.
 *
 * Shaped as `MenuSectionWithItems` — what `services/catalog.getVendorMenu` returns —
 * so a caller can swap one for the other. An empty section is dropped for the reason
 * the mock layer already drops it: a heading with nothing under it reads as a failed
 * load.
 */
export function publishedMenu(board: MenuBoardSection[]): MenuSectionWithItems[] {
  return board
    .filter((s) => s.enabled)
    .map((s) => ({ ...s.section, items: s.items.filter((i) => i.live).map((i) => i.item) }))
    .filter((s) => s.items.length > 0);
}

/**
 * One dish, resolved — for the surfaces that hold an item and not a menu.
 *
 * The customer's add-to-cart button and the QR table row receive a single `FoodItem`
 * from a server render, which cannot see a client draft. This is how they pick up
 * the authored price, the authored option groups and the stock state without
 * refetching the whole menu, and it is the *same* patch the fold applies rather than
 * a second interpretation of the draft.
 *
 * A removed item resolves to `null`: it is no longer on the menu, and returning the
 * seed row would let a customer order something the restaurant deleted.
 */
export function effectiveItem(
  item: FoodItem,
  draft: MenuDraft | null | undefined,
  suppressed: readonly string[] = [],
): MenuBoardItem | null {
  if (!draft) {
    const stockState: StockState = "untracked";
    const isSuppressed = suppressed.includes(item.id);
    return {
      item,
      authored: false,
      stock: null,
      stockState,
      suppressed: isSuppressed,
      outOfStock: false,
      live: isLive({ item, sectionEnabled: true, suppressed: isSuppressed, stockState }),
    };
  }
  if (draft.removedItemIds.includes(item.id)) return null;

  const patched = { ...item, ...draft.itemPatch[item.id] };
  if (draft.removedSectionIds.includes(patched.sectionId)) return null;

  const stock = draft.stock[item.id] ?? null;
  const stockState = stockStateOf(stock);
  const isSuppressed = suppressed.includes(item.id);
  const sectionEnabled = !draft.disabledSectionIds.includes(patched.sectionId);

  return {
    item: patched,
    authored: draft.createdItems.some((i) => i.id === item.id),
    stock,
    stockState,
    suppressed: isSuppressed,
    outOfStock: stockState === "out",
    live: isLive({ item: patched, sectionEnabled, suppressed: isSuppressed, stockState }),
  };
}

/** Counts for the board's header: what is on the menu, and what is orderable. */
export function menuCounts(board: MenuBoardSection[]): {
  sections: number;
  items: number;
  live: number;
  low: number;
  out: number;
} {
  const items = board.flatMap((s) => s.items);
  return {
    sections: board.length,
    items: items.length,
    live: items.filter((i) => i.live).length,
    low: items.filter((i) => i.stockState === "low").length,
    out: items.filter((i) => i.stockState === "out").length,
  };
}

// ---------------------------------------------------------------------------

/**
 * `base`, or `base-2`, `base-3`… until it is not already taken.
 *
 * `now` alone is not enough: two dishes with the same name created in the same
 * millisecond would mint the same id, and the fold would then show one of them twice
 * and the other never. A real backend gets uniqueness from the database; here it
 * comes from checking the draft, which is the only place a collision can happen.
 */
function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** The section half of a `MenuSectionWithItems`, without its items. */
function sectionOf(section: MenuSectionWithItems): MenuSection {
  return {
    id: section.id,
    vendorId: section.vendorId,
    name: section.name,
    sort: section.sort,
    createdAt: section.createdAt,
    updatedAt: section.updatedAt,
    deletedAt: section.deletedAt,
  };
}

/** Drop one key from a record, without mutating it. */
function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * service.js — the menu, the modifiers and the stock behind them.
 *
 * `repository.js` speaks Prisma, `availability.js` and `options.js` hold the
 * rules that need no database, and this file is where a request meets all three.
 * The controller passes plain values in and gets `{ payload }` or
 * `{ refusal, path }` back — module 2's convention, so the envelope decision is
 * made once, in `shared/errors/envelope.js`, and not per route.
 *
 * ## `isAvailable` means two different things and both are right
 *
 * The single most important thing to know before changing anything here.
 * `catalog.prisma` says the column is the merchant's switch and the read model is
 * that switch ANDed with stock, so this module projects a dish **two ways**:
 *
 *  - **the customer's menu** — `isAvailable` is the derived answer. It is what
 *    `add-to-cart-button.tsx` reads, and a dish that sold out has to come back
 *    `false` there or somebody orders it;
 *  - **the merchant's board** — `isAvailable` is the raw column, and the derived
 *    answer travels beside it as `live`, with `suppressed`, `outOfStock` and
 *    `stockState` saying which of the three reasons applies. That is exactly
 *    `types/menu.ts::MenuBoardItem`, and `lib/menu.ts::isLive` reads
 *    `item.isAvailable` as the switch for the same reason: a board that showed
 *    the derived value could not offer a switch to turn back on.
 *
 * Getting this backwards produces the two classic bugs at once — a sold-out dish
 * a customer can order, and a switch the merchant cannot flick because the UI
 * thinks it is already off.
 *
 * ## Ownership is a column comparison, and it is checked here as well as at the route
 *
 * Every route below `/vendors/:vendorId` is guarded by module 3's
 * `requireVendorAccess`, so a caller who is not a member of that vendor never
 * reaches this file. That is **not** enough on its own: the guard proves the
 * caller may act on the vendor in the path, not that the section, item, group or
 * option they also named belongs to it. So every write re-reads the row and
 * compares its `vendorId` — the denormalised column `catalog.prisma` put on
 * `MenuSection` and `FoodItem` precisely so this is one comparison rather than a
 * join — and a mismatch is a **404, not a 403**. A restaurant owner probing ids
 * should not be able to learn which of them exist at a competitor.
 */
import { badRequest, conflict, forbidden, notFound } from "../../shared/errors/app-error.js";
import { toApiEnum } from "../../shared/utils/enums.js";
import { toJsonSafe, toDecimal } from "../../shared/utils/serialize.js";
import { toSkipTake } from "../../shared/utils/pagination.js";
import { availableQuantity, dec, deriveItemAvailability, menuServesAt, resolveMenu } from "./availability.js";
import { GROUP_ERRORS, checkSelection, groupError } from "./options.js";

/** `types/menu.ts::MenuError`, the members this module returns. */
export const MENU_ERRORS = Object.freeze({
  name: "errors.nameRequired",
  price: "errors.priceRequired",
  section: "errors.sectionRequired",
  sectionGone: "errors.sectionNotFound",
  itemGone: "errors.itemNotFound",
  stock: "errors.stockInvalid",
  ...GROUP_ERRORS,
});

/**
 * Staff roles that may author a menu.
 *
 * `frontend/lib/staff.ts::STAFF_PERMISSIONS` is the authority and grants
 * `menu.manage` to `owner` and `manager` and to nobody else — the kitchen holds
 * `kitchen.operate`, the counter holds `pos.operate`, and neither is a licence to
 * reprice a dish. The owner is not listed because they do not need to be:
 * `policy.js` treats `via === "owner"` as satisfying any `staffRole`, on the same
 * grounds `lib/staff.ts` gives the owner the whole grant table.
 *
 * **Why a staff *role* and not a staff *permission*.** `types/staff.ts::
 * StaffPermission` slugs are not `Permission` rows — `menu.manage` does not exist
 * in the database, `seed/data/reference.js` has the twenty platform slugs and
 * that is the closed set. M3 recorded this as a documented gap that **module 16**
 * closes. Until it does, vendor authorization is membership plus
 * `VendorStaff.role`, and this constant is where module 16 will find the mapping
 * it has to preserve.
 */
export const MANAGE_ROLES = Object.freeze(["manager"]);

/**
 * Staff roles that may take a dish off and put it back, and move stock.
 *
 * Wider than authoring on purpose, and it is the one place the two differ. The
 * pass runs out of sea bass at eight o'clock and 86s it; the counter counts what
 * is left at close. Neither is repricing anything, and a rule that made them
 * fetch the manager is a rule that gets worked around by leaving the dish on the
 * menu. `kitchen.operate` and `pos.operate` are the grants in `lib/staff.ts` that
 * say so.
 */
export const SERVICE_ROLES = Object.freeze(["manager", "kitchen", "cashier"]);

/** `types/common.ts::MenuKind` — the boards a vendor can keep. */
export const MENU_KINDS = Object.freeze(["delivery", "dine-in", "qr", "pos", "catering"]);

/** `catalog.prisma::StockMovementKind`. */
export const MOVEMENT_KINDS = Object.freeze(["received", "sold", "wasted", "adjusted", "returned", "transferred"]);

/**
 * Movement kinds whose sign is fixed by what the word means.
 *
 * `catalog.prisma` states it on the column — *"Signed: received > 0, sold < 0"* —
 * so a `sold` movement that increases stock is a data error rather than a
 * preference. `adjusted` and `transferred` are deliberately absent: a correction
 * goes either way, and a transfer is a receipt at one branch and an issue at the
 * other.
 */
const MOVEMENT_SIGN = Object.freeze({ received: 1, returned: 1, sold: -1, wasted: -1 });

/** A blank slug is not a slug. Mirrors `frontend/lib/utils.ts::slugify`. */
export function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

const trimmed = (value) => (typeof value === "string" ? value.trim() : value);
const isBlank = (value) => typeof value !== "string" || value.trim().length === 0;

export function createService({ repo, newId, log = null }) {
  // ---------------------------------------------------------------------------
  // Projections
  // ---------------------------------------------------------------------------

  /** `types/catalog.ts::MenuSection`. `menuId` and `isActive` are the board's, not the menu's. */
  const toSection = (row) =>
    toJsonSafe({
      id: row.id,
      vendorId: row.vendorId,
      name: row.name,
      sort: row.sort,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    });

  /**
   * `types/catalog.ts::FoodOptionGroup`, as a customer may use it.
   *
   * Two narrowings, both of which stop the customiser rendering a control nobody
   * can satisfy:
   *
   *  - **inactive options are dropped.** `FoodOption.isAvailable` is the
   *    merchant's per-option switch and an option that is off must not be
   *    selectable. `checkSelection` refuses one anyway, so this is the second of
   *    two independent guards rather than the only one;
   *  - **`max` is clamped to what is left, and `min` to `max`.** A group of three
   *    with `max: 3` and one option switched off would otherwise ask a customer to
   *    pick up to three of two. The stored numbers are untouched — the merchant's
   *    board shows what they set, and turning the option back on restores the
   *    group without a write.
   *
   * A group with no live options is dropped by the caller entirely.
   */
  function toPublicGroup(group) {
    const options = (group.options ?? []).filter((option) => option.isAvailable === true);
    const max = Math.min(group.max, options.length);
    return toJsonSafe({
      id: group.id,
      name: group.name,
      required: group.required,
      min: Math.min(group.min, max),
      max,
      options: options.map((option) => ({ id: option.id, name: option.name, priceDelta: option.priceDelta })),
    });
  }

  /**
   * `types/catalog.ts::FoodItem` — the customer's dish.
   *
   * `isAvailable` is the **derived** answer here. See the file header.
   */
  function toPublicItem(row, { sectionActive = true, menuActive = true } = {}) {
    const inventory = row.inventory ?? null;
    const { isAvailable } = deriveItemAvailability({ item: row, inventory, sectionActive, menuActive });

    return toJsonSafe({
      id: row.id,
      slug: row.slug,
      vendorId: row.vendorId,
      sectionId: row.sectionId,
      name: row.name,
      description: row.description,
      image: row.image,
      price: row.price,
      compareAtPrice: row.compareAtPrice,
      dietary: (row.dietary ?? []).map((tag) => toApiEnum("DietaryTagKind", tag.tag)),
      spicyLevel: row.spicyLevel,
      calories: row.calories,
      rating: row.rating,
      reviewCount: row.reviewCount,
      isPopular: row.isPopular,
      isAvailable,
      optionGroups: (row.optionGroups ?? [])
        .map(toPublicGroup)
        .filter((group) => group.options.length > 0),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    });
  }

  /**
   * `types/menu.ts::MenuItemStock`, widened by what the schema actually keeps.
   *
   * `quantity` is `onHand` rather than `onHand − reserved`, because
   * `MenuItemStock.quantity` is what the merchant's board shows and a cook
   * counting the shelf wants the shelf. `available` is the number availability is
   * decided on and is stated separately rather than folded in, so the two can
   * never be confused. Nothing reserves anything before module 6, so they are
   * equal today — see M5 §"Known limitations".
   */
  function toStock(inventory) {
    if (!inventory) return null;
    return toJsonSafe({
      foodId: inventory.foodId,
      inventoryId: inventory.id,
      branchId: inventory.branchId,
      quantity: inventory.onHand,
      reserved: inventory.reserved,
      available: availableQuantity(inventory),
      lowStockThreshold: inventory.lowStockAt,
      unit: inventory.unit,
      trackStock: inventory.trackStock,
      updatedAt: inventory.updatedAt,
      version: inventory.version,
    });
  }

  /**
   * `types/menu.ts::MenuBoardItem` — the merchant's dish.
   *
   * `item.isAvailable` is the **raw switch** and `live` is the derived answer.
   * `authored` is absent: it means "created on this device rather than seeded",
   * which is a fact about the prototype's local draft and not about a row.
   */
  function toBoardItem(row, { sectionActive, menuActive }) {
    const inventory = row.inventory ?? null;
    const { isAvailable: live, reason, stockState } = deriveItemAvailability({
      item: row,
      inventory,
      sectionActive,
      menuActive,
    });

    const item = toPublicItem(row, { sectionActive, menuActive });

    return toJsonSafe({
      item: {
        ...item,
        isAvailable: row.isAvailable,
        // Authoring fields the customer's `FoodItem` has no use for.
        sort: row.sort,
        sku: row.sku,
        prepMinutes: row.prepMinutes,
        version: row.version,
        // The merchant's board shows the group as it is stored, not as clamped.
        optionGroups: (row.optionGroups ?? []).map((group) =>
          toJsonSafe({
            id: group.id,
            name: group.name,
            required: group.required,
            min: group.min,
            max: group.max,
            options: (group.options ?? []).map((option) => ({
              id: option.id,
              name: option.name,
              priceDelta: option.priceDelta,
              isDefault: option.isDefault,
              isAvailable: option.isAvailable,
              sort: option.sort,
            })),
          }),
        ),
      },
      stock: toStock(inventory),
      stockState,
      suppressed: row.isAvailable !== true,
      outOfStock: stockState === "out",
      live,
      reason,
    });
  }

  const toMenu = (row, { timezone, now }) =>
    toJsonSafe({
      id: row.id,
      vendorId: row.vendorId,
      kind: toApiEnum("MenuKind", row.kind),
      name: row.name,
      isDefault: row.isDefault,
      isActive: row.isActive,
      availableFrom: row.availableFrom,
      availableTo: row.availableTo,
      isServingNow: row.isActive === true && menuServesAt(row, { now, timezone }),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
      version: row.version,
    });

  const toMovement = (row) =>
    toJsonSafe({
      id: row.id,
      itemId: row.itemId,
      kind: toApiEnum("StockMovementKind", row.kind),
      quantity: row.quantity,
      balance: row.balance,
      refEntity: row.refEntity,
      refId: row.refId,
      note: row.note,
      actorId: row.actorId,
      occurredAt: row.occurredAt,
    });

  // ---------------------------------------------------------------------------
  // Resolution — the row, and whether this caller may have named it
  // ---------------------------------------------------------------------------

  /**
   * The vendor, its primary branch timezone, or a 404.
   *
   * A vendor with no primary branch reads as UTC rather than failing: a menu is a
   * menu whether or not somebody has finished onboarding an address, and the only
   * thing the timezone decides here is which side of a breakfast window we are on.
   * It is logged, because a storefront without a branch is an onboarding bug.
   */
  async function vendorContext(vendorId) {
    const vendor = await repo.findVendorContext(vendorId);
    if (!vendor) throw notFound("Vendor");

    const [branch] = vendor.branches ?? [];
    if (!branch) {
      log?.warn?.({ vendorId }, "menu: vendor has no primary branch — menu windows read as UTC");
    }
    return { vendor, timezone: branch?.timezone ?? "UTC", branchId: branch?.id ?? null };
  }

  /** A row that belongs to another vendor is a row that does not exist. See the header. */
  function ownedBy(row, vendorId, what) {
    if (!row || row.vendorId !== vendorId) throw notFound(what);
    return row;
  }

  const menuOf = async (vendorId, menuId) => ownedBy(await repo.findMenu(menuId), vendorId, "Menu");
  const sectionOf = async (vendorId, sectionId) =>
    ownedBy(await repo.findSection(sectionId), vendorId, "Menu section");
  const itemOf = async (vendorId, itemId) => ownedBy(await repo.findItem(itemId), vendorId, "Menu item");

  async function groupOf(vendorId, groupId) {
    const group = await repo.findGroup(groupId);
    if (!group || !group.food || group.food.deletedAt !== null) throw notFound("Option group");
    ownedBy(group.food, vendorId, "Option group");
    return group;
  }

  async function optionOf(vendorId, optionId) {
    const option = await repo.findOption(optionId);
    if (!option || !option.group?.food || option.group.food.deletedAt !== null) throw notFound("Option");
    ownedBy(option.group.food, vendorId, "Option");
    return option;
  }

  /**
   * May this caller act on this branch's stock?
   *
   * `VendorStaff.branchId` is `catalog.prisma`'s own answer to "which location does
   * this person work at", and `null` means every branch. So a staff member scoped
   * to Gulshan may count Gulshan's shelves and not Banani's, and an owner — whose
   * access carries no branch — may count both. This is the resource boundary §5
   * asks for below the vendor level, and it is the only place the schema gives one:
   * a `FoodItem` has no branch, which is why authoring is refused outright for a
   * branch-scoped member rather than narrowed.
   */
  function branchAllowed(access, branchId) {
    if (!access?.branchId) return true;
    return branchId === access.branchId;
  }

  /**
   * Menu authoring is vendor-wide, so a member who works at one branch may not do it.
   *
   * Not a technicality: `FoodItem`, `MenuSection` and `Menu` carry a `vendorId` and
   * no `branchId`, so a manager at one location editing "the menu" edits every
   * location's. Refusing is the honest answer until the schema models a per-branch
   * menu; M5 §"Deferred" names what that would take.
   */
  function requireVendorWide(access) {
    if (access?.branchId) {
      throw forbidden("Menu authoring is vendor-wide and this membership is scoped to one branch", {
        details: { branchId: access.branchId },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /**
   * The customer's menu — `services/catalog.ts::getVendorMenu`'s answer.
   *
   * `MenuSectionWithItems[]`: sections in `sort` order, each with its dishes. Two
   * filters the mock path also applies, so the two agree card for card:
   *
   *  - **inactive sections are absent.** A seasonal set switched off is not on the
   *    board;
   *  - **empty sections are dropped.** `mockVendorMenu` ends with
   *    `.filter((s) => s.items.length > 0)` and a heading with nothing under it is
   *    a rendering bug either way.
   *
   * Unavailable dishes are **kept** by default and marked, because the customiser
   * shows a sold-out dish greyed rather than hiding it — a menu that shrank as the
   * evening went on would make a regular think the restaurant had stopped serving
   * their dish. `includeUnavailable=false` is there for the caller that wants only
   * what can be ordered.
   */
  async function vendorMenu(vendorId, { kind = "delivery", now = new Date(), includeUnavailable = true } = {}) {
    const { timezone } = await vendorContext(vendorId);

    const menus = await repo.findMenus(vendorId, { kind, includeInactive: false });
    const menu = resolveMenu(menus, { now, timezone });
    if (!menu) return [];

    const sections = await repo.findSections([menu.id], { includeInactive: false });
    if (sections.length === 0) return [];

    const items = await repo.findItems(sections.map((section) => section.id));

    const board = sections
      .map((section) => ({
        ...toSection(section),
        items: items
          .filter((item) => item.sectionId === section.id)
          .map((item) => toPublicItem(item, { sectionActive: true, menuActive: true }))
          .filter((item) => includeUnavailable || item.isAvailable),
      }))
      .filter((section) => section.items.length > 0);

    return board;
  }

  /**
   * The merchant's board — `types/menu.ts::MenuBoardSection[]`.
   *
   * Everything the customer's menu hides: inactive sections, switched-off dishes,
   * the stock behind each one and the reason it is not live. `menuId` picks one
   * board explicitly; without it the resolution is the customer's, so "what my
   * customers see right now" and "what I am editing" are the same rows.
   */
  async function board(vendorId, { kind = "delivery", menuId = null, now = new Date() } = {}) {
    const { timezone } = await vendorContext(vendorId);

    const menus = await repo.findMenus(vendorId, { kind: menuId ? null : kind });
    const menu = menuId ? menus.find((row) => row.id === menuId) : resolveMenu(menus, { now, timezone });
    if (!menu) return { menu: null, sections: [] };

    const sections = await repo.findSections([menu.id]);
    const items = sections.length > 0 ? await repo.findItems(sections.map((section) => section.id)) : [];

    return {
      menu: toMenu(menu, { timezone, now }),
      sections: sections.map((section) => ({
        section: { ...toSection(section), menuId: section.menuId, description: section.description, version: section.version },
        enabled: section.isActive,
        items: items
          .filter((item) => item.sectionId === section.id)
          .map((item) => toBoardItem(item, { sectionActive: section.isActive, menuActive: menu.isActive })),
      })),
    };
  }

  async function listMenus(vendorId, { kind = null, now = new Date() } = {}) {
    const { timezone } = await vendorContext(vendorId);
    const menus = await repo.findMenus(vendorId, { kind });
    return menus.map((menu) => toMenu(menu, { timezone, now }));
  }

  /** One dish, as a customer sees it. The section and menu it hangs off decide availability. */
  async function publicItem(vendorId, itemId) {
    const row = await itemOf(vendorId, itemId);
    return toPublicItem(row, {
      sectionActive: row.section?.isActive !== false,
      menuActive: row.section?.menu?.isActive !== false,
    });
  }

  /**
   * Is this selection orderable, and what does it cost?
   *
   * A **query**, answered at 200 with `success: true` whatever the verdict, and
   * `options.js::checkSelection` explains why it is not a refusal: the three locale
   * files have no message for "choose at least two", so a refusal here would put an
   * untranslated key on a screen. Module 6 calls the same function from the cart
   * and maps the codes to whatever it renders.
   */
  async function validateSelection(vendorId, itemId, optionIds) {
    const row = await itemOf(vendorId, itemId);
    const sectionActive = row.section?.isActive !== false;
    const menuActive = row.section?.menu?.isActive !== false;
    const { isAvailable } = deriveItemAvailability({
      item: row,
      inventory: row.inventory ?? null,
      sectionActive,
      menuActive,
    });

    const groups = (row.optionGroups ?? []).map((group) => ({
      id: group.id,
      min: group.min,
      max: group.max,
      required: group.required,
      options: group.options ?? [],
    }));

    const verdict = checkSelection({ item: row, groups, chosen: optionIds, available: isAvailable });

    // Money stays in `Decimal` until the boundary — `main.prisma` §5.
    let unitPrice = dec(row.price);
    const byId = new Map(
      (row.optionGroups ?? []).flatMap((group) => (group.options ?? []).map((option) => [option.id, option])),
    );
    for (const id of verdict.selected) unitPrice = unitPrice.plus(dec(byId.get(id).priceDelta));

    return toJsonSafe({
      itemId: row.id,
      valid: verdict.valid,
      violations: verdict.violations,
      selected: verdict.selected,
      basePrice: row.price,
      unitPrice,
    });
  }

  // ---------------------------------------------------------------------------
  // Menus
  // ---------------------------------------------------------------------------

  async function createMenu(vendorId, input, { access }) {
    requireVendorWide(access);
    await vendorContext(vendorId);

    if (isBlank(input.name)) return { refusal: MENU_ERRORS.name, path: "name" };

    const kind = input.kind ?? "delivery";
    const existing = await repo.findMenus(vendorId, { kind });
    if (existing.some((menu) => menu.name === trimmed(input.name))) {
      // `@@unique([vendorId, kind, name])`. Caught here so the answer is the
      // frontend's own key rather than a 409 the form cannot render.
      return { refusal: MENU_ERRORS.name, path: "name" };
    }

    const id = newId("menu");
    // The first menu of a kind is its default whatever the caller said: a kind
    // with no default resolves to nothing and the storefront looks empty.
    const isDefault = existing.length === 0 ? true : input.isDefault === true;

    const menu = await repo.createMenu({
      id,
      vendorId,
      kind,
      name: trimmed(input.name),
      isDefault,
      isActive: input.isActive ?? true,
      availableFrom: input.availableFrom ?? null,
      availableTo: input.availableTo ?? null,
    });

    if (isDefault) await repo.clearDefaults(vendorId, kind, id);

    const { timezone } = await vendorContext(vendorId);
    return { payload: toMenu(menu, { timezone, now: new Date() }) };
  }

  async function updateMenu(vendorId, menuId, input, { access }) {
    requireVendorWide(access);
    const current = await menuOf(vendorId, menuId);

    if ("name" in input && isBlank(input.name)) return { refusal: MENU_ERRORS.name, path: "name" };

    const data = {};
    for (const field of ["isActive", "isDefault"]) if (field in input) data[field] = input[field];
    if ("name" in input) data.name = trimmed(input.name);
    if ("availableFrom" in input) data.availableFrom = input.availableFrom;
    if ("availableTo" in input) data.availableTo = input.availableTo;

    const { count } = await repo.updateMenu(menuId, current.version, data);
    if (count === 0) throw conflict("The menu changed while you were editing it");

    if (data.isDefault === true) {
      await repo.clearDefaults(vendorId, toApiEnum("MenuKind", current.kind), menuId);
    }

    const { timezone } = await vendorContext(vendorId);
    return { payload: toMenu(await repo.findMenu(menuId), { timezone, now: new Date() }) };
  }

  /**
   * Remove a menu.
   *
   * Soft, because `Menu` carries `deletedAt` and `main.prisma` §3 says what that
   * means. The sections and dishes under it are **not** stamped: they cascade in
   * PostgreSQL on a hard delete and are unreachable through this module once the
   * menu is gone, and stamping thousands of rows to express one fact is how a
   * restore turns into an archaeology exercise.
   */
  async function deleteMenu(vendorId, menuId, { access }) {
    requireVendorWide(access);
    await menuOf(vendorId, menuId);
    await repo.softDeleteMenu(menuId, new Date());
    return { payload: { id: menuId, deleted: true } };
  }

  // ---------------------------------------------------------------------------
  // Sections
  // ---------------------------------------------------------------------------

  async function createSection(vendorId, menuId, input, { access }) {
    requireVendorWide(access);
    const menu = await menuOf(vendorId, menuId);
    if (isBlank(input.name)) return { refusal: MENU_ERRORS.name, path: "name" };

    const siblings = await repo.findSections([menuId]);
    // Appended after everything already on the board — `lib/menu.ts::createSection`
    // reads `sort` off the existing rows for the same reason: a restaurant that has
    // reordered its sections has values a counter would collide with.
    const sort = input.sort ?? siblings.reduce((top, row) => Math.max(top, row.sort), 0) + 1;

    const section = await repo.createSection({
      id: newId("menuSection"),
      menuId,
      // Denormalised from the menu, never from the caller — see `repository.js`.
      vendorId: menu.vendorId,
      name: trimmed(input.name),
      description: input.description ?? null,
      sort,
      isActive: input.isActive ?? true,
    });

    return { payload: { ...toSection(section), menuId: section.menuId, description: section.description, isActive: section.isActive, version: section.version } };
  }

  async function updateSection(vendorId, sectionId, input, { access }) {
    requireVendorWide(access);
    const current = await sectionOf(vendorId, sectionId);
    if ("name" in input && isBlank(input.name)) return { refusal: MENU_ERRORS.name, path: "name" };

    const data = {};
    if ("name" in input) data.name = trimmed(input.name);
    if ("description" in input) data.description = input.description;
    for (const field of ["sort", "isActive"]) if (field in input) data[field] = input[field];

    if ("menuId" in input && input.menuId !== current.menuId) {
      // Moving a section between boards is legal, but only between this vendor's.
      await menuOf(vendorId, input.menuId);
      data.menuId = input.menuId;
    }

    const { count } = await repo.updateSection(sectionId, current.version, data);
    if (count === 0) throw conflict("The section changed while you were editing it");

    const section = await repo.findSection(sectionId);
    return { payload: { ...toSection(section), menuId: section.menuId, description: section.description, isActive: section.isActive, version: section.version } };
  }

  async function deleteSection(vendorId, sectionId, { access }) {
    requireVendorWide(access);
    await sectionOf(vendorId, sectionId);
    await repo.softDeleteSection(sectionId, new Date());
    return { payload: { id: sectionId, deleted: true } };
  }

  /**
   * Reorder, by naming every id in the order they should sit.
   *
   * Whole-list rather than per-row `sort` writes: a drag-and-drop produces a new
   * order, not a new number, and sending the order means two people reordering at
   * once cannot interleave into a list neither of them chose. The list must be
   * exactly the live set — a missing id would leave a row with a stale `sort` and
   * an extra one is a row from somewhere else.
   */
  async function reorderSections(vendorId, menuId, ids, { access }) {
    requireVendorWide(access);
    await menuOf(vendorId, menuId);

    const live = (await repo.findSectionIds(menuId)).map((row) => row.id);
    const complete = live.length === ids.length && live.every((id) => ids.includes(id));
    if (!complete) return { refusal: MENU_ERRORS.sectionGone, path: "sectionIds" };

    await repo.transaction(async () => {
      for (const [index, id] of ids.entries()) {
        const current = await repo.findSection(id);
        await repo.updateSection(id, current.version, { sort: index + 1 });
      }
    });

    const sections = await repo.findSections([menuId]);
    return { payload: sections.map((section) => ({ ...toSection(section), menuId: section.menuId, isActive: section.isActive })) };
  }

  // ---------------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------------

  /**
   * A globally unique slug, derived from the name and disambiguated if taken.
   *
   * `FoodItem.slug` is `@unique` across the whole platform, not per vendor, so
   * "Margherita" at the second restaurant to open cannot have `margherita`. The
   * suffix is the vendor's own id fragment first — which keeps a slug readable and
   * stable — and a counter only if that collides too.
   */
  async function uniqueSlug(base, vendorId) {
    const stem = slugify(base) || "item";
    if (!(await repo.slugTaken(stem))) return stem;

    const scoped = `${stem}-${vendorId.slice(-6).toLowerCase()}`;
    if (!(await repo.slugTaken(scoped))) return scoped;

    for (let n = 2; n < 50; n += 1) {
      const candidate = `${scoped}-${n}`;
      if (!(await repo.slugTaken(candidate))) return candidate;
    }
    throw conflict("Could not mint a unique slug for this dish");
  }

  /** Shared by create and update — the fields whose rules are the same either way. */
  function itemFieldRefusal(input, { requireAll }) {
    if (requireAll || "name" in input) {
      if (isBlank(input.name)) return { refusal: MENU_ERRORS.name, path: "name" };
    }
    if (requireAll || "price" in input) {
      // `lib/menu.ts` refuses a zero price with the same key: a dish that costs
      // nothing is an unfinished form, not a giveaway.
      const price = Number(input.price);
      if (!Number.isFinite(price) || price <= 0) return { refusal: MENU_ERRORS.price, path: "price" };
    }
    if ("compareAtPrice" in input && input.compareAtPrice !== null) {
      const compare = Number(input.compareAtPrice);
      const price = Number(input.price);
      if (!Number.isFinite(compare) || compare <= 0) return { refusal: MENU_ERRORS.price, path: "compareAtPrice" };
      // A strike-through price below the price it strikes through is not a discount.
      if (Number.isFinite(price) && compare <= price) {
        return { refusal: MENU_ERRORS.price, path: "compareAtPrice" };
      }
    }
    return null;
  }

  async function createItem(vendorId, sectionId, input, { access }) {
    requireVendorWide(access);
    const section = await sectionOf(vendorId, sectionId);

    const refusal = itemFieldRefusal(input, { requireAll: true });
    if (refusal) return refusal;

    const categoryIds = input.categoryIds ?? [];
    if (categoryIds.length > 0) {
      const known = await repo.findCategoryIds(categoryIds);
      if (known.length !== categoryIds.length) return { refusal: MENU_ERRORS.section, path: "categoryIds" };
    }

    const siblings = await repo.findItems([sectionId]);
    const sort = input.sort ?? siblings.reduce((top, row) => Math.max(top, row.sort), 0) + 1;

    const item = await repo.createItem({
      id: newId("foodItem"),
      slug: await uniqueSlug(input.slug ?? input.name, vendorId),
      vendorId: section.vendorId,
      sectionId,
      name: trimmed(input.name),
      description: input.description ?? "",
      image: input.image ?? "",
      price: toDecimal(input.price),
      compareAtPrice: input.compareAtPrice === undefined ? null : toDecimal(input.compareAtPrice),
      spicyLevel: input.spicyLevel ?? 0,
      calories: input.calories ?? null,
      isPopular: input.isPopular ?? false,
      isAvailable: input.isAvailable ?? true,
      prepMinutes: input.prepMinutes ?? 0,
      sort,
      sku: input.sku ?? null,
      dietary: input.dietary ?? [],
      categoryIds,
    });

    return { payload: toBoardItem(item, { sectionActive: section.isActive, menuActive: true }) };
  }

  async function updateItem(vendorId, itemId, input, { access }) {
    requireVendorWide(access);
    const current = await itemOf(vendorId, itemId);

    const refusal = itemFieldRefusal(
      { ...input, price: "price" in input ? input.price : current.price },
      { requireAll: false },
    );
    if (refusal) return refusal;

    const data = {};
    if ("name" in input) data.name = trimmed(input.name);
    for (const field of ["description", "image", "spicyLevel", "calories", "isPopular", "prepMinutes", "sort", "sku"]) {
      if (field in input) data[field] = input[field];
    }
    if ("price" in input) data.price = toDecimal(input.price);
    if ("compareAtPrice" in input) {
      data.compareAtPrice = input.compareAtPrice === null ? null : toDecimal(input.compareAtPrice);
    }

    // Moving a dish between sections is a field edit, exactly as `lib/menu.ts`
    // treats it — and the section it moves to has to be this vendor's.
    if ("sectionId" in input && input.sectionId !== current.sectionId) {
      await sectionOf(vendorId, input.sectionId);
      data.sectionId = input.sectionId;
    }

    if ("categoryIds" in input && input.categoryIds.length > 0) {
      const known = await repo.findCategoryIds(input.categoryIds);
      if (known.length !== input.categoryIds.length) return { refusal: MENU_ERRORS.section, path: "categoryIds" };
    }

    data.updatedBy = access?.userId ?? null;

    const { count } = await repo.updateItem(itemId, current.version, data);
    if (count === 0) throw conflict("The dish changed while you were editing it");

    if ("dietary" in input) await repo.replaceDietary(itemId, input.dietary);
    if ("categoryIds" in input) await repo.replaceCategories(itemId, input.categoryIds);

    const row = await repo.findItem(itemId);
    return {
      payload: toBoardItem(row, {
        sectionActive: row.section?.isActive !== false,
        menuActive: row.section?.menu?.isActive !== false,
      }),
    };
  }

  async function deleteItem(vendorId, itemId, { access }) {
    requireVendorWide(access);
    await itemOf(vendorId, itemId);
    await repo.softDeleteItem(itemId, new Date());
    return { payload: { id: itemId, deleted: true } };
  }

  async function reorderItems(vendorId, sectionId, ids, { access }) {
    requireVendorWide(access);
    await sectionOf(vendorId, sectionId);

    const live = (await repo.findItemIds(sectionId)).map((row) => row.id);
    const complete = live.length === ids.length && live.every((id) => ids.includes(id));
    if (!complete) return { refusal: MENU_ERRORS.itemGone, path: "itemIds" };

    await repo.transaction(async () => {
      for (const [index, id] of ids.entries()) {
        const current = await repo.findItem(id);
        await repo.updateItem(id, current.version, { sort: index + 1 });
      }
    });

    const items = await repo.findItems([sectionId]);
    return { payload: items.map((item) => ({ id: item.id, sort: item.sort, name: item.name })) };
  }

  /**
   * The 86 switch, on its own route and with its own, wider, staff rule.
   *
   * Separate from `updateItem` because it is a different act with a different
   * authority: taking the sea bass off at eight o'clock is the pass's call and
   * repricing it is not. Writing the column here and nowhere else is also what
   * keeps the derived read model honest — there is exactly one way for the switch
   * to change.
   */
  async function setAvailability(vendorId, itemId, isAvailable, { access }) {
    const current = await itemOf(vendorId, itemId);

    const { count } = await repo.updateItem(itemId, current.version, {
      isAvailable,
      updatedBy: access?.userId ?? null,
    });
    if (count === 0) throw conflict("The dish changed while you were editing it");

    const row = await repo.findItem(itemId);
    return {
      payload: toBoardItem(row, {
        sectionActive: row.section?.isActive !== false,
        menuActive: row.section?.menu?.isActive !== false,
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // Option groups and options
  // ---------------------------------------------------------------------------

  /**
   * A group and its options, created together.
   *
   * One call because `max ≤ options.length` is one of the group's own rules and an
   * empty group cannot satisfy it — see `options.js`. So there is no moment at
   * which a half-built group is readable by a customer, which is the property that
   * matters: the customiser renders whatever it is given.
   */
  async function createGroup(vendorId, itemId, input, { access }) {
    requireVendorWide(access);
    await itemOf(vendorId, itemId);

    const options = (input.options ?? []).map((option, index) => ({
      id: newId("foodOption"),
      name: trimmed(option.name),
      priceDelta: toDecimal(option.priceDelta ?? 0),
      isDefault: option.isDefault ?? false,
      isAvailable: option.isAvailable ?? true,
      sort: option.sort ?? index,
    }));

    const error = groupError(input, options.filter((option) => option.isAvailable));
    if (error) return { refusal: error, path: "optionGroup" };

    const group = await repo.createGroupWithOptions({
      id: newId("foodOptionGroup"),
      foodId: itemId,
      name: trimmed(input.name),
      required: input.required ?? false,
      min: input.min,
      max: input.max,
      sort: input.sort ?? 0,
      options,
    });

    return { payload: toJsonSafe(group) };
  }

  async function updateGroup(vendorId, groupId, input, { access }) {
    requireVendorWide(access);
    const current = await groupOf(vendorId, groupId);

    const next = {
      name: "name" in input ? trimmed(input.name) : current.name,
      required: "required" in input ? input.required : current.required,
      min: "min" in input ? input.min : current.min,
      max: "max" in input ? input.max : current.max,
    };

    // Judged on the result, not on the patch: a group is only ever legal or not
    // as a whole, and its live options are half of what makes it so.
    const error = groupError(next, (current.options ?? []).filter((option) => option.isAvailable));
    if (error) return { refusal: error, path: "optionGroup" };

    const group = await repo.updateGroup(groupId, {
      ...next,
      ...("sort" in input ? { sort: input.sort } : {}),
    });
    return { payload: toJsonSafe(group) };
  }

  async function deleteGroup(vendorId, groupId, { access }) {
    requireVendorWide(access);
    await groupOf(vendorId, groupId);
    await repo.softDeleteGroup(groupId, new Date());
    return { payload: { id: groupId, deleted: true } };
  }

  async function createOption(vendorId, groupId, input, { access }) {
    requireVendorWide(access);
    const group = await groupOf(vendorId, groupId);

    if (isBlank(input.name)) return { refusal: MENU_ERRORS.name, path: "name" };

    const option = await repo.createOption({
      id: newId("foodOption"),
      groupId,
      name: trimmed(input.name),
      priceDelta: toDecimal(input.priceDelta ?? 0),
      isDefault: input.isDefault ?? false,
      isAvailable: input.isAvailable ?? true,
      sort: input.sort ?? (group.options ?? []).length,
    });

    return { payload: toJsonSafe(option) };
  }

  /**
   * Edit one option — and re-judge the group it belongs to.
   *
   * Switching an option off can make its group illegal (`max` now exceeds what is
   * left), and a group that is illegal is a control a customer cannot satisfy. So
   * the group is re-checked against the state the write *would* produce, and the
   * write is refused rather than applied and papered over at read time. The
   * clamping in `toPublicGroup` is the second guard, not the first — it exists for
   * rows that predate this rule and for the reservation path module 6 will add.
   */
  async function updateOption(vendorId, optionId, input, { access }) {
    requireVendorWide(access);
    const current = await optionOf(vendorId, optionId);
    const group = current.group;

    if ("name" in input && isBlank(input.name)) return { refusal: MENU_ERRORS.name, path: "name" };

    const next = {
      ...current,
      ...("name" in input ? { name: trimmed(input.name) } : {}),
      ...("isAvailable" in input ? { isAvailable: input.isAvailable } : {}),
    };

    const after = (group.options ?? [])
      .map((option) => (option.id === optionId ? next : option))
      .filter((option) => option.isAvailable);

    const error = groupError(group, after);
    if (error) return { refusal: error, path: "options" };

    const data = {};
    if ("name" in input) data.name = trimmed(input.name);
    if ("priceDelta" in input) data.priceDelta = toDecimal(input.priceDelta);
    for (const field of ["isDefault", "isAvailable", "sort"]) if (field in input) data[field] = input[field];

    const option = await repo.updateOption(optionId, data);
    return { payload: toJsonSafe(option) };
  }

  async function deleteOption(vendorId, optionId, { access }) {
    requireVendorWide(access);
    const current = await optionOf(vendorId, optionId);
    const group = current.group;

    const after = (group.options ?? []).filter((option) => option.id !== optionId && option.isAvailable);
    const error = groupError(group, after);
    if (error) return { refusal: error, path: "options" };

    await repo.softDeleteOption(optionId, new Date());
    return { payload: { id: optionId, deleted: true } };
  }

  // ---------------------------------------------------------------------------
  // Inventory
  // ---------------------------------------------------------------------------

  async function listInventory(vendorId, query, { access }) {
    await vendorContext(vendorId);
    const { page, pageSize, skip, take } = toSkipTake(query);

    // A branch-scoped member sees their branch's shelves and the vendor-wide rows,
    // and nobody else's branch. See `branchAllowed`.
    const where = access?.branchId
      ? { OR: [{ branchId: access.branchId }, { branchId: null }] }
      : {};
    if (query.trackedOnly === true) where.trackStock = true;

    const [total, rows] = await Promise.all([
      repo.countInventory(vendorId, where),
      repo.findInventory(vendorId, { where, skip, take }),
    ]);

    return {
      items: rows.map((row) => ({
        ...toStock(row),
        name: row.name,
        sku: row.sku,
        unitCost: row.unitCost === null ? null : Number(row.unitCost),
        food: row.food ? { id: row.food.id, name: row.food.name, slug: row.food.slug } : null,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** One dish's stock. `null` when nothing counts it — untracked is an answer. */
  async function itemStock(vendorId, itemId, { access }) {
    const row = await itemOf(vendorId, itemId);
    const inventory = row.inventory ?? null;
    if (inventory && !branchAllowed(access, inventory.branchId)) throw notFound("Inventory");
    return { itemId: row.id, stock: toStock(inventory) };
  }

  async function movements(vendorId, itemId, { limit = 50, access }) {
    const row = await itemOf(vendorId, itemId);
    const inventory = row.inventory ?? null;
    if (!inventory) return { itemId: row.id, movements: [] };
    if (!branchAllowed(access, inventory.branchId)) throw notFound("Inventory");

    const rows = await repo.findMovements(inventory.id, { take: limit });
    return { itemId: row.id, inventoryId: inventory.id, movements: rows.map(toMovement) };
  }

  /**
   * Start counting a dish, stop counting it, or set the count outright.
   *
   * The row is created on first use rather than by onboarding, because
   * `InventoryItem.foodId` is nullable-and-unique — one row per sellable dish, and
   * *"null for a raw ingredient"* — so a menu of forty dishes that nobody counts
   * should be forty absent rows, not forty rows of zero. `availability.js` reads an
   * absent row as untracked, which is what it is.
   *
   * An outright count writes a movement too. `StockMovement` is *"why"* the balance
   * is what it is, and a balance that moved with no movement behind it is the hole
   * in the ledger the table exists to prevent. The movement's `quantity` is the
   * difference, so `balance[n] = balance[n-1] + quantity[n]` survives.
   */
  async function setItemStock(vendorId, itemId, input, { access }) {
    requireVendorWide(access);
    const row = await itemOf(vendorId, itemId);

    if ("quantity" in input) {
      const quantity = Number(input.quantity);
      if (!Number.isFinite(quantity) || quantity < 0) return { refusal: MENU_ERRORS.stock, path: "quantity" };
    }
    if ("lowStockThreshold" in input) {
      const threshold = Number(input.lowStockThreshold);
      if (!Number.isFinite(threshold) || threshold < 0) {
        return { refusal: MENU_ERRORS.stock, path: "lowStockThreshold" };
      }
    }

    if (input.branchId) {
      const branchIds = (await repo.findBranchIds(vendorId)).map((branch) => branch.id);
      if (!branchIds.includes(input.branchId)) return { refusal: MENU_ERRORS.section, path: "branchId" };
      if (!branchAllowed(access, input.branchId)) throw forbidden("Not permitted at that branch");
    }

    const existing = row.inventory ?? null;

    if (!existing) {
      const inventory = await repo.createInventory({
        id: newId("inventoryItem"),
        vendorId,
        foodId: itemId,
        branchId: input.branchId ?? null,
        name: row.name,
        sku: row.sku ?? null,
        unit: input.unit ?? "pcs",
        onHand: toDecimal(input.quantity ?? 0),
        reserved: toDecimal(0),
        lowStockAt: toDecimal(input.lowStockThreshold ?? 0),
        trackStock: input.trackStock ?? true,
      });

      // The opening balance is a receipt, so the ledger starts at a movement
      // rather than at a number that appeared from nowhere.
      if (dec(inventory.onHand).gt(0)) {
        await repo.setStock({
          id: inventory.id,
          version: inventory.version,
          data: {},
          movement: {
            id: newId("stockMovement"),
            kind: "received",
            quantity: inventory.onHand,
            note: input.note ?? "opening balance",
            actorId: access?.userId ?? null,
            occurredAt: new Date(),
          },
        });
      }

      return { payload: { itemId, stock: toStock(await repo.findInventoryById(inventory.id)) } };
    }

    if (!branchAllowed(access, existing.branchId)) throw notFound("Inventory");

    const data = {};
    if ("lowStockThreshold" in input) data.lowStockAt = toDecimal(input.lowStockThreshold);
    if ("trackStock" in input) data.trackStock = input.trackStock;
    if ("unit" in input) data.unit = input.unit;
    if ("branchId" in input) data.branchId = input.branchId;

    let movement = null;
    if ("quantity" in input) {
      const delta = toDecimal(input.quantity).minus(dec(existing.onHand));
      data.onHand = toDecimal(input.quantity);
      if (!delta.isZero()) {
        movement = {
          id: newId("stockMovement"),
          kind: "adjusted",
          quantity: delta,
          note: input.note ?? null,
          actorId: access?.userId ?? null,
          occurredAt: new Date(),
        };
      }
    }

    const result = await repo.setStock({ id: existing.id, version: existing.version, data, movement });
    if (!result.applied) throw conflict("The stock changed while you were editing it");

    return { payload: { itemId, stock: toStock(result.item), movement: result.movement ? toMovement(result.movement) : null } };
  }

  /**
   * Move the count by a signed delta, atomically.
   *
   * Everything that makes this safe is in `repository.js::adjustStock` — one
   * guarded `UPDATE` under one row lock, so two terminals cannot both sell the last
   * portion. What is decided here is the three things that are policy rather than
   * mechanism:
   *
   *  - **the sign has to match the word.** `catalog.prisma` says `received > 0,
   *    sold < 0`, so a `sold` movement of `+5` is refused. `adjusted` and
   *    `transferred` are exempt — a correction goes either way;
   *  - **a tracked balance may not go below zero**, and the floor is enforced *in
   *    the WHERE clause*, not by reading first;
   *  - **an over-decrement is refused, not floored.** `lib/menu.ts::adjustStock`
   *    floors at zero on the client, and that is right for a slider a person is
   *    dragging. It is wrong here: `StockMovement.balance` is the balance after the
   *    movement, so writing a −3 that only moved −2 would record a movement that
   *    never happened and break the ledger's own arithmetic. The refusal names the
   *    field, and the caller re-reads to see what is actually left.
   */
  async function adjustItemStock(vendorId, itemId, input, { access }) {
    const row = await itemOf(vendorId, itemId);
    const inventory = row.inventory ?? null;
    if (!inventory) return { refusal: MENU_ERRORS.stock, path: "quantity" };
    if (!branchAllowed(access, inventory.branchId)) throw notFound("Inventory");

    const delta = Number(input.delta);
    if (!Number.isFinite(delta) || delta === 0) return { refusal: MENU_ERRORS.stock, path: "delta" };

    const kind = input.kind ?? "adjusted";
    const sign = MOVEMENT_SIGN[kind];
    if (sign !== undefined && Math.sign(delta) !== sign) {
      return { refusal: MENU_ERRORS.stock, path: "delta" };
    }

    // Only a tracked row has a floor: `trackStock: false` is the schema's switch
    // for a dish that never auto-disables, and a count that is not decided on is
    // not a count to protect.
    const floor = delta < 0 && inventory.trackStock ? toDecimal(Math.abs(delta)) : null;

    const result = await repo.adjustStock({
      id: inventory.id,
      version: inventory.version,
      delta: toDecimal(delta),
      floor,
      kind,
      note: input.note ?? null,
      actorId: access?.userId ?? null,
      refEntity: input.refEntity ?? null,
      refId: input.refId ?? null,
      movementId: newId("stockMovement"),
      at: new Date(),
    });

    if (!result.applied) {
      // Zero rows matched. Either the balance was too low or somebody wrote first —
      // and those are different answers, so ask the row which it was.
      const fresh = await repo.findInventoryById(inventory.id);
      if (fresh && fresh.version !== inventory.version) {
        throw conflict("The stock changed while you were adjusting it");
      }
      return { refusal: MENU_ERRORS.stock, path: "delta" };
    }

    return {
      payload: {
        itemId,
        stock: toStock(result.item),
        movement: toMovement(result.movement),
        // The whole reason the caller cares: did that take the dish off the menu?
        available: deriveItemAvailability({ item: row, inventory: result.item }).isAvailable,
      },
    };
  }

  return {
    // reads
    vendorMenu,
    board,
    listMenus,
    publicItem,
    validateSelection,
    // menus
    createMenu,
    updateMenu,
    deleteMenu,
    // sections
    createSection,
    updateSection,
    deleteSection,
    reorderSections,
    // items
    createItem,
    updateItem,
    deleteItem,
    reorderItems,
    setAvailability,
    // options
    createGroup,
    updateGroup,
    deleteGroup,
    createOption,
    updateOption,
    deleteOption,
    // inventory
    listInventory,
    itemStock,
    movements,
    setItemStock,
    adjustItemStock,
    // exposed for tests and for module 6
    toPublicItem,
    toStock,
  };
}

export default createService;

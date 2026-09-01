/**
 * repository.js — every menu and inventory statement, and no rule about any of them.
 *
 * The same split modules 2, 3 and 4 keep: Prisma's vocabulary lives here, the
 * product's lives in `service.js`. A `where`, a `select`, an `orderBy` and the
 * enum translation on the way in are this file's business; what "available"
 * means, who may write and whether a group's `max` is legal are not.
 *
 * ## Four things this file has to remember for the whole module
 *
 *  - **Nested relations are not soft-delete filtered.** `plugins/prisma.js` says
 *    so: the query extension sees the top-level model only. Every nested select
 *    of a soft-deletable relation below therefore carries its own
 *    `deletedAt: null`. A deleted option rendered inside a live dish is exactly
 *    the leak `main.prisma` §3 is about, and here it would also be a *priced*
 *    leak — a customer could pick it.
 *  - **`MenuSection.vendorId` is denormalised and must be written.** It is not
 *    derivable at read time by the index the schema built for it, and a section
 *    whose `vendorId` disagreed with its menu's would be invisible to every
 *    vendor-scoped read. `createSection` copies it from the menu rather than
 *    taking it from the caller.
 *  - **`FoodItem.vendorId` is the same fact one level down**, copied from the
 *    section. It is what makes the ownership check in `service.js` a column
 *    comparison rather than a three-table walk on every request.
 *  - **Enums go in as identifiers.** `main.prisma` §6 — `where: { kind: "qr" }`
 *    is rejected by the client. `toDbEnum` on the way in, `toApiEnum` on the way
 *    out in the service.
 *
 * ## The one statement that is not ordinary
 *
 * `adjustStock` is a guarded `updateMany` inside a transaction, not a read
 * followed by a write. §8 of the brief asks for exactly that, and the reason is
 * the oldest race in inventory: two terminals selling the last portion, both
 * reading `1`, both writing `0`, one customer disappointed. See its own comment.
 */
import { toDbEnum } from "../../shared/utils/enums.js";

/** A `Menu` as the API projects it. */
const MENU_SELECT = Object.freeze({
  id: true,
  vendorId: true,
  kind: true,
  name: true,
  isDefault: true,
  isActive: true,
  availableFrom: true,
  availableTo: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  version: true,
});

/** A `MenuSection`, without its dishes. */
const SECTION_SELECT = Object.freeze({
  id: true,
  menuId: true,
  vendorId: true,
  name: true,
  description: true,
  sort: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  version: true,
});

/** A `FoodOption`. `deletedAt` is filtered by the caller's nested `where`. */
const OPTION_SELECT = Object.freeze({
  id: true,
  groupId: true,
  name: true,
  priceDelta: true,
  isDefault: true,
  isAvailable: true,
  sort: true,
});

/**
 * A `FoodOptionGroup` with its live options.
 *
 * The options are nested rather than fetched separately because a group is never
 * useful without them — `groupError` cannot judge a group it cannot count, and
 * the customiser renders the pair or nothing.
 */
const GROUP_SELECT = Object.freeze({
  id: true,
  foodId: true,
  name: true,
  required: true,
  min: true,
  max: true,
  sort: true,
  options: {
    where: { deletedAt: null },
    select: OPTION_SELECT,
    orderBy: [{ sort: "asc" }, { id: "asc" }],
  },
});

/**
 * Everything one dish needs, in one statement.
 *
 * `inventory` is a nullable one-to-one and carries `deletedAt`, so it is filtered
 * too: an inventory row somebody removed must read as *untracked*, which is what
 * `availability.js` makes of a null, and not as a count of zero — the difference
 * between a dish that is cooked to order and a dish that has sold out.
 */
const ITEM_SELECT = Object.freeze({
  id: true,
  slug: true,
  vendorId: true,
  sectionId: true,
  name: true,
  description: true,
  image: true,
  price: true,
  compareAtPrice: true,
  spicyLevel: true,
  calories: true,
  rating: true,
  reviewCount: true,
  isPopular: true,
  isAvailable: true,
  prepMinutes: true,
  sort: true,
  sku: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  version: true,

  dietary: { select: { tag: true }, orderBy: { tag: "asc" } },
  categories: { select: { categoryId: true } },
  optionGroups: {
    where: { deletedAt: null },
    select: GROUP_SELECT,
    orderBy: [{ sort: "asc" }, { id: "asc" }],
  },
  inventory: {
    where: { deletedAt: null },
    select: {
      id: true,
      vendorId: true,
      foodId: true,
      branchId: true,
      name: true,
      sku: true,
      unit: true,
      onHand: true,
      reserved: true,
      lowStockAt: true,
      trackStock: true,
      unitCost: true,
      createdAt: true,
      updatedAt: true,
      version: true,
    },
  },
});

const INVENTORY_SELECT = Object.freeze({
  id: true,
  vendorId: true,
  foodId: true,
  branchId: true,
  name: true,
  sku: true,
  unit: true,
  onHand: true,
  reserved: true,
  lowStockAt: true,
  trackStock: true,
  unitCost: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  version: true,
  food: { where: { deletedAt: null }, select: { id: true, name: true, slug: true, isAvailable: true } },
});

const MOVEMENT_SELECT = Object.freeze({
  id: true,
  itemId: true,
  kind: true,
  quantity: true,
  balance: true,
  refEntity: true,
  refId: true,
  note: true,
  actorId: true,
  occurredAt: true,
});

export function createRepository(prisma) {
  return {
    /** Exposed so the service can run several writes as one — see `adjustStock`. */
    transaction: (fn, options) => prisma.$transaction(fn, options),

    // -- Vendor -------------------------------------------------------------

    /**
     * The storefront a menu hangs off, and its primary branch's timezone.
     *
     * The timezone is the only thing this module needs from a branch, and it needs
     * it for one reason: `Menu.availableFrom`/`availableTo` describe a breakfast
     * menu in the restaurant's morning. Module 4 reads the same column for
     * `isOpen`.
     */
    findVendorContext: (vendorId) =>
      prisma.vendor.findUnique({
        where: { id: vendorId },
        select: {
          id: true,
          slug: true,
          status: true,
          ownerId: true,
          currency: true,
          branches: {
            where: { isPrimary: true, deletedAt: null },
            take: 1,
            select: { id: true, timezone: true },
          },
        },
      }),

    /** Branch ids belonging to this vendor — the set a branch-scoped write may name. */
    findBranchIds: (vendorId) =>
      prisma.vendorBranch.findMany({ where: { vendorId }, select: { id: true } }),

    // -- Menus --------------------------------------------------------------

    findMenus: (vendorId, { kind = null, includeInactive = true } = {}) =>
      prisma.menu.findMany({
        where: {
          vendorId,
          ...(kind ? { kind: toDbEnum("MenuKind", kind) } : {}),
          ...(includeInactive ? {} : { isActive: true }),
        },
        select: MENU_SELECT,
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      }),

    findMenu: (menuId) => prisma.menu.findUnique({ where: { id: menuId }, select: MENU_SELECT }),

    createMenu: (data) =>
      prisma.menu.create({
        data: { ...data, kind: toDbEnum("MenuKind", data.kind) },
        select: MENU_SELECT,
      }),

    /**
     * A guarded update — `version` is the guard, `main.prisma` §4's optimistic lock.
     *
     * `updateMany` rather than `update` because the guard belongs in the `WHERE`:
     * `update` would need a unique filter and could not carry the version, and a
     * read-then-write around it is the lost update the column exists to prevent.
     * Zero rows matched is a `CONFLICT`, not a not-found — the service says so.
     */
    updateMenu: (menuId, version, data) =>
      prisma.menu.updateMany({
        where: { id: menuId, version },
        data: { ...data, ...(data.kind ? { kind: toDbEnum("MenuKind", data.kind) } : {}), version: { increment: 1 } },
      }),

    /** Soft delete. `main.prisma` §3 — the row stays, `deletedAt` decides. */
    softDeleteMenu: (menuId, at) =>
      prisma.menu.updateMany({ where: { id: menuId }, data: { deletedAt: at, version: { increment: 1 } } }),

    /** Every other default of this kind, cleared. One default per (vendor, kind). */
    clearDefaults: (vendorId, kind, exceptId) =>
      prisma.menu.updateMany({
        where: { vendorId, kind: toDbEnum("MenuKind", kind), id: { not: exceptId }, isDefault: true },
        data: { isDefault: false },
      }),

    // -- Sections -----------------------------------------------------------

    findSections: (menuIds, { includeInactive = true } = {}) =>
      prisma.menuSection.findMany({
        where: { menuId: { in: menuIds }, ...(includeInactive ? {} : { isActive: true }) },
        select: SECTION_SELECT,
        orderBy: [{ sort: "asc" }, { name: "asc" }],
      }),

    findSection: (sectionId) =>
      prisma.menuSection.findUnique({
        where: { id: sectionId },
        select: { ...SECTION_SELECT, menu: { select: MENU_SELECT } },
      }),

    createSection: (data) => prisma.menuSection.create({ data, select: SECTION_SELECT }),

    updateSection: (sectionId, version, data) =>
      prisma.menuSection.updateMany({
        where: { id: sectionId, version },
        data: { ...data, version: { increment: 1 } },
      }),

    softDeleteSection: (sectionId, at) =>
      prisma.menuSection.updateMany({
        where: { id: sectionId },
        data: { deletedAt: at, version: { increment: 1 } },
      }),

    /** Ids of the live sections of a menu — the set a reorder may name, and no other. */
    findSectionIds: (menuId) =>
      prisma.menuSection.findMany({ where: { menuId }, select: { id: true } }),

    // -- Items --------------------------------------------------------------

    findItems: (sectionIds, { includeUnavailable = true } = {}) =>
      prisma.foodItem.findMany({
        where: { sectionId: { in: sectionIds }, ...(includeUnavailable ? {} : { isAvailable: true }) },
        select: ITEM_SELECT,
        orderBy: [{ sort: "asc" }, { name: "asc" }],
      }),

    findItem: (itemId) =>
      prisma.foodItem.findUnique({
        where: { id: itemId },
        select: { ...ITEM_SELECT, section: { select: { ...SECTION_SELECT, menu: { select: MENU_SELECT } } } },
      }),

    findItemBySlug: (slug) =>
      prisma.foodItem.findUnique({
        where: { slug },
        select: { ...ITEM_SELECT, section: { select: { ...SECTION_SELECT, menu: { select: MENU_SELECT } } } },
      }),

    /** Does this slug already belong to somebody? `FoodItem.slug` is globally unique. */
    slugTaken: async (slug) =>
      (await prisma.foodItem.findUnique({ where: { slug }, select: { id: true } })) !== null,

    createItem: ({ dietary = [], categoryIds = [], ...data }) =>
      prisma.foodItem.create({
        data: {
          ...data,
          ...(dietary.length > 0
            ? { dietary: { create: dietary.map((tag) => ({ tag: toDbEnum("DietaryTagKind", tag) })) } }
            : {}),
          ...(categoryIds.length > 0
            ? { categories: { create: categoryIds.map((categoryId) => ({ categoryId })) } }
            : {}),
        },
        select: ITEM_SELECT,
      }),

    updateItem: (itemId, version, data) =>
      prisma.foodItem.updateMany({
        where: { id: itemId, version },
        data: { ...data, version: { increment: 1 } },
      }),

    /** Dietary tags are a set, so a patch replaces them wholesale rather than merging. */
    replaceDietary: async (itemId, tags) => {
      await prisma.foodDietary.deleteMany({ where: { foodId: itemId } });
      if (tags.length === 0) return;
      await prisma.foodDietary.createMany({
        data: tags.map((tag) => ({ foodId: itemId, tag: toDbEnum("DietaryTagKind", tag) })),
      });
    },

    replaceCategories: async (itemId, categoryIds) => {
      await prisma.foodCategory.deleteMany({ where: { foodId: itemId } });
      if (categoryIds.length === 0) return;
      await prisma.foodCategory.createMany({
        data: categoryIds.map((categoryId) => ({ foodId: itemId, categoryId })),
      });
    },

    softDeleteItem: (itemId, at) =>
      prisma.foodItem.updateMany({ where: { id: itemId }, data: { deletedAt: at, version: { increment: 1 } } }),

    findItemIds: (sectionId) => prisma.foodItem.findMany({ where: { sectionId }, select: { id: true } }),

    /** The categories a dish may be filed under — checked before a write names one. */
    findCategoryIds: (categoryIds) =>
      prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true } }),

    // -- Option groups and options ------------------------------------------

    findGroup: (groupId) =>
      prisma.foodOptionGroup.findUnique({
        where: { id: groupId },
        select: {
          ...GROUP_SELECT,
          food: { select: { id: true, vendorId: true, sectionId: true, deletedAt: true } },
        },
      }),

    /** A group and its options in one statement — `groupError` judges the pair. */
    createGroupWithOptions: ({ options, ...group }) =>
      prisma.foodOptionGroup.create({
        data: { ...group, options: { create: options } },
        select: GROUP_SELECT,
      }),

    updateGroup: (groupId, data) =>
      prisma.foodOptionGroup.update({ where: { id: groupId }, data, select: GROUP_SELECT }),

    softDeleteGroup: (groupId, at) =>
      prisma.foodOptionGroup.update({ where: { id: groupId }, data: { deletedAt: at }, select: { id: true } }),

    findOption: (optionId) =>
      prisma.foodOption.findUnique({
        where: { id: optionId },
        select: {
          ...OPTION_SELECT,
          group: {
            select: {
              ...GROUP_SELECT,
              food: { select: { id: true, vendorId: true, sectionId: true, deletedAt: true } },
            },
          },
        },
      }),

    createOption: (data) => prisma.foodOption.create({ data, select: OPTION_SELECT }),

    updateOption: (optionId, data) =>
      prisma.foodOption.update({ where: { id: optionId }, data, select: OPTION_SELECT }),

    softDeleteOption: (optionId, at) =>
      prisma.foodOption.update({ where: { id: optionId }, data: { deletedAt: at }, select: { id: true } }),

    // -- Inventory ----------------------------------------------------------

    countInventory: (vendorId, where = {}) =>
      prisma.inventoryItem.count({ where: { vendorId, ...where } }),

    findInventory: (vendorId, { where = {}, skip, take }) =>
      prisma.inventoryItem.findMany({
        where: { vendorId, ...where },
        select: INVENTORY_SELECT,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip,
        take,
      }),

    findInventoryByFood: (foodId) =>
      prisma.inventoryItem.findUnique({ where: { foodId }, select: INVENTORY_SELECT }),

    findInventoryById: (id) =>
      prisma.inventoryItem.findUnique({ where: { id }, select: INVENTORY_SELECT }),

    createInventory: (data) => prisma.inventoryItem.create({ data, select: INVENTORY_SELECT }),

    findMovements: (itemId, { take }) =>
      prisma.stockMovement.findMany({
        where: { itemId },
        select: MOVEMENT_SELECT,
        orderBy: { occurredAt: "desc" },
        take,
      }),

    /**
     * Move a balance by a signed delta, atomically, and log why.
     *
     * The two statements that matter both live in one transaction, and the first
     * of them is the whole answer to §8's "avoid race-prone read-then-write stock
     * updates":
     *
     * ```sql
     * UPDATE inventory_items
     *    SET "onHand" = "onHand" + $delta, version = version + 1
     *  WHERE id = $id AND version = $version AND "deletedAt" IS NULL
     *    AND "onHand" >= $floor            -- only when the delta is negative
     * ```
     *
     * PostgreSQL evaluates the predicate and applies the increment in one
     * statement under one row lock, so two terminals selling the last portion
     * cannot both see `1`. The count that comes back is the verdict: **1** means it
     * happened, **0** means either somebody else wrote first (`version` moved) or
     * there was not enough stock — and the service re-reads to say which, because
     * "you are out of stock" and "try again" are different answers.
     *
     * The row is re-read *inside* the transaction, after the guarded update, so
     * `StockMovement.balance` is the balance this movement actually produced
     * rather than one computed from a value that may already have been stale. That
     * is what keeps the ledger's own invariant true —
     * `balance[n] = balance[n-1] + quantity[n]` — which is the reason the brief's
     * "restore stock" and the frontend's flooring behaviour are *not* copied here:
     * silently writing 0 for a delta of −3 would record a movement that never
     * happened. See M5 §"Inventory rules".
     */
    adjustStock: ({ id, version, delta, floor, kind, note, actorId, refEntity, refId, movementId, at }) =>
      prisma.$transaction(async (tx) => {
        const guard = {
          id,
          version,
          ...(floor === null ? {} : { onHand: { gte: floor } }),
        };

        const { count } = await tx.inventoryItem.updateMany({
          where: guard,
          data: { onHand: { increment: delta }, version: { increment: 1 } },
        });

        if (count === 0) return { applied: false, item: null, movement: null };

        const item = await tx.inventoryItem.findUnique({ where: { id }, select: INVENTORY_SELECT });

        const movement = await tx.stockMovement.create({
          data: {
            id: movementId,
            itemId: id,
            kind: toDbEnum("StockMovementKind", kind),
            quantity: delta,
            balance: item.onHand,
            refEntity: refEntity ?? null,
            refId: refId ?? null,
            note: note ?? null,
            actorId: actorId ?? null,
            occurredAt: at,
          },
          select: MOVEMENT_SELECT,
        });

        return { applied: true, item, movement };
      }),

    /**
     * Rewrite an inventory row's settings, and log the balance change it caused.
     *
     * One transaction for the same reason: `trackStock`, the threshold and an
     * outright count are one intent — "this is how this dish is stocked now" — and
     * a half-applied one leaves a tracked dish with somebody else's threshold.
     */
    setStock: ({ id, version, data, movement }) =>
      prisma.$transaction(async (tx) => {
        const { count } = await tx.inventoryItem.updateMany({
          where: { id, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (count === 0) return { applied: false, item: null, movement: null };

        const item = await tx.inventoryItem.findUnique({ where: { id }, select: INVENTORY_SELECT });

        const logged = movement
          ? await tx.stockMovement.create({
              data: {
                ...movement,
                itemId: id,
                kind: toDbEnum("StockMovementKind", movement.kind),
                balance: item.onHand,
              },
              select: MOVEMENT_SELECT,
            })
          : null;

        return { applied: true, item, movement: logged };
      }),

    softDeleteInventory: (id, at) =>
      prisma.inventoryItem.updateMany({ where: { id }, data: { deletedAt: at, version: { increment: 1 } } }),
  };
}

export default createRepository;

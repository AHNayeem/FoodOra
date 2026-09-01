/**
 * schemas.js — module 5's wire contract, as JSON Schema.
 *
 * Fastify's own validation and serialisation, exactly as modules 2 and 4 do it:
 * declared per route, compiled once at boot, and — the half that matters most
 * here — the `response` schema **filters the body on the way out**. That is the
 * second, independent guarantee that the merchant's authoring fields (`sku`,
 * `prepMinutes`, `sort`, `version`, the raw availability switch, a stock count)
 * cannot reach a customer's menu however `service.js` is later changed, because
 * `foodItemSchema` is `types/catalog.ts::FoodItem` field for field and nothing
 * else passes through it.
 *
 * The shapes are the frontend's, not new ones:
 *
 *   foodItemSchema        types/catalog.ts::FoodItem
 *   sectionWithItems      types/catalog.ts::MenuSectionWithItems  ← `getVendorMenu`
 *   boardSectionSchema    types/menu.ts::MenuBoardSection
 *   boardItemSchema       types/menu.ts::MenuBoardItem
 *   stockSchema           types/menu.ts::MenuItemStock, widened — see `service.js`
 */
import { MAX_PAGE_SIZE, paginationProperties } from "../../shared/utils/pagination.js";
import { MENU_KINDS, MOVEMENT_KINDS } from "./service.js";
import { SELECTION_CODES } from "./options.js";
import { STOCK_STATES } from "./availability.js";

/** `types/common.ts::DietaryTag`. */
const DIETARY_TAGS = ["halal", "vegetarian", "vegan", "gluten-free", "keto", "healthy", "spicy"];

const isoDate = { type: "string" };
const id = { $ref: "id#" };
/**
 * An id or an explicit null.
 *
 * `{ ...id, nullable: true }` does not work: `nullable` is a keyword Fastify's
 * Ajv reads beside a `type`, and a `$ref` carries none — the route then fails to
 * build with *"nullable cannot be used without type"*. `anyOf` says the same
 * thing in the vocabulary a `$ref` lives in.
 */
const nullableId = { anyOf: [{ $ref: "id#" }, { type: "null" }] };

/** The refusal half of the envelope — F1 §5, and `modules/auth/schemas.js`'s shape. */
const refusalSchema = { type: "object", properties: { key: { type: "string" }, path: { type: "string" } } };

/** One 200 schema for both outcomes: a success and a refusal share a status code. */
export const envelope = (data) => ({
  type: "object",
  properties: {
    success: { type: "boolean" },
    data: { ...data, nullable: true },
    error: refusalSchema,
  },
});

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

/** `types/catalog.ts::FoodOption` — the three fields the customiser renders. */
const publicOptionSchema = {
  type: "object",
  properties: { id: { type: "string" }, name: { type: "string" }, priceDelta: { type: "number" } },
};

/** `types/catalog.ts::FoodOptionGroup`. */
const publicGroupSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    required: { type: "boolean" },
    min: { type: "integer" },
    max: { type: "integer" },
    options: { type: "array", items: publicOptionSchema },
  },
};

/**
 * `types/catalog.ts::FoodItem`.
 *
 * `isAvailable` here is the **derived** answer — the merchant's switch ANDed with
 * stock, the section and the menu. The raw column travels only on the board.
 */
export const foodItemSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    slug: { type: "string" },
    vendorId: { type: "string" },
    sectionId: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    image: { type: "string" },
    price: { type: "number" },
    compareAtPrice: { type: "number", nullable: true },
    dietary: { type: "array", items: { type: "string", enum: DIETARY_TAGS } },
    spicyLevel: { type: "integer" },
    calories: { type: "integer", nullable: true },
    rating: { type: "number" },
    reviewCount: { type: "integer" },
    isPopular: { type: "boolean" },
    isAvailable: { type: "boolean" },
    optionGroups: { type: "array", items: publicGroupSchema },
    createdAt: isoDate,
    updatedAt: isoDate,
    deletedAt: { ...isoDate, nullable: true },
  },
};

/** `types/catalog.ts::MenuSectionWithItems` — what `getVendorMenu` resolves to. */
export const sectionWithItemsSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    vendorId: { type: "string" },
    name: { type: "string" },
    sort: { type: "integer" },
    createdAt: isoDate,
    updatedAt: isoDate,
    deletedAt: { ...isoDate, nullable: true },
    items: { type: "array", items: foodItemSchema },
  },
};

/** `types/menu.ts::MenuItemStock`, widened by what `InventoryItem` actually keeps. */
const stockSchema = {
  type: "object",
  nullable: true,
  properties: {
    foodId: { type: "string", nullable: true },
    inventoryId: { type: "string" },
    branchId: { type: "string", nullable: true },
    quantity: { type: "number" },
    reserved: { type: "number" },
    available: { type: "number" },
    lowStockThreshold: { type: "number" },
    unit: { type: "string" },
    trackStock: { type: "boolean" },
    updatedAt: isoDate,
    version: { type: "integer" },
  },
};

/** The merchant's own view of a group — stored numbers, every option, switches included. */
const boardGroupSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    required: { type: "boolean" },
    min: { type: "integer" },
    max: { type: "integer" },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          priceDelta: { type: "number" },
          isDefault: { type: "boolean" },
          isAvailable: { type: "boolean" },
          sort: { type: "integer" },
        },
      },
    },
  },
};

/** `types/menu.ts::MenuBoardItem`. `item.isAvailable` is the raw switch — see `service.js`. */
export const boardItemSchema = {
  type: "object",
  properties: {
    item: {
      ...foodItemSchema,
      properties: {
        ...foodItemSchema.properties,
        sort: { type: "integer" },
        sku: { type: "string", nullable: true },
        prepMinutes: { type: "integer" },
        version: { type: "integer" },
        optionGroups: { type: "array", items: boardGroupSchema },
      },
    },
    stock: stockSchema,
    stockState: { type: "string", enum: [...STOCK_STATES] },
    suppressed: { type: "boolean" },
    outOfStock: { type: "boolean" },
    live: { type: "boolean" },
    reason: { type: "string", nullable: true },
  },
};

const boardSectionSchema = {
  type: "object",
  properties: {
    section: {
      type: "object",
      properties: {
        id: { type: "string" },
        menuId: { type: "string" },
        vendorId: { type: "string" },
        name: { type: "string" },
        description: { type: "string", nullable: true },
        sort: { type: "integer" },
        version: { type: "integer" },
        createdAt: isoDate,
        updatedAt: isoDate,
        deletedAt: { ...isoDate, nullable: true },
      },
    },
    enabled: { type: "boolean" },
    items: { type: "array", items: boardItemSchema },
  },
};

/** A `Menu`. `isServingNow` is derived per request from the window and the branch clock. */
export const menuSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    vendorId: { type: "string" },
    kind: { type: "string", enum: [...MENU_KINDS] },
    name: { type: "string" },
    isDefault: { type: "boolean" },
    isActive: { type: "boolean" },
    availableFrom: { type: "string", nullable: true },
    availableTo: { type: "string", nullable: true },
    isServingNow: { type: "boolean" },
    version: { type: "integer" },
    createdAt: isoDate,
    updatedAt: isoDate,
    deletedAt: { ...isoDate, nullable: true },
  },
};

const sectionSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    menuId: { type: "string" },
    vendorId: { type: "string" },
    name: { type: "string" },
    description: { type: "string", nullable: true },
    sort: { type: "integer" },
    isActive: { type: "boolean" },
    version: { type: "integer" },
    createdAt: isoDate,
    updatedAt: isoDate,
    deletedAt: { ...isoDate, nullable: true },
  },
};

const movementSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    itemId: { type: "string" },
    kind: { type: "string", enum: [...MOVEMENT_KINDS] },
    quantity: { type: "number" },
    balance: { type: "number" },
    refEntity: { type: "string", nullable: true },
    refId: { type: "string", nullable: true },
    note: { type: "string", nullable: true },
    actorId: { type: "string", nullable: true },
    occurredAt: isoDate,
  },
};

const deletedSchema = { type: "object", properties: { id: { type: "string" }, deleted: { type: "boolean" } } };

// ---------------------------------------------------------------------------
// Request pieces
// ---------------------------------------------------------------------------

const name = { type: "string", minLength: 1, maxLength: 160 };
const money = { type: "number", minimum: 0, maximum: 99_999_999 };
/** `Decimal(14,3)` — a kilogram of chicken is not an integer. See M5 §"Validation". */
const quantity = { type: "number", minimum: 0, maximum: 99_999_999 };
const hhmm = { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", nullable: true };

const vendorParam = { type: "object", required: ["vendorId"], properties: { vendorId: id } };
const withParam = (key) => ({
  type: "object",
  required: ["vendorId", key],
  properties: { vendorId: id, [key]: id },
});

const optionInput = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 120 },
    priceDelta: { type: "number", minimum: -99_999_999, maximum: 99_999_999, default: 0 },
    isDefault: { type: "boolean", default: false },
    isAvailable: { type: "boolean", default: true },
    sort: { type: "integer", minimum: 0, maximum: 32_000 },
  },
};

const errors = Object.freeze({
  400: { $ref: "error#" },
  401: { $ref: "error#" },
  403: { $ref: "error#" },
  404: { $ref: "error#" },
  409: { $ref: "error#" },
  500: { $ref: "error#" },
});

const okList = (item) => envelope({ type: "array", items: item });

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const ROUTE_SCHEMAS = Object.freeze({
  vendorMenu: {
    summary: "The customer's menu — `services/catalog.ts::getVendorMenu`",
    params: vendorParam,
    querystring: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: [...MENU_KINDS], default: "delivery" },
        includeUnavailable: { type: "boolean", default: true },
      },
    },
    response: { 200: okList(sectionWithItemsSchema), ...errors },
  },

  publicItem: {
    summary: "One dish, as a customer sees it",
    params: withParam("itemId"),
    response: { 200: envelope(foodItemSchema), ...errors },
  },

  validateSelection: {
    summary: "Is this set of modifiers orderable, and what does it cost?",
    params: withParam("itemId"),
    body: {
      type: "object",
      additionalProperties: false,
      properties: { options: { type: "array", items: id, maxItems: 40, default: [] } },
    },
    response: {
      200: envelope({
        type: "object",
        properties: {
          itemId: { type: "string" },
          valid: { type: "boolean" },
          violations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                code: { type: "string", enum: [...SELECTION_CODES] },
                groupId: { type: "string", nullable: true },
                optionId: { type: "string", nullable: true },
                min: { type: "integer" },
                max: { type: "integer" },
                chosen: { type: "integer" },
              },
            },
          },
          selected: { type: "array", items: { type: "string" } },
          basePrice: { type: "number" },
          unitPrice: { type: "number" },
        },
      }),
      ...errors,
    },
  },

  board: {
    summary: "The merchant's board — `types/menu.ts::MenuBoardSection[]`",
    params: vendorParam,
    querystring: {
      type: "object",
      additionalProperties: false,
      properties: { kind: { type: "string", enum: [...MENU_KINDS], default: "delivery" }, menuId: id },
    },
    response: {
      200: envelope({
        type: "object",
        properties: {
          menu: { ...menuSchema, nullable: true },
          sections: { type: "array", items: boardSectionSchema },
        },
      }),
      ...errors,
    },
  },

  listMenus: {
    summary: "Every board this vendor keeps",
    params: vendorParam,
    querystring: {
      type: "object",
      additionalProperties: false,
      properties: { kind: { type: "string", enum: [...MENU_KINDS] } },
    },
    response: { 200: okList(menuSchema), ...errors },
  },

  createMenu: {
    summary: "Open a new board",
    params: vendorParam,
    body: {
      type: "object",
      required: ["name"],
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        kind: { type: "string", enum: [...MENU_KINDS], default: "delivery" },
        isDefault: { type: "boolean" },
        isActive: { type: "boolean" },
        availableFrom: hhmm,
        availableTo: hhmm,
      },
    },
    response: { 200: envelope(menuSchema), ...errors },
  },

  updateMenu: {
    summary: "Rename, retime, activate or default a board",
    params: withParam("menuId"),
    body: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        isDefault: { type: "boolean" },
        isActive: { type: "boolean" },
        availableFrom: hhmm,
        availableTo: hhmm,
      },
    },
    response: { 200: envelope(menuSchema), ...errors },
  },

  deleteMenu: {
    summary: "Take a board down",
    params: withParam("menuId"),
    response: { 200: envelope(deletedSchema), ...errors },
  },

  createSection: {
    summary: "Add a heading to a board",
    params: withParam("menuId"),
    body: {
      type: "object",
      required: ["name"],
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        description: { type: "string", maxLength: 300, nullable: true },
        sort: { type: "integer", minimum: 0, maximum: 32_000 },
        isActive: { type: "boolean" },
      },
    },
    response: { 200: envelope(sectionSchema), ...errors },
  },

  updateSection: {
    summary: "Rename, move, reorder or switch off a heading",
    params: withParam("sectionId"),
    body: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        description: { type: "string", maxLength: 300, nullable: true },
        sort: { type: "integer", minimum: 0, maximum: 32_000 },
        isActive: { type: "boolean" },
        menuId: id,
      },
    },
    response: { 200: envelope(sectionSchema), ...errors },
  },

  deleteSection: {
    summary: "Take a heading off the board",
    params: withParam("sectionId"),
    response: { 200: envelope(deletedSchema), ...errors },
  },

  reorderSections: {
    summary: "The whole order at once — see `service.js::reorderSections`",
    params: withParam("menuId"),
    body: {
      type: "object",
      required: ["sectionIds"],
      additionalProperties: false,
      properties: { sectionIds: { type: "array", items: id, minItems: 1, maxItems: 200 } },
    },
    response: { 200: okList(sectionSchema), ...errors },
  },

  createItem: {
    summary: "Put a dish on the board",
    params: withParam("sectionId"),
    body: {
      type: "object",
      required: ["name", "price"],
      additionalProperties: false,
      properties: {
        name,
        slug: { type: "string", minLength: 1, maxLength: 140 },
        description: { type: "string", maxLength: 4000 },
        image: { type: "string", maxLength: 500 },
        price: money,
        compareAtPrice: { ...money, nullable: true },
        dietary: { type: "array", items: { type: "string", enum: DIETARY_TAGS }, maxItems: 7 },
        categoryIds: { type: "array", items: id, maxItems: 10 },
        spicyLevel: { type: "integer", minimum: 0, maximum: 3 },
        calories: { type: "integer", minimum: 0, maximum: 100_000, nullable: true },
        isPopular: { type: "boolean" },
        isAvailable: { type: "boolean" },
        prepMinutes: { type: "integer", minimum: 0, maximum: 32_000 },
        sort: { type: "integer", minimum: 0, maximum: 32_000 },
        sku: { type: "string", maxLength: 60, nullable: true },
      },
    },
    response: { 200: envelope(boardItemSchema), ...errors },
  },

  updateItem: {
    summary: "Edit a dish — including moving it to another heading",
    params: withParam("itemId"),
    body: {
      type: "object",
      additionalProperties: false,
      properties: {
        name,
        description: { type: "string", maxLength: 4000 },
        image: { type: "string", maxLength: 500 },
        price: money,
        compareAtPrice: { ...money, nullable: true },
        dietary: { type: "array", items: { type: "string", enum: DIETARY_TAGS }, maxItems: 7 },
        categoryIds: { type: "array", items: id, maxItems: 10 },
        spicyLevel: { type: "integer", minimum: 0, maximum: 3 },
        calories: { type: "integer", minimum: 0, maximum: 100_000, nullable: true },
        isPopular: { type: "boolean" },
        prepMinutes: { type: "integer", minimum: 0, maximum: 32_000 },
        sort: { type: "integer", minimum: 0, maximum: 32_000 },
        sku: { type: "string", maxLength: 60, nullable: true },
        sectionId: id,
      },
    },
    response: { 200: envelope(boardItemSchema), ...errors },
  },

  deleteItem: {
    summary: "Take a dish off the board",
    params: withParam("itemId"),
    response: { 200: envelope(deletedSchema), ...errors },
  },

  reorderItems: {
    summary: "The whole order at once, within one heading",
    params: withParam("sectionId"),
    body: {
      type: "object",
      required: ["itemIds"],
      additionalProperties: false,
      properties: { itemIds: { type: "array", items: id, minItems: 1, maxItems: 500 } },
    },
    response: {
      200: okList({
        type: "object",
        properties: { id: { type: "string" }, name: { type: "string" }, sort: { type: "integer" } },
      }),
      ...errors,
    },
  },

  setAvailability: {
    summary: "The 86 switch — the pass's call, not only the manager's",
    params: withParam("itemId"),
    body: {
      type: "object",
      required: ["isAvailable"],
      additionalProperties: false,
      properties: { isAvailable: { type: "boolean" } },
    },
    response: { 200: envelope(boardItemSchema), ...errors },
  },

  createGroup: {
    summary: "A modifier group and its options, in one call — see `options.js`",
    params: withParam("itemId"),
    body: {
      type: "object",
      required: ["name", "min", "max", "options"],
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        required: { type: "boolean", default: false },
        min: { type: "integer", minimum: 0, maximum: 32_000 },
        max: { type: "integer", minimum: 1, maximum: 32_000 },
        sort: { type: "integer", minimum: 0, maximum: 32_000 },
        options: { type: "array", items: optionInput, minItems: 1, maxItems: 100 },
      },
    },
    response: { 200: envelope(boardGroupSchema), ...errors },
  },

  updateGroup: {
    summary: "Re-label a group or move its selection bounds",
    params: withParam("groupId"),
    body: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        required: { type: "boolean" },
        min: { type: "integer", minimum: 0, maximum: 32_000 },
        max: { type: "integer", minimum: 1, maximum: 32_000 },
        sort: { type: "integer", minimum: 0, maximum: 32_000 },
      },
    },
    response: { 200: envelope(boardGroupSchema), ...errors },
  },

  deleteGroup: {
    summary: "Remove a group from a dish",
    params: withParam("groupId"),
    response: { 200: envelope(deletedSchema), ...errors },
  },

  createOption: {
    summary: "Add one option to a group",
    params: withParam("groupId"),
    body: optionInput,
    response: {
      200: envelope({
        type: "object",
        properties: {
          id: { type: "string" },
          groupId: { type: "string" },
          name: { type: "string" },
          priceDelta: { type: "number" },
          isDefault: { type: "boolean" },
          isAvailable: { type: "boolean" },
          sort: { type: "integer" },
        },
      }),
      ...errors,
    },
  },

  updateOption: {
    summary: "Edit an option — switching one off re-judges its group",
    params: withParam("optionId"),
    body: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1, maxLength: 120 },
        priceDelta: { type: "number", minimum: -99_999_999, maximum: 99_999_999 },
        isDefault: { type: "boolean" },
        isAvailable: { type: "boolean" },
        sort: { type: "integer", minimum: 0, maximum: 32_000 },
      },
    },
    response: {
      200: envelope({
        type: "object",
        properties: {
          id: { type: "string" },
          groupId: { type: "string" },
          name: { type: "string" },
          priceDelta: { type: "number" },
          isDefault: { type: "boolean" },
          isAvailable: { type: "boolean" },
          sort: { type: "integer" },
        },
      }),
      ...errors,
    },
  },

  deleteOption: {
    summary: "Remove an option — refused when it would break its group",
    params: withParam("optionId"),
    response: { 200: envelope(deletedSchema), ...errors },
  },

  listInventory: {
    summary: "Every counted shelf at this vendor",
    params: vendorParam,
    querystring: {
      type: "object",
      additionalProperties: false,
      properties: { ...paginationProperties, trackedOnly: { type: "boolean" } },
    },
    response: {
      200: envelope({
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              ...stockSchema,
              nullable: false,
              properties: {
                ...stockSchema.properties,
                name: { type: "string" },
                sku: { type: "string", nullable: true },
                unitCost: { type: "number", nullable: true },
                food: {
                  type: "object",
                  nullable: true,
                  properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" } },
                },
              },
            },
          },
          total: { type: "integer" },
          page: { type: "integer" },
          pageSize: { type: "integer" },
          hasMore: { type: "boolean" },
        },
      }),
      ...errors,
    },
  },

  itemStock: {
    summary: "One dish's count — null when nothing counts it",
    params: withParam("itemId"),
    response: {
      200: envelope({ type: "object", properties: { itemId: { type: "string" }, stock: stockSchema } }),
      ...errors,
    },
  },

  setItemStock: {
    summary: "Start counting, stop counting, or set the count outright",
    params: withParam("itemId"),
    body: {
      type: "object",
      additionalProperties: false,
      properties: {
        quantity,
        lowStockThreshold: quantity,
        trackStock: { type: "boolean" },
        unit: { type: "string", minLength: 1, maxLength: 16 },
        branchId: nullableId,
        note: { type: "string", maxLength: 240 },
      },
    },
    response: {
      200: envelope({
        type: "object",
        properties: {
          itemId: { type: "string" },
          stock: stockSchema,
          movement: { ...movementSchema, nullable: true },
        },
      }),
      ...errors,
    },
  },

  adjustItemStock: {
    summary: "Move the count by a signed delta, atomically",
    params: withParam("itemId"),
    body: {
      type: "object",
      required: ["delta"],
      additionalProperties: false,
      properties: {
        delta: { type: "number", minimum: -99_999_999, maximum: 99_999_999 },
        kind: { type: "string", enum: [...MOVEMENT_KINDS], default: "adjusted" },
        note: { type: "string", maxLength: 240 },
        refEntity: { type: "string", maxLength: 40 },
        refId: { type: "string", maxLength: 40 },
      },
    },
    response: {
      200: envelope({
        type: "object",
        properties: {
          itemId: { type: "string" },
          stock: stockSchema,
          movement: movementSchema,
          available: { type: "boolean" },
        },
      }),
      ...errors,
    },
  },

  movements: {
    summary: "Why the balance is what it is",
    params: withParam("itemId"),
    querystring: {
      type: "object",
      additionalProperties: false,
      properties: { limit: { type: "integer", minimum: 1, maximum: MAX_PAGE_SIZE, default: 50 } },
    },
    response: {
      200: envelope({
        type: "object",
        properties: {
          itemId: { type: "string" },
          inventoryId: { type: "string" },
          movements: { type: "array", items: movementSchema },
        },
      }),
      ...errors,
    },
  },
});

/**
 * schemas.js — module 6's wire contract, as JSON Schema.
 *
 * Fastify's own validation and serialisation, as modules 2, 4 and 5 do it:
 * declared per route, compiled once at boot, and — the half that matters most —
 * the `response` schema **filters the body on the way out**. Here that is the
 * second, independent guarantee that a basket cannot leak the storefront's
 * private numbers: `cartSchema` is `types/cart.ts` field for field, so a stock
 * count, an inventory id or a `sku` cannot reach a customer however `service.js`
 * is later changed.
 *
 * The shapes are the frontend's, not new ones:
 *
 *   cartVendorSchema   types/cart.ts::CartVendor
 *   cartLineSchema     types/cart.ts::CartLine        (+ `note`, `lineTotal`)
 *   cartSchema         services/cart.ts::ServerCart   (− `deliveryFee`, see below)
 *
 * **`ServerCart.deliveryFee` is deliberately absent.** The frontend's mirror type
 * declares it because V1's GraphQL cart computed one; this module does not, for
 * the reason `service.js` §4 gives — the fee is checkout's, and two engines that
 * compute it are two engines that will disagree. The vendor's `deliveryFee`
 * *term* is on `vendor`, which is what `lib/cart.ts::deliveryFeeFor` needs to do
 * the client-side arithmetic it already does.
 */

/** The anonymous basket key — `lib/cart-key.ts` mints 32 hex characters. */
export const GUEST_KEY_HEADER = "x-cart-key";

/**
 * What a usable guest key looks like — and why this is a function rather than a
 * `headers` JSON Schema, which is the shape it obviously wants to be.
 *
 * F1 configures Ajv with **`removeAdditional: "all"`**, which is right for a body
 * and catastrophic for headers: a `headers` schema declaring only `x-cart-key`
 * deletes every other header from the request, `authorization` included, so the
 * module silently stops seeing sessions. That is a five-line schema that breaks
 * authentication with no error anywhere, and it is worth the comment because the
 * next module to want a header validated will reach for exactly it.
 *
 * So the rule lives here, `service.js::ownerOf` applies it, and it is the same
 * rule either way. The floor is the security model rather than a format:
 * `lib/cart-key.ts` says *"the server additionally refuses anything shorter than
 * 16 characters"*, because possession of the key **is** the claim to the basket
 * and a short key is a guessable one. The ceiling is `carts.guestKey`'s
 * `VARCHAR(60)`.
 */
const GUEST_KEY_PATTERN = /^[A-Za-z0-9_-]{16,60}$/;

export const isUsableGuestKey = (value) => typeof value === "string" && GUEST_KEY_PATTERN.test(value);

/**
 * A cart-line id in a path.
 *
 * Not `id#`: a line id is not a minted id at all, it is the composite
 * `foodId|option|option` (or its digest form) that `lines.js` builds, so the
 * shared pattern would reject every real one. The character class is exactly what
 * `makeLineId` can emit — an id's own alphabet plus the `|` separator and the `~`
 * digest marker — which makes this a second, independent statement that a client
 * cannot smuggle anything else into a primary key.
 */
const lineIdSchema = { type: "string", minLength: 1, maxLength: 120, pattern: "^[A-Za-z0-9_~|-]+$" };

export const lineParamsSchema = {
  type: "object",
  required: ["lineId"],
  additionalProperties: false,
  properties: { lineId: lineIdSchema },
};

/** The refusal half of the envelope — F1 §5, and module 5's shape. */
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

/** `types/cart.ts::CartSelectedOption`. */
const cartOptionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    groupId: { type: "string" },
    optionId: { type: "string" },
    name: { type: "string" },
    priceDelta: { type: "number" },
  },
};

/** `types/cart.ts::CartLine`. Every number here is a stored snapshot. */
const cartLineSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    foodId: { type: "string" },
    name: { type: "string" },
    image: { type: "string" },
    basePrice: { type: "number" },
    unitPrice: { type: "number" },
    quantity: { type: "integer" },
    note: { type: "string", nullable: true },
    lineTotal: { type: "number" },
    options: { type: "array", items: cartOptionSchema },
  },
};

/** `types/cart.ts::CartVendor` — the storefront snapshot, read fresh on every call. */
const cartVendorSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    slug: { type: "string" },
    name: { type: "string" },
    currency: { type: "string" },
    countryCode: { type: "string", nullable: true },
    location: {
      type: "object",
      nullable: true,
      additionalProperties: false,
      properties: { lat: { type: "number" }, lng: { type: "number" }, place: { type: "string" } },
    },
    deliveryFee: { type: "number" },
    minOrder: { type: "number" },
    freeDeliveryOver: { type: "number", nullable: true },
  },
};

const cartSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    vendorId: { type: "string" },
    branchId: { type: "string", nullable: true },
    currency: { type: "string" },
    fulfillment: { type: "string" },
    vendor: cartVendorSchema,
    lines: { type: "array", items: cartLineSchema },
    subtotal: { type: "number" },
    count: { type: "integer" },
    lineCount: { type: "integer" },
    updatedAt: { type: "string" },
    expiresAt: { type: "string", nullable: true },
    version: { type: "integer" },
  },
};

/**
 * One validation finding.
 *
 * `additionalProperties: true` — and this is the one schema in the module that
 * says so on purpose. A finding's payload varies by code (`insufficient-stock`
 * carries counts, `price-changed` carries two prices), and enumerating the union
 * here would mean editing this file every time a code learns a field, with a
 * silently dropped number as the failure mode.
 */
const issueSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    code: { type: "string" },
    lineId: { type: "string", nullable: true },
  },
};

const validationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    valid: { type: "boolean" },
    issues: { type: "array", items: issueSchema },
    cart: { ...cartSchema, nullable: true },
  },
};

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

/**
 * `POST /items`.
 *
 * **There is no `unitPrice`, no `basePrice`, no option `name` and no
 * `priceDelta`, and no `vendorId`.** The first four because the server reads
 * them from stored rows (`service.js` §2) and a field that cannot be expressed
 * cannot be trusted by accident. The last because `FoodItem.vendorId` already
 * says which restaurant this dish belongs to: asking the client to repeat it
 * creates a pair that can disagree, and the only thing to do with a disagreement
 * is ignore the client's half.
 *
 * `quantity`'s ceiling here is the column's (`SMALLINT`), not the product's —
 * `CART_MAX_LINE_QUANTITY` is configurable and the service refuses against it, so
 * a static schema that hard-coded today's value would silently become the real
 * limit.
 */
export const addItemBodySchema = {
  type: "object",
  required: ["foodId"],
  additionalProperties: false,
  properties: {
    foodId: { $ref: "id#" },
    optionIds: { type: "array", maxItems: 40, items: { $ref: "id#" } },
    quantity: { type: "integer", minimum: 1, maximum: 32_767, default: 1 },
    note: { type: "string", maxLength: 240 },
    /** The customer's answer to `cart.switchTitle`, relayed. Never assumed. */
    replaceExisting: { type: "boolean", default: false },
  },
};

export const updateQuantityBodySchema = {
  type: "object",
  required: ["quantity"],
  additionalProperties: false,
  /** Zero is a removal — see `service.js::updateQuantity`. */
  properties: { quantity: { type: "integer", minimum: 0, maximum: 32_767 } },
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const errors = Object.freeze({ 400: { $ref: "error#" }, 401: { $ref: "error#" }, 500: { $ref: "error#" } });

export const ROUTE_SCHEMAS = Object.freeze({
  getCart: {
    response: { 200: envelope(cartSchema), ...errors },
  },
  addItem: {
    body: addItemBodySchema,
    response: { 200: envelope(cartSchema), ...errors },
  },
  updateQuantity: {
    params: lineParamsSchema,
    body: updateQuantityBodySchema,
    response: { 200: envelope(cartSchema), ...errors },
  },
  removeItem: {
    params: lineParamsSchema,
    response: { 200: envelope(cartSchema), ...errors },
  },
  clearCart: {
    response: { 200: envelope(cartSchema), ...errors },
  },
  validateCart: {
    response: { 200: envelope(validationSchema), ...errors },
  },
});

export default { ROUTE_SCHEMAS, GUEST_KEY_HEADER, envelope, isUsableGuestKey };

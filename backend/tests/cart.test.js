/**
 * cart.test.js — module 6, against real PostgreSQL and the real routes.
 *
 * Nothing here is mocked. The storefronts, menus, dishes, modifier groups,
 * inventory rows and accounts are created for the run and hard-deleted after it;
 * every assertion goes through the mounted routes with `app.inject`, so the
 * `optionalUser` hook, the JSON Schema validation and the response filtering are
 * all in the path.
 *
 * ## Why almost everything goes through the routes
 *
 * `cart-lines.test.js` already covers line identity and the arithmetic as
 * functions. What is left is precisely what a function call cannot exercise and
 * what this module is most likely to get wrong:
 *
 *  - **ownership** — which is not a check in this module but a shape, so the only
 *    honest way to test it is to ask for somebody else's basket and see what
 *    comes back;
 *  - **the merge**, which is a primary key in PostgreSQL and a `Map` in any fake,
 *    and it was a global primary key once — two customers ordering the same
 *    Margherita incremented each other's line (DSC-1). That regression is here;
 *  - **the transaction**, which is only a real claim when two writes race against
 *    one row in one database;
 *  - **`reserved`**, which this module promises never to touch. A promise about a
 *    column is worth exactly as much as the query that checks it.
 *
 * ## Fixtures
 *
 * Two storefronts owned by two different people, each with a menu, so
 * "cross-vendor" is a case rather than a hypothetical. Vendor A's board carries
 * the dishes every rule needs: one with a required size group and an optional
 * extras group, one counted down to five portions, one switched off, one sold
 * out, and one inside a switched-off section.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ulid } from "ulid";
import { buildApp } from "../src/app.js";
import { toDbEnum } from "../src/shared/utils/enums.js";
import { WEEKDAYS } from "../src/modules/catalog/hours.js";
import { makeLineId } from "../src/modules/cart/lines.js";

const STAMP = Date.now().toString(36);
const RUN = `m6${STAMP}`;
const PASSWORD = "correct horse battery staple";
const AUTH = "/api/v1/auth";
const BASE = "/api/v1/cart";

let app;
let prisma;
let seq = 0;

const created = { vendors: [], users: [] };

/** An id for a table this module does not mint — module 3 and 5's helper. */
const fixtureId = (prefix) => `${prefix}${ulid()}`;

/** A guest key of the shape `lib/cart-key.ts` mints: 32 hex characters. */
const guestKey = () => `${RUN}${ulid()}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 40);

function call(method, path, { token, key, payload } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers["x-cart-key"] = key;
  return app.inject({
    method,
    url: `${BASE}${path}`,
    headers,
    ...(payload === undefined ? {} : { payload }),
  });
}

/** A 200 whose body is a success. Returns `data`. */
async function ok(method, path, options = {}) {
  const response = await call(method, path, options);
  assert.equal(response.statusCode, 200, `${method} ${path} → ${response.statusCode} ${response.body}`);
  const body = response.json();
  assert.equal(body.success, true, response.body);
  return body.data;
}

/** A 200 whose body is a refusal. Returns `error`. */
async function refused(method, path, options = {}) {
  const response = await call(method, path, options);
  assert.equal(response.statusCode, 200, `${method} ${path} → ${response.statusCode} ${response.body}`);
  const body = response.json();
  assert.equal(body.success, false, `expected a refusal, got ${response.body}`);
  return body.error;
}

/** An exception. Returns the status. */
async function failed(method, path, options = {}) {
  const response = await call(method, path, options);
  assert.notEqual(response.statusCode, 200, `expected a failure, got ${response.body}`);
  return { status: response.statusCode, error: response.json().error };
}

async function signUp(role = "customer") {
  seq += 1;
  const response = await app.inject({
    method: "POST",
    url: `${AUTH}/register`,
    payload: { name: `Module 6 Account ${seq}`, email: `${RUN}-${seq}@example.test`, password: PASSWORD, role },
  });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  created.users.push(body.data.user.id);
  return { id: body.data.user.id, token: body.data.accessToken };
}

async function makeVendor({ ownerId, slug, status = "active" }) {
  const id = fixtureId("ven_");
  await prisma.vendor.create({
    data: {
      id,
      slug,
      name: slug,
      tagline: `${RUN} fixture`,
      description: RUN,
      type: toDbEnum("VendorTypeKind", "restaurant"),
      status: toDbEnum("VendorStatus", status),
      ownerId,
      currency: "BDT",
      priceLevel: 2,
    },
    select: { id: true },
  });
  created.vendors.push(id);

  const branchId = fixtureId("vbr_");
  await prisma.vendorBranch.create({
    data: {
      id: branchId,
      vendorId: id,
      isPrimary: true,
      name: `${slug} main`,
      slug: "branch-0",
      lat: "23.7806",
      lng: "90.4152",
      address: "Gulshan 1, Dhaka",
      city: "Dhaka",
      countryCode: "BD",
      timezone: "Asia/Dhaka",
      etaMinMinutes: 25,
      etaMaxMinutes: 40,
      deliveryFee: "60.00",
      minOrder: "300.00",
      freeDeliveryOver: "800.00",
      status: toDbEnum("VendorStatus", status),
      hours: {
        create: WEEKDAYS.map((weekday) => ({
          id: fixtureId("bhr_"),
          weekday: toDbEnum("WeekdayKind", weekday),
          openTime: "00:00",
          closeTime: "23:59",
          overnight: false,
          sort: 0,
        })),
      },
    },
    select: { id: true },
  });

  const menuId = fixtureId("menu_");
  await prisma.menu.create({
    data: {
      id: menuId,
      vendorId: id,
      kind: toDbEnum("MenuKind", "delivery"),
      name: "Main",
      isDefault: true,
      isActive: true,
    },
    select: { id: true },
  });

  return { id, slug, branchId, menuId };
}

async function makeSection(vendor, { name, isActive = true }) {
  const id = fixtureId("sec_");
  await prisma.menuSection.create({
    data: { id, menuId: vendor.menuId, vendorId: vendor.id, name, sort: 0, isActive },
    select: { id: true },
  });
  return id;
}

let dishSeq = 0;
async function makeDish(vendor, sectionId, { name, price, isAvailable = true, stock = null, trackStock = true }) {
  dishSeq += 1;
  const id = fixtureId("food_");
  await prisma.foodItem.create({
    data: {
      id,
      slug: `${RUN}-${dishSeq}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      vendorId: vendor.id,
      sectionId,
      name,
      image: `https://cdn.example.test/${dishSeq}.jpg`,
      price: String(price),
      isAvailable,
    },
    select: { id: true },
  });

  if (stock !== null) {
    await prisma.inventoryItem.create({
      data: {
        id: fixtureId("inv_"),
        vendorId: vendor.id,
        foodId: id,
        branchId: vendor.branchId,
        name,
        onHand: String(stock),
        reserved: "0",
        lowStockAt: "0",
        trackStock,
      },
      select: { id: true },
    });
  }
  return id;
}

async function makeGroup(foodId, { name, required, min, max, options }) {
  const id = fixtureId("fog_");
  await prisma.foodOptionGroup.create({
    data: { id, foodId, name, required, min, max, sort: 0 },
    select: { id: true },
  });
  const optionIds = {};
  let sort = 0;
  for (const option of options) {
    const optionId = fixtureId("fop_");
    optionIds[option.key] = optionId;
    await prisma.foodOption.create({
      data: {
        id: optionId,
        groupId: id,
        name: option.name,
        priceDelta: String(option.priceDelta ?? 0),
        isAvailable: option.isAvailable ?? true,
        sort: (sort += 1),
      },
      select: { id: true },
    });
  }
  return { id, options: optionIds };
}

/** `onHand` and `reserved` as stored, for the promise in §3 of `service.js`. */
const stockOf = async (foodId) =>
  prisma.inventoryItem.findFirst({ where: { foodId }, select: { onHand: true, reserved: true } });

// ---------------------------------------------------------------------------

let alice; // a customer with an account
let bob; // a second customer
let vendorA;
let vendorB;
let sectionA;
let closedSection;
let margherita; // 720, required size group + optional extras group
let size;
let extras;
let counted; // five portions on the shelf
let switchedOff;
let soldOut;
let hidden; // inside a switched-off section
let plain; // no modifiers, no inventory row — the dish tests reach for by default
let burger; // vendor B

before(async () => {
  app = await buildApp();
  prisma = app.prisma;

  [alice, bob] = await Promise.all([signUp("customer"), signUp("customer")]);

  vendorA = await makeVendor({ ownerId: alice.id, slug: `${RUN}-alpha` });
  vendorB = await makeVendor({ ownerId: bob.id, slug: `${RUN}-beta` });

  sectionA = await makeSection(vendorA, { name: "Pizza" });
  closedSection = await makeSection(vendorA, { name: "Seasonal", isActive: false });

  margherita = await makeDish(vendorA, sectionA, { name: "Margherita", price: 720, stock: null });
  size = await makeGroup(margherita, {
    name: "Size",
    required: true,
    min: 1,
    max: 1,
    options: [
      { key: "small", name: "Small", priceDelta: 0 },
      { key: "large", name: "Large", priceDelta: 250 },
      { key: "retired", name: "Family", priceDelta: 400, isAvailable: false },
    ],
  });
  extras = await makeGroup(margherita, {
    name: "Extras",
    required: false,
    min: 0,
    max: 2,
    options: [
      { key: "basil", name: "Basil", priceDelta: 50 },
      { key: "olives", name: "Olives", priceDelta: 80 },
      { key: "truffle", name: "Truffle", priceDelta: 300 },
    ],
  });

  counted = await makeDish(vendorA, sectionA, { name: "Lasagne", price: 500, stock: 5 });
  switchedOff = await makeDish(vendorA, sectionA, { name: "Calzone", price: 600, isAvailable: false });
  soldOut = await makeDish(vendorA, sectionA, { name: "Sea bass", price: 1200, stock: 0 });
  hidden = await makeDish(vendorA, closedSection, { name: "Pumpkin soup", price: 300 });
  plain = await makeDish(vendorA, sectionA, { name: "Garlic bread", price: 180 });
  burger = await makeDish(vendorB, await makeSection(vendorB, { name: "Burgers" }), {
    name: "Smash",
    price: 450,
  });
});

after(async () => {
  const raw = prisma.$unfiltered();
  if (created.vendors.length > 0) await raw.vendor.deleteMany({ where: { id: { in: created.vendors } } });
  if (created.users.length > 0) await raw.user.deleteMany({ where: { id: { in: created.users } } });
  await app.close();
});

// ---------------------------------------------------------------------------

describe("who owns a basket", () => {
  it("a request that names nobody is UNAUTHENTICATED, not an empty cart", async () => {
    // "You did not say who you are" and "your basket is empty" are different
    // facts, and a client that conflates them shows an empty cart to somebody
    // who has one.
    const { status, error } = await failed("GET", "/");
    assert.equal(status, 401);
    assert.equal(error.code, "UNAUTHENTICATED");
  });

  it("a signed-in customer with no basket gets null, at 200", async () => {
    assert.equal(await ok("GET", "/", { token: alice.token }), null);
  });

  it("a guest with a key and no basket gets null too", async () => {
    assert.equal(await ok("GET", "/", { key: guestKey() }), null);
  });

  it("refuses a guest key too short to be unguessable", async () => {
    // `lib/cart-key.ts`: possession of the key is the claim to the basket.
    const { status } = await failed("GET", "/", { key: "short" });
    assert.equal(status, 400);
  });

  it("a bad token falls back to the guest key rather than failing the request", async () => {
    const key = guestKey();
    await ok("POST", "/items", { key, payload: { foodId: counted } });
    const cart = await ok("GET", "/", { token: "not-a-jwt", key });
    assert.equal(cart.lines.length, 1);
  });
});

describe("adding a dish", () => {
  it("takes foodId and option ids and prices it from the stored rows", async () => {
    const cart = await ok("POST", "/items", {
      token: alice.token,
      payload: { foodId: margherita, optionIds: [size.options.large, extras.options.basil], quantity: 2 },
    });

    assert.equal(cart.vendorId, vendorA.id);
    assert.equal(cart.lines.length, 1);
    const [line] = cart.lines;
    assert.equal(line.basePrice, 720);
    assert.equal(line.unitPrice, 1020); // 720 + 250 + 50
    assert.equal(line.quantity, 2);
    assert.equal(cart.subtotal, 2040);
    assert.equal(cart.count, 2);
  });

  it("snapshots the option names and deltas, not just their ids", async () => {
    const cart = await ok("GET", "/", { token: alice.token });
    const names = cart.lines[0].options.map((option) => `${option.name}:${option.priceDelta}`).sort();
    assert.deepEqual(names, ["Basil:50", "Large:250"]);
  });

  it("carries the vendor snapshot the drawer renders", async () => {
    const cart = await ok("GET", "/", { token: alice.token });
    assert.equal(cart.vendor.id, vendorA.id);
    assert.equal(cart.vendor.currency, "BDT");
    assert.equal(cart.vendor.deliveryFee, 60);
    assert.equal(cart.vendor.minOrder, 300);
    assert.equal(cart.vendor.freeDeliveryOver, 800);
    assert.equal(cart.vendor.location.place, "Gulshan 1, Dhaka");
  });

  it("computes no delivery fee, tax, discount or total — those are checkout's", async () => {
    const cart = await ok("GET", "/", { token: alice.token });
    for (const field of ["deliveryFee", "tax", "discount", "total", "tip"]) {
      assert.equal(field in cart, false, `cart must not carry ${field}`);
    }
  });

  it("a price the client states never reaches the service", async () => {
    // `additionalProperties: false` on the body plus F1's `removeAdditional:
    // "all"`: the field is deleted before the handler runs, so it cannot be
    // trusted by accident. Dropped rather than refused, which is the stronger of
    // the two — there is no code path in which a client price exists at all.
    const key = guestKey();
    const cart = await ok("POST", "/items", {
      key,
      payload: { foodId: counted, unitPrice: 1, basePrice: 1 },
    });
    assert.equal(cart.lines[0].unitPrice, 500);
    assert.equal(cart.lines[0].basePrice, 500);
  });

  it("the same configuration merges into the line already there", async () => {
    const cart = await ok("POST", "/items", {
      token: alice.token,
      payload: { foodId: margherita, optionIds: [extras.options.basil, size.options.large], quantity: 1 },
    });
    // Option order reversed — same burger, same line.
    assert.equal(cart.lines.length, 1);
    assert.equal(cart.lines[0].quantity, 3);
  });

  it("a different configuration of the same dish is a second line", async () => {
    const cart = await ok("POST", "/items", {
      token: alice.token,
      payload: { foodId: margherita, optionIds: [size.options.small], quantity: 1 },
    });
    assert.equal(cart.lines.length, 2);
    assert.equal(cart.lineCount, 2);
    assert.equal(cart.count, 4);
  });

  it("the line id is the composite the schema documents", async () => {
    const cart = await ok("GET", "/", { token: alice.token });
    const small = cart.lines.find((line) => line.unitPrice === 720);
    assert.equal(small.id, makeLineId(margherita, [size.options.small]));
  });

  it("refuses a dish that does not exist", async () => {
    const error = await refused("POST", "/items", {
      token: alice.token,
      payload: { foodId: `food_${ulid()}` },
    });
    assert.equal(error.key, "errors.itemNotFound");
  });

  it("refuses a malformed food id before the database", async () => {
    const { status } = await failed("POST", "/items", { token: alice.token, payload: { foodId: "nope" } });
    assert.equal(status, 400);
  });

  it("refuses a dish the merchant switched off", async () => {
    const error = await refused("POST", "/items", { token: alice.token, payload: { foodId: switchedOff } });
    assert.equal(error.key, "cart.errors.itemUnavailable");
  });

  it("refuses a dish that sold out", async () => {
    const error = await refused("POST", "/items", { token: alice.token, payload: { foodId: soldOut } });
    assert.equal(error.key, "cart.errors.outOfStock");
  });

  it("refuses a dish inside a switched-off section", async () => {
    const error = await refused("POST", "/items", { token: alice.token, payload: { foodId: hidden } });
    assert.equal(error.key, "cart.errors.itemUnavailable");
  });

  it("refuses a quantity beyond what one line may hold", async () => {
    const error = await refused("POST", "/items", {
      token: alice.token,
      payload: { foodId: counted, quantity: 30_000 },
    });
    assert.equal(error.key, "cart.errors.quantityLimit");
  });

  it("refuses a quantity of zero at the schema", async () => {
    const { status } = await failed("POST", "/items", {
      token: alice.token,
      payload: { foodId: counted, quantity: 0 },
    });
    assert.equal(status, 400);
  });
});

describe("modifier validation", () => {
  const key = guestKey();

  it("refuses a required group left empty", async () => {
    const error = await refused("POST", "/items", { key, payload: { foodId: margherita, optionIds: [] } });
    assert.equal(error.key, "cart.errors.selectionInvalid");
    assert.equal(error.path, `options.${size.id}`);
  });

  it("refuses more choices than the group's max", async () => {
    const error = await refused("POST", "/items", {
      key,
      payload: {
        foodId: margherita,
        optionIds: [size.options.large, extras.options.basil, extras.options.olives, extras.options.truffle],
      },
    });
    assert.equal(error.key, "cart.errors.selectionInvalid");
  });

  it("refuses two choices in a group that allows one", async () => {
    const error = await refused("POST", "/items", {
      key,
      payload: { foodId: margherita, optionIds: [size.options.small, size.options.large] },
    });
    assert.equal(error.key, "cart.errors.selectionInvalid");
  });

  it("refuses an option the merchant deactivated", async () => {
    const error = await refused("POST", "/items", {
      key,
      payload: { foodId: margherita, optionIds: [size.options.retired] },
    });
    assert.equal(error.key, "cart.errors.selectionInvalid");
  });

  it("refuses an option that belongs to another dish", async () => {
    // From the customer's side "not yours" and "not real" are the same mistake,
    // and saying which would let somebody enumerate a competitor's menu by id.
    const other = await makeGroup(burger, {
      name: "Cheese",
      required: false,
      min: 0,
      max: 1,
      options: [{ key: "cheddar", name: "Cheddar", priceDelta: 40 }],
    });
    const error = await refused("POST", "/items", {
      key,
      payload: { foodId: margherita, optionIds: [size.options.large, other.options.cheddar] },
    });
    assert.equal(error.key, "cart.errors.selectionInvalid");
  });

  it("refuses an option id that does not exist anywhere", async () => {
    const error = await refused("POST", "/items", {
      key,
      payload: { foodId: margherita, optionIds: [size.options.large, `fop_${ulid()}`] },
    });
    assert.equal(error.key, "cart.errors.selectionInvalid");
  });

  it("accepts a valid selection and nothing was written by the refusals", async () => {
    const cart = await ok("POST", "/items", {
      key,
      payload: { foodId: margherita, optionIds: [size.options.small] },
    });
    assert.equal(cart.lines.length, 1);
    assert.equal(cart.lines[0].unitPrice, 720);
  });
});

describe("one basket, one restaurant", () => {
  const key = guestKey();

  it("refuses a dish from a second restaurant", async () => {
    await ok("POST", "/items", { key, payload: { foodId: counted } });
    const error = await refused("POST", "/items", { key, payload: { foodId: burger } });
    assert.equal(error.key, "cart.errors.vendorConflict");
    assert.equal(error.path, "vendorId");
  });

  it("and the refusal wrote nothing — the first basket is intact", async () => {
    const cart = await ok("GET", "/", { key });
    assert.equal(cart.vendorId, vendorA.id);
    assert.equal(cart.lines.length, 1);
  });

  it("accepts it once the customer has answered the prompt", async () => {
    const cart = await ok("POST", "/items", { key, payload: { foodId: burger, replaceExisting: true } });
    assert.equal(cart.vendorId, vendorB.id);
    assert.equal(cart.lines.length, 1);
    assert.equal(cart.lines[0].foodId, burger);
  });

  it("the discarded basket is a tombstone, and its lines really left", async () => {
    // `carts` has `deletedAt`; `cart_items` does not. The asymmetry is the
    // schema's, and it is what makes a discard a tombstone plus a hard delete.
    const raw = prisma.$unfiltered();
    const old = await raw.cart.findFirst({
      where: { guestKey: key, vendorId: vendorA.id },
      select: { id: true, deletedAt: true },
    });
    assert.notEqual(old.deletedAt, null);
    assert.equal(await raw.cartItem.count({ where: { cartId: old.id } }), 0);
  });

  it("coming back to the first restaurant revives the tombstone rather than colliding", async () => {
    // `@@unique([userId, vendorId])` and `carts_guest_vendor_uq` do not know
    // about `deletedAt`, so an INSERT here is a unique violation that only ever
    // appears for customers who came back.
    const cart = await ok("POST", "/items", { key, payload: { foodId: counted, replaceExisting: true } });
    assert.equal(cart.vendorId, vendorA.id);

    const raw = prisma.$unfiltered();
    const rows = await raw.cart.findMany({ where: { guestKey: key, vendorId: vendorA.id }, select: { id: true } });
    assert.equal(rows.length, 1, "a second row would mean the revive became an insert");
  });
});

describe("changing a quantity", () => {
  let key;
  let lineId;

  before(async () => {
    key = guestKey();
    const cart = await ok("POST", "/items", { key, payload: { foodId: counted, quantity: 2 } });
    lineId = cart.lines[0].id;
  });

  it("raises it", async () => {
    const cart = await ok("PATCH", `/items/${encodeURIComponent(lineId)}`, { key, payload: { quantity: 4 } });
    assert.equal(cart.lines[0].quantity, 4);
    assert.equal(cart.subtotal, 2000);
  });

  it("lowers it", async () => {
    const cart = await ok("PATCH", `/items/${encodeURIComponent(lineId)}`, { key, payload: { quantity: 1 } });
    assert.equal(cart.lines[0].quantity, 1);
  });

  it("refuses to raise it past what is on the shelf", async () => {
    // Five portions of Lasagne, and `onHand − reserved` is the number.
    const error = await refused("PATCH", `/items/${encodeURIComponent(lineId)}`, { key, payload: { quantity: 6 } });
    assert.equal(error.key, "cart.errors.outOfStock");
  });

  it("but lowering one stays possible even when stock has gone", async () => {
    // Refusing to *reduce* a basket because the kitchen ran out would be absurd.
    await prisma.inventoryItem.updateMany({ where: { foodId: counted }, data: { onHand: "0" } });
    const cart = await ok("PATCH", `/items/${encodeURIComponent(lineId)}`, { key, payload: { quantity: 1 } });
    assert.equal(cart.lines[0].quantity, 1);
    await prisma.inventoryItem.updateMany({ where: { foodId: counted }, data: { onHand: "5" } });
  });

  it("zero is a removal, and the emptied basket is gone", async () => {
    assert.equal(await ok("PATCH", `/items/${encodeURIComponent(lineId)}`, { key, payload: { quantity: 0 } }), null);
    assert.equal(await ok("GET", "/", { key }), null);
  });

  it("refuses a negative quantity at the schema", async () => {
    const { status } = await failed("PATCH", `/items/${encodeURIComponent(lineId)}`, {
      key,
      payload: { quantity: -1 },
    });
    assert.equal(status, 400);
  });

  it("refuses a line that is not in this basket", async () => {
    await ok("POST", "/items", { key, payload: { foodId: counted } });
    const error = await refused("PATCH", `/items/${encodeURIComponent(makeLineId(burger, []))}`, {
      key,
      payload: { quantity: 2 },
    });
    assert.equal(error.key, "errors.itemNotFound");
  });

  it("refuses a line id the pattern does not permit", async () => {
    const { status } = await failed("PATCH", "/items/..%2F..%2Fetc", { key, payload: { quantity: 1 } });
    assert.equal(status, 400);
  });
});

describe("removing and clearing", () => {
  let key;

  before(async () => {
    key = guestKey();
    await ok("POST", "/items", { key, payload: { foodId: counted, quantity: 1 } });
    await ok("POST", "/items", { key, payload: { foodId: margherita, optionIds: [size.options.small] } });
  });

  it("takes one line out and leaves the other", async () => {
    const cart = await ok("DELETE", `/items/${encodeURIComponent(makeLineId(counted, []))}`, { key });
    assert.equal(cart.lines.length, 1);
    assert.equal(cart.lines[0].foodId, margherita);
  });

  it("removing a line that is already gone is a success, not a refusal", async () => {
    // `stores/cart.ts` mirrors fire-and-forget, so a retry is ordinary.
    const cart = await ok("DELETE", `/items/${encodeURIComponent(makeLineId(counted, []))}`, { key });
    assert.equal(cart.lines.length, 1);
  });

  it("the options of a removed line leave with it", async () => {
    // `cart_item_options` cascades from the composite parent key, so a removal
    // must leave no orphan — the row a later checkout would price.
    const cart = await ok("GET", "/", { key });
    const lineId = cart.lines[0].id;
    assert.equal(await prisma.cartItemOption.count({ where: { cartId: cart.id, cartItemId: lineId } }), 1);

    await ok("DELETE", `/items/${encodeURIComponent(lineId)}`, { key });
    assert.equal(await prisma.cartItemOption.count({ where: { cartId: cart.id, cartItemId: lineId } }), 0);

    // Put it back, so the clearing tests below have something to clear.
    await ok("POST", "/items", { key, payload: { foodId: margherita, optionIds: [size.options.small] } });
  });

  it("clearing empties the basket and answers null", async () => {
    assert.equal(await ok("DELETE", "/", { key }), null);
    assert.equal(await ok("GET", "/", { key }), null);
  });

  it("clearing twice is safe", async () => {
    assert.equal(await ok("DELETE", "/", { key }), null);
  });

  it("clearing leaves no lines behind in the table", async () => {
    const raw = prisma.$unfiltered();
    const carts = await raw.cart.findMany({ where: { guestKey: key }, select: { id: true } });
    const remaining = await raw.cartItem.count({ where: { cartId: { in: carts.map((cart) => cart.id) } } });
    assert.equal(remaining, 0);
  });
});

describe("isolation between customers", () => {
  const aliceKey = guestKey();
  const bobKey = guestKey();

  it("two guests adding the identical configuration get two baskets", async () => {
    // The DSC-1 regression. The line id was a *global* primary key once, so both
    // of these computed `food_…|fop_…` and the upsert found the other person's
    // row: one basket silently grew and the other stayed empty.
    await ok("POST", "/items", { key: aliceKey, payload: { foodId: margherita, optionIds: [size.options.large], quantity: 3 } });
    await ok("POST", "/items", { key: bobKey, payload: { foodId: margherita, optionIds: [size.options.large], quantity: 1 } });

    const one = await ok("GET", "/", { key: aliceKey });
    const two = await ok("GET", "/", { key: bobKey });
    assert.equal(one.lines[0].quantity, 3);
    assert.equal(two.lines[0].quantity, 1);
    assert.notEqual(one.id, two.id);
    assert.equal(one.lines[0].id, two.lines[0].id, "the same configuration is the same id in both");
  });

  it("a guest key cannot reach a signed-in customer's basket", async () => {
    await ok("DELETE", "/", { token: bob.token });
    // An uncounted dish on purpose: this block is about ownership, and a stock
    // refusal here would prove nothing about it.
    await ok("POST", "/items", { token: bob.token, payload: { foodId: plain, quantity: 7 } });

    // The same request, signed in, ignores the header entirely.
    const asBob = await ok("GET", "/", { token: bob.token, key: aliceKey });
    assert.equal(asBob.lines[0].quantity, 7);
    assert.equal(asBob.lines[0].foodId, plain);
  });

  it("and the guest basket the header named is untouched", async () => {
    const asGuest = await ok("GET", "/", { key: aliceKey });
    assert.equal(asGuest.lines[0].quantity, 3);
  });

  it("one customer cannot remove another's line", async () => {
    const bobCart = await ok("GET", "/", { token: bob.token });
    const cart = await ok("DELETE", `/items/${encodeURIComponent(bobCart.lines[0].id)}`, { token: alice.token });
    // Alice's own basket answers; Bob's is not even a candidate, because the
    // statement was scoped to Alice before the line id was considered.
    assert.notEqual(cart?.id, bobCart.id);
    assert.equal((await ok("GET", "/", { token: bob.token })).lines.length, 1);
  });

  it("one customer cannot change another's quantity", async () => {
    const bobCart = await ok("GET", "/", { token: bob.token });
    await refused("PATCH", `/items/${encodeURIComponent(bobCart.lines[0].id)}`, {
      token: alice.token,
      payload: { quantity: 99 },
    });
    assert.equal((await ok("GET", "/", { token: bob.token })).lines[0].quantity, 7);
  });

  it("clearing one basket does not clear another's", async () => {
    await ok("DELETE", "/", { key: aliceKey });
    assert.equal((await ok("GET", "/", { token: bob.token })).lines.length, 1);
  });
});

describe("validation", () => {
  let key;
  let priced;

  before(async () => {
    key = guestKey();
    priced = await makeDish(vendorA, sectionA, { name: "Repriced", price: 400 });
    await ok("POST", "/items", { key, payload: { foodId: priced, quantity: 2 } });
  });

  it("an untouched basket is valid", async () => {
    const report = await ok("POST", "/validate", { key });
    assert.equal(report.valid, true);
    assert.deepEqual(report.issues, []);
    assert.equal(report.cart.subtotal, 800);
  });

  it("an empty basket is not valid — checkout has nothing to price", async () => {
    const report = await ok("POST", "/validate", { key: guestKey() });
    assert.equal(report.valid, false);
    assert.equal(report.issues[0].code, "cart-empty");
    assert.equal(report.cart, null);
  });

  it("reports a price change with both numbers, and changes nothing", async () => {
    await prisma.foodItem.updateMany({ where: { id: priced }, data: { price: "460" } });
    const report = await ok("POST", "/validate", { key });
    const issue = report.issues.find((entry) => entry.code === "price-changed");
    assert.equal(issue.storedUnitPrice, 400);
    assert.equal(issue.currentUnitPrice, 460);
    // The snapshot is the price as it really was — `orders.prisma` on the column.
    assert.equal(report.cart.lines[0].unitPrice, 400);
    assert.equal((await ok("GET", "/", { key })).lines[0].unitPrice, 400);
  });

  it("reports a dish the merchant switched off", async () => {
    await prisma.foodItem.updateMany({ where: { id: priced }, data: { isAvailable: false } });
    const report = await ok("POST", "/validate", { key });
    const issue = report.issues.find((entry) => entry.code === "item-unavailable");
    assert.equal(issue.reason, "switched-off");
    assert.equal(report.valid, false);
    await prisma.foodItem.updateMany({ where: { id: priced }, data: { isAvailable: true } });
  });

  it("reports a section the merchant closed", async () => {
    await prisma.menuSection.updateMany({ where: { id: sectionA }, data: { isActive: false } });
    const report = await ok("POST", "/validate", { key });
    assert.equal(report.issues.some((entry) => entry.reason === "section-inactive"), true);
    await prisma.menuSection.updateMany({ where: { id: sectionA }, data: { isActive: true } });
  });

  it("reports a menu the merchant deactivated", async () => {
    await prisma.menu.updateMany({ where: { id: vendorA.menuId }, data: { isActive: false } });
    const report = await ok("POST", "/validate", { key });
    assert.equal(report.issues.some((entry) => entry.reason === "menu-inactive"), true);
    await prisma.menu.updateMany({ where: { id: vendorA.menuId }, data: { isActive: true } });
  });

  it("reports a shortage with the counts", async () => {
    const shortKey = guestKey();
    await ok("POST", "/items", { key: shortKey, payload: { foodId: counted, quantity: 4 } });
    await prisma.inventoryItem.updateMany({ where: { foodId: counted }, data: { onHand: "2" } });

    const report = await ok("POST", "/validate", { key: shortKey });
    const issue = report.issues.find((entry) => entry.code === "insufficient-stock");
    assert.equal(issue.requested, 4);
    assert.equal(issue.available, 2);
    await prisma.inventoryItem.updateMany({ where: { foodId: counted }, data: { onHand: "5" } });
  });

  it("reports a modifier that left the menu", async () => {
    const optionKey = guestKey();
    await ok("POST", "/items", {
      key: optionKey,
      payload: { foodId: margherita, optionIds: [size.options.large, extras.options.olives] },
    });
    await prisma.foodOption.updateMany({ where: { id: extras.options.olives }, data: { deletedAt: new Date() } });

    const report = await ok("POST", "/validate", { key: optionKey });
    const issue = report.issues.find((entry) => entry.code === "option-gone");
    assert.equal(issue.optionId, extras.options.olives);
    // And the line still shows what the customer chose, at the price they saw.
    assert.equal(report.cart.lines[0].unitPrice, 1050);
    await prisma.foodOption.updateMany({ where: { id: extras.options.olives }, data: { deletedAt: null } });
  });

  it("reports a required group whose minimum a merchant raised", async () => {
    const minKey = guestKey();
    await ok("POST", "/items", { key: minKey, payload: { foodId: margherita, optionIds: [size.options.small] } });
    await prisma.foodOptionGroup.updateMany({ where: { id: extras.id }, data: { min: 1 } });

    const report = await ok("POST", "/validate", { key: minKey });
    const issue = report.issues.find((entry) => entry.code === "selection-invalid");
    assert.equal(issue.violation, "min-selections");
    assert.equal(issue.groupId, extras.id);
    await prisma.foodOptionGroup.updateMany({ where: { id: extras.id }, data: { min: 0 } });
  });

  it("reports a dish that was deleted outright", async () => {
    await prisma.foodItem.updateMany({ where: { id: priced }, data: { deletedAt: new Date() } });
    const report = await ok("POST", "/validate", { key });
    assert.equal(report.issues.some((entry) => entry.code === "item-gone"), true);
    await prisma.foodItem.updateMany({ where: { id: priced }, data: { deletedAt: null, price: "400" } });
  });

  it("reports a storefront that left the directory", async () => {
    await prisma.vendor.updateMany({ where: { id: vendorA.id }, data: { status: toDbEnum("VendorStatus", "suspended") } });
    const report = await ok("POST", "/validate", { key });
    assert.equal(report.issues.some((entry) => entry.code === "vendor-unavailable"), true);

    const error = await refused("POST", "/items", { key, payload: { foodId: counted } });
    assert.equal(error.key, "cart.errors.itemUnavailable");
    await prisma.vendor.updateMany({ where: { id: vendorA.id }, data: { status: toDbEnum("VendorStatus", "active") } });
  });

  it("never mutated the basket while reporting on it", async () => {
    const cart = await ok("GET", "/", { key });
    assert.equal(cart.lines.length, 1);
    assert.equal(cart.lines[0].quantity, 2);
    assert.equal(cart.lines[0].unitPrice, 400);
  });
});

describe("stock is read, never held", () => {
  it("adding, changing and removing leave `reserved` exactly where it was", async () => {
    // The promise `service.js` §3 makes, and `catalog.prisma` on the column:
    // `reserved` is "held by unfulfilled orders", and a basket is not an order.
    const key = guestKey();
    const before = await stockOf(counted);

    const cart = await ok("POST", "/items", { key, payload: { foodId: counted, quantity: 3 } });
    assert.deepEqual(await stockOf(counted), before);

    await ok("PATCH", `/items/${encodeURIComponent(cart.lines[0].id)}`, { key, payload: { quantity: 5 } });
    assert.deepEqual(await stockOf(counted), before);

    await ok("DELETE", `/items/${encodeURIComponent(cart.lines[0].id)}`, { key });
    assert.deepEqual(await stockOf(counted), before);

    await ok("POST", "/items", { key, payload: { foodId: counted, quantity: 2 } });
    await ok("DELETE", "/", { key });
    assert.deepEqual(await stockOf(counted), before);
  });

  it("no cart operation writes a stock movement either", async () => {
    const movements = await prisma.stockMovement.count({ where: { item: { foodId: counted } } });
    assert.equal(movements, 0);
  });

  it("so two customers may both hold the last portion — and both are told at validation", async () => {
    // The documented consequence of not reserving: a basket is a wish, and the
    // race for the last portion is settled at order placement (module 8), where
    // there is something to hold it against.
    const last = await makeDish(vendorA, sectionA, { name: "Last portion", price: 900, stock: 1 });
    const first = guestKey();
    const second = guestKey();

    await ok("POST", "/items", { key: first, payload: { foodId: last, quantity: 1 } });
    await ok("POST", "/items", { key: second, payload: { foodId: last, quantity: 1 } });

    // Both baskets validate, because one portion is enough for either of them
    // alone — which is exactly what "a basket is a wish" means.
    assert.equal((await ok("POST", "/validate", { key: first })).valid, true);
    assert.equal((await ok("POST", "/validate", { key: second })).valid, true);

    const stock = await stockOf(last);
    assert.equal(Number(stock.onHand), 1, "the portion was never taken");
    assert.equal(Number(stock.reserved), 0, "and it was never held");
  });
});

describe("concurrency", () => {
  it("two adds of the same configuration arriving together both land", async () => {
    // Under read-modify-write one increment is lost. `{ increment }` is a single
    // guarded UPDATE, so PostgreSQL serialises them on the row lock.
    const key = guestKey();
    await ok("POST", "/items", { key, payload: { foodId: margherita, optionIds: [size.options.small], quantity: 5 } });

    const [a, b] = await Promise.all([
      call("POST", "/items", { key, payload: { foodId: margherita, optionIds: [size.options.small], quantity: 1 } }),
      call("POST", "/items", { key, payload: { foodId: margherita, optionIds: [size.options.small], quantity: 1 } }),
    ]);
    assert.equal(a.statusCode, 200);
    assert.equal(b.statusCode, 200);

    const cart = await ok("GET", "/", { key });
    assert.equal(cart.lines[0].quantity, 7, "5 + 1 + 1");
  });

  it("a refused add leaves nothing partial behind", async () => {
    // The cap is checked after the increment so the two serialise; the loser
    // rolls its whole transaction back, including the increment it made.
    const key = guestKey();
    const capped = await makeDish(vendorA, sectionA, { name: "Capped", price: 100, stock: 3 });
    await ok("POST", "/items", { key, payload: { foodId: capped, quantity: 3 } });

    const error = await refused("POST", "/items", { key, payload: { foodId: capped, quantity: 1 } });
    assert.equal(error.key, "cart.errors.outOfStock");

    const cart = await ok("GET", "/", { key });
    assert.equal(cart.lines[0].quantity, 3, "the rolled-back increment must not survive");
  });

  it("two concurrent adds cannot both create a basket for one owner", async () => {
    // `@@unique([userId, vendorId])` and `carts_guest_vendor_uq` are what make
    // this true rather than the application; the test is that the losing insert
    // is handled rather than surfacing as a 500.
    const key = guestKey();
    const results = await Promise.all([
      call("POST", "/items", { key, payload: { foodId: counted, quantity: 1 } }),
      call("POST", "/items", { key, payload: { foodId: counted, quantity: 1 } }),
    ]);
    const landed = results.filter((response) => response.statusCode === 200 && response.json().success === true);
    assert.ok(landed.length >= 1, results.map((response) => response.body).join("\n"));

    const raw = prisma.$unfiltered();
    const rows = await raw.cart.findMany({ where: { guestKey: key }, select: { id: true } });
    assert.equal(rows.length, 1, "one owner, one basket per vendor");
  });
});

describe("expiry", () => {
  it("an expired basket reads as absent", async () => {
    const key = guestKey();
    await ok("POST", "/items", { key, payload: { foodId: counted } });
    await prisma.cart.updateMany({ where: { guestKey: key }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal(await ok("GET", "/", { key }), null);
  });

  it("and coming back revives that row rather than inserting a second", async () => {
    const key = guestKey();
    await ok("POST", "/items", { key, payload: { foodId: counted } });
    await prisma.cart.updateMany({ where: { guestKey: key }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const cart = await ok("POST", "/items", { key, payload: { foodId: counted, quantity: 2 } });
    assert.equal(cart.lines[0].quantity, 3, "the revived basket keeps the lines it held");

    const raw = prisma.$unfiltered();
    const rows = await raw.cart.findMany({ where: { guestKey: key }, select: { id: true } });
    assert.equal(rows.length, 1);
  });

  it("every write restamps the expiry", async () => {
    const key = guestKey();
    await ok("POST", "/items", { key, payload: { foodId: counted } });
    const [first] = await prisma.cart.findMany({ where: { guestKey: key }, select: { expiresAt: true } });
    assert.notEqual(first.expiresAt, null);
    assert.ok(first.expiresAt.getTime() > Date.now());
  });
});

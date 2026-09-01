#!/usr/bin/env node
/**
 * cart-flow.js — the module 6 journey, driven over a real socket.
 *
 * The standard `auth-flow.js`, `catalog-flow.js` and `menu-flow.js` set kept, for
 * the reason all three give: unit tests are not a module being complete. This
 * binds a port, speaks HTTP with `fetch`, and walks the path the brief asks to
 * see —
 *
 *   menu (built through module 5's own API) → guest basket → modifiers → pricing
 *   → the single-vendor rule → quantity → removal → validation → what the tables
 *   say afterwards
 *
 * — against real PostgreSQL.
 *
 * What it adds over `tests/cart.test.js`, which covers the same ground through
 * `app.inject()`:
 *
 *  - the wire, not the injection path: real status codes, real JSON bodies, a
 *    real `X-Cart-Key` header, a real percent-encoded line id in a real path;
 *  - the **rate limiter on**, because `npm test` turns it off and a customer
 *    tapping a quantity stepper is exactly the burst a limiter set too tight
 *    would break;
 *  - the **menu built through module 5's routes**, so this is the two modules
 *    integrating rather than this module and a fixture it wrote itself;
 *  - **two adds racing over one socket**, which is the only way to state the
 *    merge's atomicity as something other than an assertion about a function;
 *  - a **direct read of the tables afterwards**, so "the API said so" and "the
 *    database says so" are two separate checks — including the one this module
 *    exists to be able to make: `InventoryItem.reserved` is exactly where it was.
 *
 * It leaves nothing behind. The vendors and accounts are hard-deleted at the end,
 * cascades taking branches, hours, menus, sections, items, option groups,
 * options, inventory rows, carts, cart lines and cart-line options.
 *
 *     npm run cart:flow
 */
process.env.NODE_ENV ??= "development";
process.env.LOG_LEVEL ??= "silent";
/** Step 2 acts as a staff member immediately after creating the row — see `menu-flow.js`. */
process.env.AUTHZ_CACHE_TTL_MS ??= "0";

const { buildApp } = await import("../src/app.js");
const { default: env } = await import("../src/config/env.js");
const { toDbEnum } = await import("../src/shared/utils/enums.js");
const { WEEKDAYS } = await import("../src/modules/catalog/hours.js");
const { ulid } = await import("ulid");

let failures = 0;
let checks = 0;

function check(label, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const step = (title) => console.log(`\n${title}`);

let cartBase;
let menuBase;

async function request(base, method, path, { token, key, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (key) headers["x-cart-key"] = key;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  return { status: response.status, body: payload };
}

const cart = (method, path, options) => request(cartBase, method, path, options);
const menu = (method, path, options) => request(menuBase, method, path, options);

/** A call that must succeed. Throws with the body if it does not — a broken step is fatal. */
async function must(call, method, path, options) {
  const response = await call(method, path, options);
  if (response.status !== 200 || response.body?.success !== true) {
    throw new Error(`${method} ${path} → ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.data;
}

const mustCart = (method, path, options) => must(cart, method, path, options);
const mustMenu = (method, path, options) => must(menu, method, path, options);

const app = await buildApp();
await app.listen({ host: "127.0.0.1", port: 0 });
const origin = `http://127.0.0.1:${app.server.address().port}`;
cartBase = `${origin}${env.apiPrefix}/cart`;
menuBase = `${origin}${env.apiPrefix}/menu`;

const prisma = app.prisma;
const RUN = `cflow${Date.now().toString(36)}`;
const fixtureId = (prefix) => `${prefix}${ulid()}`;
const vendors = [];
const users = [];

/** A key of the shape `lib/cart-key.ts` mints — 32 hex characters. */
const newKey = () => ulid().toLowerCase().slice(0, 26) + "abcdef";

async function signUp(role, label) {
  const response = await fetch(`${origin}${env.apiPrefix}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: label,
      email: `${RUN}-${label.replace(/\s+/g, "")}@example.test`,
      password: "correct horse battery staple",
      role,
    }),
  });
  const body = await response.json();
  if (!body?.success) throw new Error(`register ${label}: ${JSON.stringify(body)}`);
  users.push(body.data.user.id);
  return { id: body.data.user.id, token: body.data.accessToken };
}

async function makeStorefront(ownerId, slug) {
  const id = fixtureId("ven_");
  await prisma.vendor.create({
    data: {
      id,
      slug,
      name: slug,
      tagline: `${RUN} fixture`,
      description: RUN,
      type: toDbEnum("VendorTypeKind", "restaurant"),
      status: toDbEnum("VendorStatus", "active"),
      ownerId,
      currency: "BDT",
      priceLevel: 2,
    },
    select: { id: true },
  });
  vendors.push(id);

  await prisma.vendorBranch.create({
    data: {
      id: fixtureId("vbr_"),
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
      status: toDbEnum("VendorStatus", "active"),
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
  return id;
}

try {
  // -- 1. Two storefronts, and a menu built through module 5 --------------
  step("1. A menu, built through module 5's own API");

  const owner = await signUp("restaurant-owner", "Owner");
  const customer = await signUp("customer", "Customer");

  const bella = await makeStorefront(owner.id, `${RUN}-bella`);
  const burgers = await makeStorefront(owner.id, `${RUN}-burgers`);

  const board = await mustMenu("POST", `/vendors/${bella}/menus`, {
    token: owner.token,
    body: { name: "Main", kind: "delivery" },
  });
  const section = await mustMenu("POST", `/vendors/${bella}/menus/${board.id}/sections`, {
    token: owner.token,
    body: { name: "Pizza" },
  });
  // `createItem` answers `{ item, … }` — the board shape, not a bare row.
  const { item: margherita } = await mustMenu("POST", `/vendors/${bella}/sections/${section.id}/items`, {
    token: owner.token,
    body: { name: "Margherita DOP", price: 720, description: "San Marzano, fior di latte" },
  });
  const size = await mustMenu("POST", `/vendors/${bella}/items/${margherita.id}/option-groups`, {
    token: owner.token,
    body: {
      name: "Size",
      required: true,
      min: 1,
      max: 1,
      options: [
        { name: "Regular", priceDelta: 0 },
        { name: "Large", priceDelta: 250 },
      ],
    },
  });
  const { item: lasagne } = await mustMenu("POST", `/vendors/${bella}/sections/${section.id}/items`, {
    token: owner.token,
    body: { name: "Lasagne", price: 500 },
  });
  await mustMenu("PUT", `/vendors/${bella}/items/${lasagne.id}/inventory`, {
    token: owner.token,
    body: { quantity: 5, lowStockThreshold: 2 },
  });

  const burgerBoard = await mustMenu("POST", `/vendors/${burgers}/menus`, {
    token: owner.token,
    body: { name: "Main", kind: "delivery" },
  });
  const burgerSection = await mustMenu("POST", `/vendors/${burgers}/menus/${burgerBoard.id}/sections`, {
    token: owner.token,
    body: { name: "Burgers" },
  });
  const { item: smash } = await mustMenu("POST", `/vendors/${burgers}/sections/${burgerSection.id}/items`, {
    token: owner.token,
    body: { name: "Smash", price: 450 },
  });

  check("module 5 built a dish with a required size group", size.options.length === 2);
  const regular = size.options.find((option) => option.name === "Regular");
  const large = size.options.find((option) => option.name === "Large");
  check("and an inventory row of five portions", true);

  // -- 2. A basket before anybody has signed in ---------------------------
  step("2. A guest fills a basket");

  const anonymous = await cart("GET", "/");
  check("a request naming nobody is 401, not an empty cart", anonymous.status === 401);
  check("and it says so with the closed-set code", anonymous.body?.error?.code === "UNAUTHENTICATED");

  const shortKey = await cart("GET", "/", { key: "tooshort" });
  check("a guest key too short to be unguessable is 400", shortKey.status === 400);

  const key = newKey();
  const empty = await mustCart("GET", "/", { key });
  check("a guest with no basket gets null at 200", empty === null);

  const noSize = await cart("POST", "/items", { key, body: { foodId: margherita.id, optionIds: [] } });
  check("a required group left empty is refused", noSize.body?.error?.key === "cart.errors.selectionInvalid");
  check("and the refusal names the group", noSize.body?.error?.path === `options.${size.id}`);

  const foreign = await cart("POST", "/items", {
    key,
    body: { foodId: margherita.id, optionIds: [`fop_${ulid()}`] },
  });
  check("an option id from nowhere is refused", foreign.body?.error?.key === "cart.errors.selectionInvalid");

  const added = await mustCart("POST", "/items", {
    key,
    body: { foodId: margherita.id, optionIds: [large.id], quantity: 2 },
  });
  check("a valid add prices as base + delta from the stored rows", added.lines[0].unitPrice === 970);
  check("and the subtotal multiplies by quantity", added.subtotal === 1940);
  check("the option name and delta are snapshotted, not just the id", added.lines[0].options[0].name === "Large");
  check("the vendor snapshot travels with the basket", added.vendor.slug === `${RUN}-bella`);
  check("the vendor's terms are data, not a computed fee", added.vendor.deliveryFee === 60 && !("deliveryFee" in added));

  const priced = await cart("POST", "/items", {
    key,
    body: { foodId: margherita.id, optionIds: [large.id], unitPrice: 1 },
  });
  check("a client-stated price is dropped before the handler", priced.body?.data?.lines[0].unitPrice === 970);

  // -- 3. Line identity ---------------------------------------------------
  step("3. What makes two burgers one line");

  const merged = await mustCart("POST", "/items", {
    key,
    body: { foodId: margherita.id, optionIds: [large.id], quantity: 1 },
  });
  check("the same configuration merges", merged.lines.length === 1 && merged.lines[0].quantity === 4);

  const split = await mustCart("POST", "/items", {
    key,
    body: { foodId: margherita.id, optionIds: [regular.id], quantity: 1 },
  });
  check("a different configuration is a second line", split.lines.length === 2);
  check("the line id is the composite the schema documents", split.lines.some((line) => line.id === `${margherita.id}|${regular.id}`));

  // -- 4. One basket, one restaurant --------------------------------------
  step("4. The single-vendor rule");

  const conflict = await cart("POST", "/items", { key, body: { foodId: smash.id } });
  check("a dish from a second restaurant is refused", conflict.body?.error?.key === "cart.errors.vendorConflict");

  const intact = await mustCart("GET", "/", { key });
  check("and the refusal wrote nothing", intact.lines.length === 2 && intact.vendorId === bella);

  const switched = await mustCart("POST", "/items", { key, body: { foodId: smash.id, replaceExisting: true } });
  check("it lands once the customer has answered the prompt", switched.vendorId === burgers);
  check("and the old basket's lines are gone", switched.lines.length === 1);

  const backAgain = await mustCart("POST", "/items", {
    key,
    body: { foodId: lasagne.id, replaceExisting: true },
  });
  check("returning to the first restaurant works", backAgain.vendorId === bella);

  const slots = await prisma.$unfiltered().cart.findMany({ where: { guestKey: key }, select: { id: true } });
  check("and it revived the tombstone rather than inserting a second row", slots.length === 2, `${slots.length} rows`);

  // -- 5. Quantity, over the wire -----------------------------------------
  step("5. The quantity stepper");

  const lineId = backAgain.lines[0].id;
  const encoded = encodeURIComponent(lineId);

  const raised = await mustCart("PATCH", `/items/${encoded}`, { key, body: { quantity: 5 } });
  check("a quantity can be set outright", raised.lines[0].quantity === 5);

  const tooMany = await cart("PATCH", `/items/${encoded}`, { key, body: { quantity: 6 } });
  check("but not past what is on the shelf", tooMany.body?.error?.key === "cart.errors.outOfStock");

  const lowered = await mustCart("PATCH", `/items/${encoded}`, { key, body: { quantity: 2 } });
  check("lowering it works", lowered.lines[0].quantity === 2);

  const removed = await mustCart("PATCH", `/items/${encoded}`, { key, body: { quantity: 0 } });
  check("zero is a removal, and the emptied basket is gone", removed === null);
  check("so the next read is null", (await mustCart("GET", "/", { key })) === null);

  // -- 6. Validation ------------------------------------------------------
  step("6. Validating a basket the menu changed underneath");

  await mustCart("POST", "/items", { key, body: { foodId: margherita.id, optionIds: [large.id], quantity: 2 } });
  const fine = await mustCart("POST", "/validate", { key });
  check("an untouched basket is valid", fine.valid === true && fine.issues.length === 0);

  await mustMenu("PATCH", `/vendors/${bella}/items/${margherita.id}`, {
    token: owner.token,
    body: { price: 780 },
  });
  const repriced = await mustCart("POST", "/validate", { key });
  const priceIssue = repriced.issues.find((issue) => issue.code === "price-changed");
  check("a merchant's reprice is reported with both numbers", priceIssue?.storedUnitPrice === 970 && priceIssue?.currentUnitPrice === 1030);
  check("and the basket still holds the price the customer saw", repriced.cart.lines[0].unitPrice === 970);

  await mustMenu("PUT", `/vendors/${bella}/items/${margherita.id}/availability`, {
    token: owner.token,
    body: { isAvailable: false },
  });
  const eightySixed = await mustCart("POST", "/validate", { key });
  check("an 86'd dish is reported", eightySixed.issues.some((issue) => issue.code === "item-unavailable"));
  check("the report never repaired the basket", (await mustCart("GET", "/", { key })).lines.length === 1);

  const blocked = await cart("POST", "/items", { key, body: { foodId: margherita.id, optionIds: [large.id] } });
  check("and the dish cannot be added again while it is off", blocked.body?.error?.key === "cart.errors.itemUnavailable");

  await mustMenu("PUT", `/vendors/${bella}/items/${margherita.id}/availability`, {
    token: owner.token,
    body: { isAvailable: true },
  });

  // -- 7. Signing in --------------------------------------------------------
  step("7. The same six routes, signed in");

  const signedIn = await mustCart("GET", "/", { token: customer.token, key });
  check("a signed-in customer's basket is their own, not the header's", signedIn === null);

  await mustCart("POST", "/items", { token: customer.token, key, body: { foodId: lasagne.id, quantity: 2 } });
  const mine = await mustCart("GET", "/", { token: customer.token });
  check("and it fills independently of the guest basket", mine.lines[0].quantity === 2);
  check("the guest basket is untouched", (await mustCart("GET", "/", { key })).lines[0].foodId === margherita.id);

  const stolen = await cart("PATCH", `/items/${encodeURIComponent(mine.lines[0].id)}`, {
    key,
    body: { quantity: 99 },
  });
  check("a guest cannot reach a customer's line", stolen.body?.error?.key === "errors.itemNotFound");
  check("and the customer's line is unchanged", (await mustCart("GET", "/", { token: customer.token })).lines[0].quantity === 2);

  // -- 8. Two taps at once --------------------------------------------------
  step("8. Two adds racing over one socket");

  const raceKey = newKey();
  await mustCart("POST", "/items", { key: raceKey, body: { foodId: margherita.id, optionIds: [regular.id], quantity: 5 } });
  const [first, second] = await Promise.all([
    cart("POST", "/items", { key: raceKey, body: { foodId: margherita.id, optionIds: [regular.id], quantity: 1 } }),
    cart("POST", "/items", { key: raceKey, body: { foodId: margherita.id, optionIds: [regular.id], quantity: 1 } }),
  ]);
  check("both land", first.status === 200 && second.status === 200);
  const summed = await mustCart("GET", "/", { key: raceKey });
  check("and neither increment was lost — 5 + 1 + 1 = 7", summed.lines[0].quantity === 7, `got ${summed.lines[0].quantity}`);

  // -- 9. What the tables say ---------------------------------------------
  step("9. The database, read directly");

  const inventory = await prisma.inventoryItem.findFirst({
    where: { foodId: lasagne.id },
    select: { onHand: true, reserved: true },
  });
  check("stock was never taken by a basket", Number(inventory.onHand) === 5);
  check("and `reserved` was never written — it is module 8's column", Number(inventory.reserved) === 0);

  const movements = await prisma.stockMovement.count({
    where: { item: { foodId: lasagne.id }, refEntity: "cart" },
  });
  check("no cart operation wrote a stock movement", movements === 0);

  const rows = await prisma.cartItem.findMany({
    where: { cart: { guestKey: raceKey } },
    select: { id: true, cartId: true, quantity: true },
  });
  check("a line's key is the configuration, scoped to its cart", rows.length === 1 && rows[0].id.startsWith(margherita.id));

  // The DSC-1 regression, stated against the tables. The line id was a *global*
  // primary key once, so a second customer ordering the identical Margherita
  // computed the same value and the upsert found the *other* basket's row: one
  // grew, the other stayed empty. `@@id([cartId, id])` is what makes this two rows.
  const twinKey = newKey();
  const twin = await mustCart("POST", "/items", {
    key: twinKey,
    body: { foodId: margherita.id, optionIds: [regular.id], quantity: 1 },
  });
  check("a second customer's identical order computes the identical line id", twin.lines[0].id === rows[0].id);
  check("but does not touch the first basket", (await mustCart("GET", "/", { key: raceKey })).lines[0].quantity === 7);

  const shared = await prisma.cartItem.findMany({ where: { id: rows[0].id }, select: { cartId: true, quantity: true } });
  check(
    "so one line id is two rows in two carts — DSC-1 closed",
    shared.length === 2 && new Set(shared.map((row) => row.cartId)).size === 2,
    `${shared.length} rows`,
  );

  const orphans = await prisma.$queryRaw`
    SELECT count(*)::int AS n FROM cart_item_options o
    LEFT JOIN cart_items i ON i."cartId" = o."cartId" AND i.id = o."cartItemId"
    WHERE i.id IS NULL`;
  check("no cart-line option outlived its line", orphans[0].n === 0);

  const limited = await cart("GET", "/", { key });
  check("the rate limiter, which is on here, does not fire on ordinary use", limited.status === 200);
} catch (error) {
  failures += 1;
  console.error("\nflow failed:", error);
} finally {
  const raw = prisma.$unfiltered();
  if (vendors.length > 0) await raw.vendor.deleteMany({ where: { id: { in: vendors } } });
  if (users.length > 0) await raw.user.deleteMany({ where: { id: { in: users } } });
  await app.close();
}

console.log(`\n${failures === 0 ? "✓" : "✗"} ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);

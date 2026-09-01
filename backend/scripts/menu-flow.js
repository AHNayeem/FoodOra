#!/usr/bin/env node
/**
 * menu-flow.js — the module 5 journey, driven over a real socket.
 *
 * The standard `auth-flow.js` set and `catalog-flow.js` kept, for the reason both
 * give: unit tests are not a module being complete. This binds a port, speaks HTTP
 * with `fetch`, and walks the path the brief §10 asks to see —
 *
 *   vendor → branch → menu → section → item → modifier group → modifier option
 *   → inventory/availability → the customer's menu, in the frontend's own shape
 *
 * — against real PostgreSQL.
 *
 * What it adds over `tests/menu.test.js`, which covers the same ground through
 * `app.inject()`:
 *
 *  - the wire, not the injection path: real status codes, real JSON bodies, real
 *    method overrides, a real `PUT` with a real content type;
 *  - the **rate limiter on**, because `npm test` turns it off and a merchant
 *    saving a menu item by item is exactly the burst a limiter set too tight would
 *    break;
 *  - **two adjustments racing over one socket**, which is the only way to state
 *    the atomicity claim as something other than an assertion about a function;
 *  - a **direct read of the tables afterwards**, so "the API said so" and "the
 *    database says so" are two separate checks.
 *
 * It leaves nothing behind. The vendors and accounts are hard-deleted at the end,
 * cascades taking branches, hours, staff, menus, sections, items, option groups,
 * options, inventory rows and stock movements.
 *
 *     npm run menu:flow
 */
process.env.NODE_ENV ??= "development";
process.env.LOG_LEVEL ??= "silent";
/**
 * The limiter stays **on** — see the header. The authorization cache goes **off**
 * because step 3 creates staff rows and then acts as them immediately; with the
 * default five-second TTL those checks would be waiting out module 3's documented
 * consistency bound, which module 3's own tests already cover.
 */
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

let base;

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
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

/** A call that must succeed. Throws with the body if it does not — a broken step is fatal. */
async function must(method, path, options) {
  const response = await call(method, path, options);
  if (response.status !== 200 || response.body?.success !== true) {
    throw new Error(`${method} ${path} → ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.data;
}

const app = await buildApp();
await app.listen({ host: "127.0.0.1", port: 0 });
const origin = `http://127.0.0.1:${app.server.address().port}`;
base = `${origin}${env.apiPrefix}/menu`;

const prisma = app.prisma;
const RUN = `flow${Date.now().toString(36)}`;
const fixtureId = (prefix) => `${prefix}${ulid()}`;
const vendors = [];
const users = [];

async function signUp(role, label) {
  const response = await fetch(`${origin}${env.apiPrefix}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: label,
      email: `${RUN}-${label.toLowerCase().replace(/\W+/g, "-")}@example.test`,
      password: "correct horse battery staple",
      role,
    }),
  });
  const body = await response.json();
  if (!body.success) throw new Error(`could not register ${label}: ${JSON.stringify(body)}`);
  users.push(body.data.user.id);
  return { id: body.data.user.id, token: body.data.accessToken };
}

/** A storefront with one branch, open around the clock, in Dhaka. */
async function makeVendor({ ownerId, slug }) {
  const id = fixtureId("ven_");
  await prisma.vendor.create({
    data: {
      id,
      slug,
      name: slug,
      tagline: "Created by menu-flow",
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

  const branchId = fixtureId("vbr_");
  await prisma.vendorBranch.create({
    data: {
      id: branchId,
      vendorId: id,
      isPrimary: true,
      name: slug,
      slug: "main",
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

  return { id, slug, branchId };
}

const makeStaff = ({ vendorId, userId, role, status = "active", branchId = null }) =>
  prisma.vendorStaff.create({
    data: {
      id: fixtureId("vst_"),
      vendorId,
      userId,
      branchId,
      role: toDbEnum("StaffRoleKind", role),
      status: toDbEnum("StaffStatusKind", status),
      jobTitle: role,
    },
    select: { id: true },
  });

try {
  console.log(`FoodOra — module 5 menu & inventory against ${base}\n`);

  // -- 1. The cast --------------------------------------------------------
  step("1. Two restaurants, and the people who work at one of them");
  const alice = await signUp("restaurant-owner", "Flow Alice");
  const bob = await signUp("restaurant-owner", "Flow Bob");
  const chef = await signUp("customer", "Flow Chef");
  const diner = await signUp("customer", "Flow Diner");

  const bella = await makeVendor({ ownerId: alice.id, slug: `${RUN}-bella` });
  const rivals = await makeVendor({ ownerId: bob.id, slug: `${RUN}-rivals` });
  await makeStaff({ vendorId: bella.id, userId: chef.id, role: "kitchen" });

  check("a storefront with a primary branch exists", Boolean(bella.branchId));
  check("and a second one, owned by somebody else", Boolean(rivals.id));

  // -- 2. The board -------------------------------------------------------
  step("2. The owner builds a menu");
  const menu = await must("POST", `/vendors/${bella.id}/menus`, {
    token: alice.token,
    body: { name: "Delivery", kind: "delivery" },
  });
  check("a menu is created", menu.id.startsWith("menu_"), menu.id);
  check("and is the default of its kind, because it is the first", menu.isDefault === true);
  check("and is serving right now — it has no window", menu.isServingNow === true);

  const pizzas = await must("POST", `/vendors/${bella.id}/menus/${menu.id}/sections`, {
    token: alice.token,
    body: { name: "Wood-fired Pizzas" },
  });
  const pasta = await must("POST", `/vendors/${bella.id}/menus/${menu.id}/sections`, {
    token: alice.token,
    body: { name: "Pasta" },
  });
  check("two sections, appended in order", pizzas.sort === 1 && pasta.sort === 2);
  check("each carrying the vendor denormalised from the menu", pizzas.vendorId === bella.id);

  const margherita = await must("POST", `/vendors/${bella.id}/sections/${pizzas.id}/items`, {
    token: alice.token,
    body: {
      name: `${RUN} Margherita DOP`,
      price: 720,
      description: "Fior di latte, San Marzano, fresh basil.",
      dietary: ["vegetarian"],
      calories: 850,
      prepMinutes: 12,
      sku: "PIZ-1",
    },
  });
  check("a dish is created", margherita.item.id.startsWith("food_"));
  check("with a slug minted from its name", margherita.item.slug.includes("margherita"));
  check("live from the moment it is created", margherita.live === true);
  check("and untracked, because nobody has counted it", margherita.stockState === "untracked");

  const carbonara = await must("POST", `/vendors/${bella.id}/sections/${pasta.id}/items`, {
    token: alice.token,
    body: { name: `${RUN} Spaghetti Carbonara`, price: 780 },
  });

  // -- 3. Modifiers -------------------------------------------------------
  step("3. Modifiers, and the rules that refuse a control nobody can satisfy");
  const size = await must("POST", `/vendors/${bella.id}/items/${margherita.item.id}/option-groups`, {
    token: alice.token,
    body: {
      name: "Size",
      required: true,
      min: 1,
      max: 1,
      options: [
        { name: "12 inch", priceDelta: 0 },
        { name: "16 inch", priceDelta: 250 },
      ],
    },
  });
  check("a required radio group is created with its options", size.options.length === 2);

  const tooWide = await call("POST", `/vendors/${bella.id}/items/${margherita.item.id}/option-groups`, {
    token: alice.token,
    body: { name: "Extras", min: 0, max: 4, options: [{ name: "Olives" }] },
  });
  check(
    "a max above the options listed is refused at 200, as a form error",
    tooWide.status === 200 && tooWide.body.success === false,
  );
  check("with the frontend's own i18n key", tooWide.body.error.key === "errors.optionRangeInvalid");

  const zeroRequired = await call("POST", `/vendors/${bella.id}/items/${margherita.item.id}/option-groups`, {
    token: alice.token,
    body: { name: "Crust", required: true, min: 0, max: 1, options: [{ name: "Thin" }] },
  });
  check(
    "a required group that zero selections would satisfy is refused",
    zeroRequired.body.error?.key === "errors.optionRangeInvalid",
  );

  const emptyGroup = await call("POST", `/vendors/${bella.id}/items/${margherita.item.id}/option-groups`, {
    token: alice.token,
    body: { name: "Nothing", min: 0, max: 1, options: [] },
  });
  check("a group with no options is refused before the service, at 400", emptyGroup.status === 400);

  // -- 4. Authorization ---------------------------------------------------
  step("4. Who may do what");
  const rivalWrite = await call("POST", `/vendors/${bella.id}/menus`, {
    token: bob.token,
    body: { name: "Not yours" },
  });
  check("another restaurant's owner is refused, though the role is identical", rivalWrite.status === 403);

  const chefWrite = await call("PATCH", `/vendors/${bella.id}/items/${margherita.item.id}`, {
    token: chef.token,
    body: { price: 1 },
  });
  check("the kitchen may not reprice a dish", chefWrite.status === 403);

  const chefEighty = await call("PUT", `/vendors/${bella.id}/items/${carbonara.item.id}/availability`, {
    token: chef.token,
    body: { isAvailable: false },
  });
  check("but the kitchen may take one off — that is the point of the split", chefEighty.status === 200);
  await must("PUT", `/vendors/${bella.id}/items/${carbonara.item.id}/availability`, {
    token: chef.token,
    body: { isAvailable: true },
  });

  const dinerWrite = await call("PUT", `/vendors/${bella.id}/items/${carbonara.item.id}/availability`, {
    token: diner.token,
    body: { isAvailable: false },
  });
  check("a signed-in customer may not", dinerWrite.status === 403);

  const anonymous = await call("POST", `/vendors/${bella.id}/menus`, { body: { name: "Nobody" } });
  check("a signed-out caller is 401, not 403", anonymous.status === 401);

  const crossVendor = await call("PATCH", `/vendors/${rivals.id}/items/${margherita.item.id}`, {
    token: bob.token,
    body: { price: 1 },
  });
  check(
    "naming somebody else's dish under your own vendor is a 404, not a 403",
    crossVendor.status === 404,
    JSON.stringify(crossVendor.body),
  );

  const board = await call("GET", `/vendors/${bella.id}/board`, { token: diner.token });
  check("the merchant's board needs membership", board.status === 403);

  // -- 5. Inventory -------------------------------------------------------
  step("5. Stock, and what it does to the menu on its own");
  const opened = await must("PUT", `/vendors/${bella.id}/items/${margherita.item.id}/inventory`, {
    token: alice.token,
    body: { quantity: 3, lowStockThreshold: 1, unit: "pcs" },
  });
  check("counting starts at three", opened.stock.quantity === 3);
  check("and available is what is left after reservations", opened.stock.available === 3);

  const sold = await must("POST", `/vendors/${bella.id}/items/${margherita.item.id}/inventory/adjust`, {
    token: chef.token,
    body: { delta: -2, kind: "sold", note: "table 4" },
  });
  check("the kitchen sells two", sold.stock.quantity === 1);
  check("the movement records the balance it produced", sold.movement.balance === 1);
  check("and it is low, but still orderable", sold.available === true);

  const wrongSign = await call("POST", `/vendors/${bella.id}/items/${margherita.item.id}/inventory/adjust`, {
    token: alice.token,
    body: { delta: 3, kind: "sold" },
  });
  check("a sale that increases stock is refused — the schema says `sold < 0`", wrongSign.body.success === false);

  const soldOut = await must("POST", `/vendors/${bella.id}/items/${margherita.item.id}/inventory/adjust`, {
    token: alice.token,
    body: { delta: -1, kind: "sold" },
  });
  check("the last one goes", soldOut.stock.quantity === 0);
  check("and the dish is no longer orderable", soldOut.available === false);

  const overdraw = await call("POST", `/vendors/${bella.id}/items/${margherita.item.id}/inventory/adjust`, {
    token: alice.token,
    body: { delta: -1, kind: "sold" },
  });
  check("going below zero is refused, not floored", overdraw.body.success === false);
  check("with the stock key the merchant's form renders", overdraw.body.error.key === "errors.stockInvalid");

  const publicMenu = await must("GET", `/vendors/${bella.id}`);
  const soldOutDish = publicMenu.flatMap((section) => section.items).find((item) => item.id === margherita.item.id);
  check("the customer's menu says the dish is unavailable", soldOutDish.isAvailable === false);

  const merchantBoard = await must("GET", `/vendors/${bella.id}/board`, { token: alice.token });
  const boardRow = merchantBoard.sections
    .flatMap((section) => section.items)
    .find((row) => row.item.id === margherita.item.id);
  check("but the merchant's switch was never touched", boardRow.item.isAvailable === true);
  check("the board says why it is off the menu", boardRow.outOfStock === true && boardRow.live === false);

  const restored = await must("POST", `/vendors/${bella.id}/items/${margherita.item.id}/inventory/adjust`, {
    token: alice.token,
    body: { delta: 5, kind: "received", note: "delivery" },
  });
  check("restocking brings it back with no switch flicked", restored.available === true);

  // -- 6. Atomicity -------------------------------------------------------
  step("6. Two terminals, one last portion");
  const last = await must("POST", `/vendors/${bella.id}/sections/${pizzas.id}/items`, {
    token: alice.token,
    body: { name: `${RUN} Last Slice`, price: 300 },
  });
  await must("PUT", `/vendors/${bella.id}/items/${last.item.id}/inventory`, {
    token: alice.token,
    body: { quantity: 1 },
  });

  const [first, second] = await Promise.all([
    call("POST", `/vendors/${bella.id}/items/${last.item.id}/inventory/adjust`, {
      token: alice.token,
      body: { delta: -1, kind: "sold" },
    }),
    call("POST", `/vendors/${bella.id}/items/${last.item.id}/inventory/adjust`, {
      token: chef.token,
      body: { delta: -1, kind: "sold" },
    }),
  ]);
  const winners = [first, second].filter((response) => response.body?.success === true);
  check("exactly one of two concurrent sales succeeds", winners.length === 1, JSON.stringify([first.body, second.body]));

  const lastRow = await prisma.inventoryItem.findUnique({
    where: { foodId: last.item.id },
    select: { id: true, onHand: true },
  });
  check("the balance in the table never went negative", Number(lastRow.onHand) === 0);

  const lastMovements = await prisma.stockMovement.findMany({
    where: { itemId: lastRow.id, kind: toDbEnum("StockMovementKind", "sold") },
    select: { id: true },
  });
  check("and the loser left no movement behind", lastMovements.length === 1);

  // -- 7. The customer's shape -------------------------------------------
  step("7. What a customer's browser actually receives");
  const menuNow = await must("GET", `/vendors/${bella.id}`);
  const section = menuNow.find((row) => row.id === pizzas.id);
  check("the menu answers with no token at all", Array.isArray(menuNow) && menuNow.length >= 1);
  check(
    "a section is `types/catalog.ts::MenuSection` plus `items`, and nothing else",
    Object.keys(section).sort().join(",") === "createdAt,deletedAt,id,items,name,sort,updatedAt,vendorId",
    Object.keys(section).join(","),
  );

  const dish = section.items.find((item) => item.id === margherita.item.id);
  check("money is a number, not a Decimal string", typeof dish.price === "number");
  check("the option group came with it", dish.optionGroups.length === 1 && dish.optionGroups[0].options.length === 2);
  check(
    "no authoring field reached the wire",
    !JSON.stringify(menuNow).includes("PIZ-1") &&
      !JSON.stringify(menuNow).includes("prepMinutes") &&
      !JSON.stringify(menuNow).includes("quantity"),
  );

  const priced = await must("POST", `/vendors/${bella.id}/items/${dish.id}/selection`, {
    body: { options: [dish.optionGroups[0].options[1].id] },
  });
  check("a valid selection prices as base + delta", priced.valid === true && priced.unitPrice === 970);

  const empty = await must("POST", `/vendors/${bella.id}/items/${dish.id}/selection`, { body: { options: [] } });
  check("a required group left empty is reported, not thrown", empty.valid === false);
  check("and the report names the group", empty.violations[0].groupId === size.id);

  const foreign = await must("POST", `/vendors/${bella.id}/items/${dish.id}/selection`, {
    body: { options: [`fop_${ulid()}`] },
  });
  check("an option from nowhere is `unknown-option`", foreign.violations.some((v) => v.code === "unknown-option"));

  // -- 8. What the tables say --------------------------------------------
  step("8. The database, read directly");
  const rows = await prisma.menuSection.findMany({ where: { menuId: menu.id }, select: { vendorId: true } });
  check("every section carries the vendor", rows.length === 2 && rows.every((row) => row.vendorId === bella.id));

  const items = await prisma.foodItem.findMany({ where: { vendorId: bella.id }, select: { sectionId: true } });
  check("every dish hangs off a section of this vendor's menu", items.length === 3);

  const inventoryRows = await prisma.inventoryItem.findMany({
    where: { vendorId: bella.id },
    select: { foodId: true, onHand: true },
  });
  check("only counted dishes have an inventory row", inventoryRows.length === 2);

  const ledger = await prisma.stockMovement.findMany({
    where: { item: { foodId: margherita.item.id } },
    select: { quantity: true, balance: true },
    orderBy: { occurredAt: "asc" },
  });
  let running = 0;
  const balanced = ledger.every((movement) => {
    running += Number(movement.quantity);
    return Number(movement.balance) === running;
  });
  check("the movement ledger sums to every balance it recorded", balanced);

  const limited = await call("GET", `/vendors/${bella.id}`);
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

/**
 * menu.test.js — module 5, against real PostgreSQL and the real routes.
 *
 * Nothing here is mocked. The storefronts, branches, staff rows and accounts are
 * created for the run and hard-deleted after it; every assertion goes through the
 * mounted routes with `app.inject`, so the guards, the JSON Schema validation and
 * the response filtering are all in the path.
 *
 * ## Why almost everything goes through the routes
 *
 * `menu-rules.test.js` already covers the derivations as functions. What is left
 * is precisely what a function call cannot exercise and what this module is most
 * likely to get wrong:
 *
 *  - the **guards** — who may author, who may only 86 a dish, who may touch which
 *    branch's shelves;
 *  - the **ownership** re-check, which is the difference between "a member of
 *    vendor A" and "may edit *this* row";
 *  - the **response schema**, which is the second guarantee that a stock count and
 *    a `sku` cannot reach a customer's menu;
 *  - the **transaction** behind a stock adjustment, which is only a real claim
 *    when two of them race against one row in one database.
 *
 * ## Fixtures
 *
 * Two storefronts owned by two different people, so "same role, different
 * restaurant" is a case rather than a hypothetical. Vendor A carries the full
 * staff table — a manager, a kitchen hand, a cashier, a manager scoped to the
 * second branch and a deactivated manager — because the staff rules are half of
 * what §5 asks for.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ulid } from "ulid";
import { buildApp } from "../src/app.js";
import { toDbEnum } from "../src/shared/utils/enums.js";
import { WEEKDAYS } from "../src/modules/catalog/hours.js";

const STAMP = Date.now().toString(36);
const RUN = `m5${STAMP}`;
const PASSWORD = "correct horse battery staple";
const AUTH = "/api/v1/auth";
const BASE = "/api/v1/menu";

let app;
let prisma;
let seq = 0;

const created = { vendors: [], users: [] };

/** An id for a table this module does not mint — `authz.test.js`'s helper. */
const fixtureId = (prefix) => `${prefix}${ulid()}`;
const bearer = (token) => ({ headers: { authorization: `Bearer ${token}` } });

const call = (method, path, { token, payload } = {}) =>
  app.inject({
    method,
    url: `${BASE}${path}`,
    ...(token ? bearer(token) : {}),
    ...(payload === undefined ? {} : { payload }),
  });

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
    payload: { name: `Module 5 Account ${seq}`, email: `${RUN}-${seq}@example.test`, password: PASSWORD, role },
  });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  created.users.push(body.data.user.id);
  return { id: body.data.user.id, token: body.data.accessToken };
}

/** A storefront with one or two branches, open around the clock. */
async function makeVendor({ ownerId, slug, branches = 1 }) {
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
  created.vendors.push(id);

  const branchIds = [];
  for (let index = 0; index < branches; index += 1) {
    const branchId = fixtureId("vbr_");
    branchIds.push(branchId);
    await prisma.vendorBranch.create({
      data: {
        id: branchId,
        vendorId: id,
        isPrimary: index === 0,
        name: `${slug} ${index}`,
        slug: `branch-${index}`,
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
  }

  return { id, slug, branchIds };
}

async function makeStaff({ vendorId, userId, role, status = "active", branchId = null }) {
  await prisma.vendorStaff.create({
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
}

// ---------------------------------------------------------------------------

let alice; // owns vendor A
let bob; // owns vendor B
let manager;
let kitchen;
let cashier;
let branchManager; // scoped to vendor A's second branch
let exManager; // an inactive staff row
let customer;
let vendorA;
let vendorB;

before(async () => {
  app = await buildApp();
  prisma = app.prisma;

  [alice, bob, manager, kitchen, cashier, branchManager, exManager, customer] = await Promise.all([
    signUp("restaurant-owner"),
    signUp("restaurant-owner"),
    signUp("customer"),
    signUp("customer"),
    signUp("customer"),
    signUp("customer"),
    signUp("customer"),
    signUp("customer"),
  ]);

  vendorA = await makeVendor({ ownerId: alice.id, slug: `${RUN}-alice`, branches: 2 });
  vendorB = await makeVendor({ ownerId: bob.id, slug: `${RUN}-bob` });

  await Promise.all([
    makeStaff({ vendorId: vendorA.id, userId: manager.id, role: "manager" }),
    makeStaff({ vendorId: vendorA.id, userId: kitchen.id, role: "kitchen" }),
    makeStaff({ vendorId: vendorA.id, userId: cashier.id, role: "cashier" }),
    makeStaff({ vendorId: vendorA.id, userId: branchManager.id, role: "manager", branchId: vendorA.branchIds[1] }),
    makeStaff({ vendorId: vendorA.id, userId: exManager.id, role: "manager", status: "inactive" }),
  ]);
});

after(async () => {
  const raw = prisma.$unfiltered();
  if (created.vendors.length > 0) await raw.vendor.deleteMany({ where: { id: { in: created.vendors } } });
  if (created.users.length > 0) await raw.user.deleteMany({ where: { id: { in: created.users } } });
  await app.close();
});

// ---------------------------------------------------------------------------

describe("menus", () => {
  let menuId;

  it("the owner opens a board", async () => {
    const menu = await ok("POST", `/vendors/${vendorA.id}/menus`, {
      token: alice.token,
      payload: { name: "Main", kind: "delivery" },
    });
    menuId = menu.id;
    assert.match(menu.id, /^menu_/);
    assert.equal(menu.kind, "delivery");
    assert.equal(menu.isActive, true);
  });

  it("the first board of a kind is its default whatever the caller said", async () => {
    // A kind with no default resolves to nothing and the storefront looks empty.
    const menus = await ok("GET", `/vendors/${vendorA.id}/menus`, { token: alice.token });
    assert.equal(menus.find((menu) => menu.id === menuId).isDefault, true);
  });

  it("refuses a second board of the same kind with the same name", async () => {
    const error = await refused("POST", `/vendors/${vendorA.id}/menus`, {
      token: alice.token,
      payload: { name: "Main", kind: "delivery" },
    });
    // `@@unique([vendorId, kind, name])`, answered as the frontend's own key
    // rather than as a 409 the form cannot render.
    assert.equal(error.key, "errors.nameRequired");
    assert.equal(error.path, "name");
  });

  it("allows the same name on a different kind — a QR board is a different board", async () => {
    const menu = await ok("POST", `/vendors/${vendorA.id}/menus`, {
      token: alice.token,
      payload: { name: "Main", kind: "qr" },
    });
    assert.equal(menu.kind, "qr");
  });

  it("refuses a blank name", async () => {
    const response = await call("POST", `/vendors/${vendorA.id}/menus`, {
      token: alice.token,
      payload: { name: "   " },
    });
    // JSON Schema takes the empty string; the blank is the service's refusal.
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().error.key, "errors.nameRequired");
  });

  it("refuses a malformed vendor id before the database", async () => {
    const { status } = await failed("GET", "/vendors/not-an-id/menus", { token: alice.token });
    assert.equal(status, 400);
  });

  it("the manager may also open one", async () => {
    const menu = await ok("POST", `/vendors/${vendorA.id}/menus`, {
      token: manager.token,
      payload: { name: `${RUN} manager board`, kind: "pos" },
    });
    assert.ok(menu.id);
  });

  it("the kitchen may not — `menu.manage` is the owner's and the manager's", async () => {
    const { status } = await failed("POST", `/vendors/${vendorA.id}/menus`, {
      token: kitchen.token,
      payload: { name: "Kitchen board" },
    });
    assert.equal(status, 403);
  });

  it("a deactivated manager holds nothing", async () => {
    // `lib/staff.ts`: a member who is not active folds to nothing — a suspension
    // that suspended nothing would be the bug.
    const { status } = await failed("POST", `/vendors/${vendorA.id}/menus`, {
      token: exManager.token,
      payload: { name: "Ghost board" },
    });
    assert.equal(status, 403);
  });

  it("another restaurant's owner may not, though they hold the same platform role", async () => {
    const { status } = await failed("POST", `/vendors/${vendorA.id}/menus`, {
      token: bob.token,
      payload: { name: "Bob's board" },
    });
    assert.equal(status, 403);
  });

  it("a signed-out caller may not", async () => {
    const { status } = await failed("POST", `/vendors/${vendorA.id}/menus`, { payload: { name: "Nobody" } });
    assert.equal(status, 401);
  });

  it("a manager scoped to one branch may not edit a menu every branch serves", async () => {
    const { status, error } = await failed("POST", `/vendors/${vendorA.id}/menus`, {
      token: branchManager.token,
      payload: { name: "Branch board" },
    });
    assert.equal(status, 403);
    assert.equal(error.details.branchId, vendorA.branchIds[1]);
  });

  it("renames a board, and the version moves", async () => {
    const menu = await ok("PATCH", `/vendors/${vendorA.id}/menus/${menuId}`, {
      token: alice.token,
      payload: { name: "All day" },
    });
    assert.equal(menu.name, "All day");
    assert.equal(menu.version, 1);
  });

  it("a menu id from another vendor is a 404, not a 403", async () => {
    const other = await ok("POST", `/vendors/${vendorB.id}/menus`, {
      token: bob.token,
      payload: { name: "Bob main" },
    });
    // A restaurant owner probing ids must not learn which of them exist elsewhere.
    const { status } = await failed("PATCH", `/vendors/${vendorA.id}/menus/${other.id}`, {
      token: alice.token,
      payload: { name: "Stolen" },
    });
    assert.equal(status, 404);
  });
});

describe("sections and items", () => {
  let menuId;
  let starters;
  let mains;
  let item;

  before(async () => {
    const menu = await ok("POST", `/vendors/${vendorA.id}/menus`, {
      token: alice.token,
      payload: { name: `${RUN} board`, kind: "dine-in" },
    });
    menuId = menu.id;
  });

  it("adds sections, appended after what is already there", async () => {
    starters = await ok("POST", `/vendors/${vendorA.id}/menus/${menuId}/sections`, {
      token: alice.token,
      payload: { name: "Starters" },
    });
    mains = await ok("POST", `/vendors/${vendorA.id}/menus/${menuId}/sections`, {
      token: alice.token,
      payload: { name: "Mains" },
    });
    assert.match(starters.id, /^sec_/);
    assert.equal(starters.sort, 1);
    assert.equal(mains.sort, 2);
  });

  it("denormalises `vendorId` from the menu, never from the caller", async () => {
    assert.equal(starters.vendorId, vendorA.id);
    const row = await prisma.menuSection.findUnique({ where: { id: starters.id }, select: { vendorId: true } });
    assert.equal(row.vendorId, vendorA.id);
  });

  it("puts a dish on the board", async () => {
    const board = await ok("POST", `/vendors/${vendorA.id}/sections/${mains.id}/items`, {
      token: alice.token,
      payload: { name: "Margherita", price: 720, description: "Fior di latte", dietary: ["vegetarian"] },
    });
    item = board.item;
    assert.match(item.id, /^food_/);
    assert.equal(item.price, 720);
    assert.deepEqual(item.dietary, ["vegetarian"]);
    assert.equal(item.vendorId, vendorA.id);
    assert.equal(board.live, true);
    assert.equal(board.stockState, "untracked");
  });

  it("mints a slug from the name, and disambiguates a taken one", async () => {
    assert.equal(item.slug, "margherita");
    const twin = await ok("POST", `/vendors/${vendorB.id}/sections/${(await bobSection()).id}/items`, {
      token: bob.token,
      payload: { name: "Margherita", price: 700 },
    });
    // `FoodItem.slug` is unique across the platform, not per vendor.
    assert.notEqual(twin.item.slug, "margherita");
    assert.match(twin.item.slug, /^margherita-/);
  });

  it("refuses a dish with no price", async () => {
    const error = await refused("POST", `/vendors/${vendorA.id}/sections/${mains.id}/items`, {
      token: alice.token,
      payload: { name: "Free lunch", price: 0 },
    });
    assert.equal(error.key, "errors.priceRequired");
    assert.equal(error.path, "price");
  });

  it("refuses a strike-through price that is not a discount", async () => {
    const error = await refused("POST", `/vendors/${vendorA.id}/sections/${mains.id}/items`, {
      token: alice.token,
      payload: { name: "Odd deal", price: 500, compareAtPrice: 400 },
    });
    assert.equal(error.path, "compareAtPrice");
  });

  it("refuses a negative price before the service sees it", async () => {
    const { status } = await failed("POST", `/vendors/${vendorA.id}/sections/${mains.id}/items`, {
      token: alice.token,
      payload: { name: "Negative", price: -5 },
    });
    assert.equal(status, 400);
  });

  it("moves a dish between sections as a field edit", async () => {
    const moved = await ok("PATCH", `/vendors/${vendorA.id}/items/${item.id}`, {
      token: alice.token,
      payload: { sectionId: starters.id },
    });
    assert.equal(moved.item.sectionId, starters.id);
    await ok("PATCH", `/vendors/${vendorA.id}/items/${item.id}`, {
      token: alice.token,
      payload: { sectionId: mains.id },
    });
  });

  it("refuses a move into another vendor's section", async () => {
    const theirs = await bobSection();
    const { status } = await failed("PATCH", `/vendors/${vendorA.id}/items/${item.id}`, {
      token: alice.token,
      payload: { sectionId: theirs.id },
    });
    assert.equal(status, 404);
  });

  it("reorders sections by naming the whole order", async () => {
    const order = await ok("POST", `/vendors/${vendorA.id}/menus/${menuId}/sections/order`, {
      token: alice.token,
      payload: { sectionIds: [mains.id, starters.id] },
    });
    assert.deepEqual(
      order.map((section) => section.id),
      [mains.id, starters.id],
    );
    assert.equal(order[0].sort, 1);
  });

  it("refuses a reorder that does not name every section", async () => {
    // A missing id would leave a row with a stale `sort`; an extra one is a row
    // from somewhere else.
    const error = await refused("POST", `/vendors/${vendorA.id}/menus/${menuId}/sections/order`, {
      token: alice.token,
      payload: { sectionIds: [mains.id] },
    });
    assert.equal(error.key, "errors.sectionNotFound");
  });

  it("reorders items within a section", async () => {
    const second = await ok("POST", `/vendors/${vendorA.id}/sections/${mains.id}/items`, {
      token: alice.token,
      payload: { name: `${RUN} Diavola`, price: 890 },
    });
    const order = await ok("POST", `/vendors/${vendorA.id}/sections/${mains.id}/items/order`, {
      token: alice.token,
      payload: { itemIds: [second.item.id, item.id] },
    });
    assert.deepEqual(
      order.map((row) => row.id),
      [second.item.id, item.id],
    );
  });

  it("switches a section off, and the customer's menu loses it", async () => {
    await ok("PATCH", `/vendors/${vendorA.id}/sections/${starters.id}`, {
      token: alice.token,
      payload: { isActive: false },
    });
    const menu = await ok("GET", `/vendors/${vendorA.id}?kind=dine-in`);
    assert.ok(!menu.some((section) => section.id === starters.id));
  });

  it("but the merchant's board keeps it, marked", async () => {
    const board = await ok("GET", `/vendors/${vendorA.id}/board?kind=dine-in`, { token: alice.token });
    const row = board.sections.find((section) => section.section.id === starters.id);
    assert.ok(row, "the board shows a switched-off section");
    assert.equal(row.enabled, false);
  });

  it("soft-deletes a dish, and it leaves the menu", async () => {
    const throwaway = await ok("POST", `/vendors/${vendorA.id}/sections/${mains.id}/items`, {
      token: alice.token,
      payload: { name: `${RUN} Retired`, price: 100 },
    });
    await ok("DELETE", `/vendors/${vendorA.id}/items/${throwaway.item.id}`, { token: alice.token });

    const { status } = await failed("GET", `/vendors/${vendorA.id}/items/${throwaway.item.id}`);
    assert.equal(status, 404);

    // Soft, not gone: `main.prisma` §3.
    const raw = await prisma
      .$unfiltered()
      .foodItem.findUnique({ where: { id: throwaway.item.id }, select: { deletedAt: true } });
    assert.notEqual(raw.deletedAt, null);
  });

  /** Vendor B's one section, created on demand — the cross-vendor cases need it. */
  async function bobSection() {
    const menus = await ok("GET", `/vendors/${vendorB.id}/menus`, { token: bob.token });
    let menu = menus[0];
    if (!menu) {
      menu = await ok("POST", `/vendors/${vendorB.id}/menus`, { token: bob.token, payload: { name: "B" } });
    }
    const board = await ok("GET", `/vendors/${vendorB.id}/board?menuId=${menu.id}`, { token: bob.token });
    if (board.sections.length > 0) return board.sections[0].section;
    return ok("POST", `/vendors/${vendorB.id}/menus/${menu.id}/sections`, {
      token: bob.token,
      payload: { name: "Bob's section" },
    });
  }
});

describe("the customer's menu", () => {
  let menuId;
  let sectionId;
  let itemId;

  before(async () => {
    const menu = await ok("POST", `/vendors/${vendorA.id}/menus`, {
      token: alice.token,
      payload: { name: `${RUN} catering`, kind: "catering" },
    });
    menuId = menu.id;
    const section = await ok("POST", `/vendors/${vendorA.id}/menus/${menuId}/sections`, {
      token: alice.token,
      payload: { name: "Platters" },
    });
    sectionId = section.id;
    const item = await ok("POST", `/vendors/${vendorA.id}/sections/${sectionId}/items`, {
      token: alice.token,
      payload: { name: `${RUN} Mezze platter`, price: 1500, sku: "PLT-1", prepMinutes: 30 },
    });
    itemId = item.item.id;
  });

  it("answers with no token at all", async () => {
    const menu = await ok("GET", `/vendors/${vendorA.id}?kind=catering`);
    assert.equal(menu.length, 1);
    assert.equal(menu[0].name, "Platters");
    assert.equal(menu[0].items.length, 1);
  });

  it("is `MenuSectionWithItems` field for field, and nothing more", async () => {
    const [section] = await ok("GET", `/vendors/${vendorA.id}?kind=catering`);
    assert.equal(
      Object.keys(section).sort().join(","),
      "createdAt,deletedAt,id,items,name,sort,updatedAt,vendorId",
    );
    assert.equal(
      Object.keys(section.items[0]).sort().join(","),
      [
        "calories",
        "compareAtPrice",
        "createdAt",
        "deletedAt",
        "description",
        "dietary",
        "id",
        "image",
        "isAvailable",
        "isPopular",
        "name",
        "optionGroups",
        "price",
        "rating",
        "reviewCount",
        "sectionId",
        "slug",
        "spicyLevel",
        "updatedAt",
        "vendorId",
      ].join(","),
    );
  });

  it("never carries the merchant's authoring fields or a stock count", async () => {
    const body = JSON.stringify(await ok("GET", `/vendors/${vendorA.id}?kind=catering`));
    // The response schema is what enforces this, independently of the service.
    for (const leak of ["sku", "prepMinutes", "PLT-1", "quantity", "onHand", "version", "menuId"]) {
      assert.ok(!body.includes(leak), `"${leak}" reached a public menu`);
    }
  });

  it("money is a number, not a Decimal string", async () => {
    const [section] = await ok("GET", `/vendors/${vendorA.id}?kind=catering`);
    assert.equal(typeof section.items[0].price, "number");
  });

  it("drops a section with nothing under it, as the mock path does", async () => {
    await ok("POST", `/vendors/${vendorA.id}/menus/${menuId}/sections`, {
      token: alice.token,
      payload: { name: "Empty" },
    });
    const menu = await ok("GET", `/vendors/${vendorA.id}?kind=catering`);
    assert.ok(!menu.some((section) => section.name === "Empty"));
  });

  it("keeps a switched-off dish and marks it, rather than hiding it", async () => {
    await ok("PUT", `/vendors/${vendorA.id}/items/${itemId}/availability`, {
      token: alice.token,
      payload: { isAvailable: false },
    });
    const [section] = await ok("GET", `/vendors/${vendorA.id}?kind=catering`);
    assert.equal(section.items[0].isAvailable, false);

    const only = await ok("GET", `/vendors/${vendorA.id}?kind=catering&includeUnavailable=false`);
    assert.equal(only.length, 0, "asking for only what is orderable drops it");

    await ok("PUT", `/vendors/${vendorA.id}/items/${itemId}/availability`, {
      token: alice.token,
      payload: { isAvailable: true },
    });
  });

  it("an inactive menu answers empty, not 404 — the vendor still exists", async () => {
    await ok("PATCH", `/vendors/${vendorA.id}/menus/${menuId}`, {
      token: alice.token,
      payload: { isActive: false },
    });
    assert.deepEqual(await ok("GET", `/vendors/${vendorA.id}?kind=catering`), []);
    await ok("PATCH", `/vendors/${vendorA.id}/menus/${menuId}`, {
      token: alice.token,
      payload: { isActive: true },
    });
  });

  it("a menu outside its window is not the menu, and there is no fallback", async () => {
    // Dhaka is UTC+6, so a window of 00:00–00:01 UTC-equivalent is essentially
    // never now; the assertion is that nothing falls back to it.
    const now = new Date();
    const dhakaMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 360) % 1440;
    const from = String(Math.floor(((dhakaMinutes + 120) % 1440) / 60)).padStart(2, "0");
    const to = String(Math.floor(((dhakaMinutes + 240) % 1440) / 60)).padStart(2, "0");

    await ok("PATCH", `/vendors/${vendorA.id}/menus/${menuId}`, {
      token: alice.token,
      payload: { availableFrom: `${from}:00`, availableTo: `${to}:00` },
    });
    assert.deepEqual(await ok("GET", `/vendors/${vendorA.id}?kind=catering`), []);

    const menus = await ok("GET", `/vendors/${vendorA.id}/menus?kind=catering`, { token: alice.token });
    assert.equal(menus.find((menu) => menu.id === menuId).isServingNow, false);

    await ok("PATCH", `/vendors/${vendorA.id}/menus/${menuId}`, {
      token: alice.token,
      payload: { availableFrom: null, availableTo: null },
    });
    assert.equal((await ok("GET", `/vendors/${vendorA.id}?kind=catering`)).length, 1);
  });

  it("an unknown vendor is a 404", async () => {
    const { status } = await failed("GET", `/vendors/ven_${ulid()}`);
    assert.equal(status, 404);
  });

  it("the board needs membership; the menu does not", async () => {
    assert.equal((await call("GET", `/vendors/${vendorA.id}/board`)).statusCode, 401);
    assert.equal((await call("GET", `/vendors/${vendorA.id}/board`, { token: customer.token })).statusCode, 403);
    assert.equal((await call("GET", `/vendors/${vendorA.id}/board`, { token: kitchen.token })).statusCode, 200);
  });
});

describe("modifier groups and options", () => {
  let itemId;
  let groupId;
  let optionIds;
  let modsMenuId;

  before(async () => {
    const menu = await ok("POST", `/vendors/${vendorA.id}/menus`, {
      token: alice.token,
      payload: { name: `${RUN} mods`, kind: "pos", isDefault: true },
    });
    modsMenuId = menu.id;
    const section = await ok("POST", `/vendors/${vendorA.id}/menus/${menu.id}/sections`, {
      token: alice.token,
      payload: { name: "Burgers" },
    });
    const item = await ok("POST", `/vendors/${vendorA.id}/sections/${section.id}/items`, {
      token: alice.token,
      payload: { name: `${RUN} Classic Smash`, price: 450 },
    });
    itemId = item.item.id;
  });

  it("creates a group and its options in one call", async () => {
    const group = await ok("POST", `/vendors/${vendorA.id}/items/${itemId}/option-groups`, {
      token: alice.token,
      payload: {
        name: "Size",
        required: true,
        min: 1,
        max: 1,
        options: [
          { name: "Single", priceDelta: 0 },
          { name: "Double", priceDelta: 150 },
        ],
      },
    });
    groupId = group.id;
    optionIds = group.options.map((option) => option.id);
    assert.match(groupId, /^fog_/);
    assert.match(optionIds[0], /^fop_/);
    assert.equal(group.options.length, 2);
  });

  it("refuses a group with no options — there is no half-built group to read", async () => {
    const { status } = await failed("POST", `/vendors/${vendorA.id}/items/${itemId}/option-groups`, {
      token: alice.token,
      payload: { name: "Empty", min: 0, max: 1, options: [] },
    });
    assert.equal(status, 400, "the schema refuses an empty array before the service does");
  });

  it("refuses a max above the number of options", async () => {
    const error = await refused("POST", `/vendors/${vendorA.id}/items/${itemId}/option-groups`, {
      token: alice.token,
      payload: { name: "Add-ons", min: 0, max: 5, options: [{ name: "Bacon" }] },
    });
    assert.equal(error.key, "errors.optionRangeInvalid");
  });

  it("refuses min above max", async () => {
    const error = await refused("POST", `/vendors/${vendorA.id}/items/${itemId}/option-groups`, {
      token: alice.token,
      payload: { name: "Odd", min: 2, max: 1, options: [{ name: "A" }, { name: "B" }] },
    });
    assert.equal(error.key, "errors.optionRangeInvalid");
  });

  it("refuses a required group a customer could satisfy by choosing nothing", async () => {
    const error = await refused("POST", `/vendors/${vendorA.id}/items/${itemId}/option-groups`, {
      token: alice.token,
      payload: { name: "Sauce", required: true, min: 0, max: 1, options: [{ name: "Ketchup" }] },
    });
    assert.equal(error.key, "errors.optionRangeInvalid");
  });

  it("refuses a widening update the group's options cannot support", async () => {
    const error = await refused("PATCH", `/vendors/${vendorA.id}/option-groups/${groupId}`, {
      token: alice.token,
      payload: { max: 9 },
    });
    assert.equal(error.key, "errors.optionRangeInvalid");
  });

  it("adds an option and then allows the widening", async () => {
    await ok("POST", `/vendors/${vendorA.id}/option-groups/${groupId}/options`, {
      token: alice.token,
      payload: { name: "Triple", priceDelta: 300 },
    });
    const group = await ok("PATCH", `/vendors/${vendorA.id}/option-groups/${groupId}`, {
      token: alice.token,
      payload: { max: 2, required: true, min: 1 },
    });
    assert.equal(group.max, 2);
    assert.equal(group.options.length, 3);
  });

  it("refuses switching off an option when it would break the group", async () => {
    // max is 2 and three options are live; switching two off leaves one.
    await ok("PATCH", `/vendors/${vendorA.id}/options/${optionIds[0]}`, {
      token: alice.token,
      payload: { isAvailable: false },
    });
    const error = await refused("PATCH", `/vendors/${vendorA.id}/options/${optionIds[1]}`, {
      token: alice.token,
      payload: { isAvailable: false },
    });
    assert.equal(error.key, "errors.optionRangeInvalid");

    await ok("PATCH", `/vendors/${vendorA.id}/options/${optionIds[0]}`, {
      token: alice.token,
      payload: { isAvailable: true },
    });
  });

  it("deletes an option while the group can still stand, and refuses the one that would break it", async () => {
    // Its own group, so the shared one above keeps the options the selection
    // cases below are written against.
    const pair = await ok("POST", `/vendors/${vendorA.id}/items/${itemId}/option-groups`, {
      token: alice.token,
      payload: {
        name: "Sauces",
        required: false,
        min: 0,
        max: 2,
        options: [{ name: "Ketchup" }, { name: "Mustard" }],
      },
    });

    // max is 2 and two options are live, so the first removal is refused: it
    // would leave a group asking for up to two of one.
    const error = await refused("DELETE", `/vendors/${vendorA.id}/options/${pair.options[0].id}`, {
      token: alice.token,
    });
    assert.equal(error.key, "errors.optionRangeInvalid");

    // Narrow the group first and the same removal is legal.
    await ok("PATCH", `/vendors/${vendorA.id}/option-groups/${pair.id}`, {
      token: alice.token,
      payload: { max: 1 },
    });
    const gone = await ok("DELETE", `/vendors/${vendorA.id}/options/${pair.options[0].id}`, {
      token: alice.token,
    });
    assert.equal(gone.deleted, true);

    // And the last one cannot go: a group with no options is not a group.
    const empty = await refused("DELETE", `/vendors/${vendorA.id}/options/${pair.options[1].id}`, {
      token: alice.token,
    });
    assert.equal(empty.key, "errors.optionsRequired");

    await ok("DELETE", `/vendors/${vendorA.id}/option-groups/${pair.id}`, { token: alice.token });
  });

  it("an option id from another vendor is a 404", async () => {
    const { status } = await failed("PATCH", `/vendors/${vendorB.id}/options/${optionIds[0]}`, {
      token: bob.token,
      payload: { name: "Mine now" },
    });
    assert.equal(status, 404);
  });

  it("the kitchen may not edit modifiers", async () => {
    const { status } = await failed("PATCH", `/vendors/${vendorA.id}/option-groups/${groupId}`, {
      token: kitchen.token,
      payload: { name: "Portion" },
    });
    assert.equal(status, 403);
  });

  it("a switched-off option never reaches a customer, and the group's max is clamped", async () => {
    await ok("PATCH", `/vendors/${vendorA.id}/options/${optionIds[0]}`, {
      token: alice.token,
      payload: { isAvailable: false },
    });
    const item = await ok("GET", `/vendors/${vendorA.id}/items/${itemId}`);
    const group = item.optionGroups.find((row) => row.id === groupId);
    assert.equal(group.options.length, 2, "the switched-off option is absent");
    assert.ok(!JSON.stringify(item).includes(optionIds[0]));
    assert.ok(group.max <= group.options.length, "max is clamped to what is left");

    // And the merchant still sees it, so they can switch it back on.
    const board = await ok("GET", `/vendors/${vendorA.id}/board?menuId=${modsMenuId}`, { token: alice.token });
    const boardItem = board.sections.flatMap((section) => section.items).find((row) => row.item.id === itemId);
    assert.equal(boardItem.item.optionGroups.find((row) => row.id === groupId).options.length, 3);

    await ok("PATCH", `/vendors/${vendorA.id}/options/${optionIds[0]}`, {
      token: alice.token,
      payload: { isAvailable: true },
    });
  });

  describe("selection", () => {
    const post = (options) =>
      ok("POST", `/vendors/${vendorA.id}/items/${itemId}/selection`, { payload: { options } });

    it("accepts a valid one and prices it", async () => {
      const verdict = await post([optionIds[1]]);
      assert.equal(verdict.valid, true);
      assert.equal(verdict.basePrice, 450);
      assert.equal(verdict.unitPrice, 600, "450 + the 150 delta");
    });

    it("refuses a required group left empty", async () => {
      const verdict = await post([]);
      assert.equal(verdict.valid, false);
      assert.equal(verdict.violations[0].code, "min-selections");
      assert.equal(verdict.violations[0].groupId, groupId);
    });

    it("refuses more than the maximum", async () => {
      const group = await ok("GET", `/vendors/${vendorA.id}/items/${itemId}`);
      const all = group.optionGroups.find((row) => row.id === groupId).options.map((option) => option.id);
      const verdict = await post(all);
      assert.equal(verdict.valid, false);
      assert.ok(verdict.violations.some((violation) => violation.code === "max-selections"));
    });

    it("refuses an option that belongs to no group of this dish", async () => {
      const verdict = await post([optionIds[1], `fop_${ulid()}`]);
      assert.equal(verdict.valid, false);
      assert.ok(verdict.violations.some((violation) => violation.code === "unknown-option"));
    });

    it("refuses a switched-off option", async () => {
      await ok("PATCH", `/vendors/${vendorA.id}/options/${optionIds[0]}`, {
        token: alice.token,
        payload: { isAvailable: false },
      });
      const verdict = await post([optionIds[0]]);
      assert.equal(verdict.valid, false);
      await ok("PATCH", `/vendors/${vendorA.id}/options/${optionIds[0]}`, {
        token: alice.token,
        payload: { isAvailable: true },
      });
    });

    it("needs no session — a customer picking toppings has not signed in", async () => {
      const response = await call("POST", `/vendors/${vendorA.id}/items/${itemId}/selection`, {
        payload: { options: [optionIds[1]] },
      });
      assert.equal(response.statusCode, 200);
    });
  });
});

describe("inventory", () => {
  let itemId;
  let untracked;
  let stockMenuId;

  before(async () => {
    const menu = await ok("POST", `/vendors/${vendorA.id}/menus`, {
      token: alice.token,
      payload: { name: `${RUN} stock`, kind: "qr", isDefault: true },
    });
    stockMenuId = menu.id;
    const section = await ok("POST", `/vendors/${vendorA.id}/menus/${menu.id}/sections`, {
      token: alice.token,
      payload: { name: "Counted" },
    });
    const tracked = await ok("POST", `/vendors/${vendorA.id}/sections/${section.id}/items`, {
      token: alice.token,
      payload: { name: `${RUN} Sea bass`, price: 1200 },
    });
    itemId = tracked.item.id;
    const other = await ok("POST", `/vendors/${vendorA.id}/sections/${section.id}/items`, {
      token: alice.token,
      payload: { name: `${RUN} Dal`, price: 200 },
    });
    untracked = other.item.id;
  });

  it("a dish nobody counts has no stock row, and that is an answer", async () => {
    const { stock } = await ok("GET", `/vendors/${vendorA.id}/items/${untracked}/inventory`, {
      token: alice.token,
    });
    assert.equal(stock, null);

    const board = await ok("GET", `/vendors/${vendorA.id}/board?menuId=${stockMenuId}`, { token: alice.token });
    const row = board.sections.flatMap((section) => section.items).find((entry) => entry.item.id === untracked);
    assert.equal(row.stockState, "untracked");
    assert.equal(row.live, true, "untracked is not out of stock");
  });

  it("starts counting, and the opening balance is a movement", async () => {
    const result = await ok("PUT", `/vendors/${vendorA.id}/items/${itemId}/inventory`, {
      token: alice.token,
      payload: { quantity: 5, lowStockThreshold: 2, unit: "pcs" },
    });
    assert.equal(result.stock.quantity, 5);
    assert.equal(result.stock.available, 5);
    assert.equal(result.stock.trackStock, true);

    const { movements } = await ok("GET", `/vendors/${vendorA.id}/items/${itemId}/inventory/movements`, {
      token: alice.token,
    });
    assert.equal(movements.length, 1);
    assert.equal(movements[0].kind, "received");
    assert.equal(movements[0].quantity, 5);
    assert.equal(movements[0].balance, 5);
  });

  it("decreases, and the ledger's arithmetic holds", async () => {
    const result = await ok("POST", `/vendors/${vendorA.id}/items/${itemId}/inventory/adjust`, {
      token: alice.token,
      payload: { delta: -2, kind: "sold", note: "table 4" },
    });
    assert.equal(result.stock.quantity, 3);
    assert.equal(result.movement.balance, 3);
    assert.equal(result.movement.quantity, -2);
    assert.equal(result.available, true);
  });

  it("goes low at the threshold, and the board says so", async () => {
    await ok("POST", `/vendors/${vendorA.id}/items/${itemId}/inventory/adjust`, {
      token: alice.token,
      payload: { delta: -1, kind: "sold" },
    });
    const board = await ok("GET", `/vendors/${vendorA.id}/board?menuId=${stockMenuId}`, { token: alice.token });
    const row = board.sections.flatMap((section) => section.items).find((entry) => entry.item.id === itemId);
    assert.equal(row.stockState, "low");
    assert.equal(row.live, true, "low is still orderable");
  });

  it("takes the dish off the menu when it runs out", async () => {
    const result = await ok("POST", `/vendors/${vendorA.id}/items/${itemId}/inventory/adjust`, {
      token: alice.token,
      payload: { delta: -2, kind: "sold" },
    });
    assert.equal(result.stock.quantity, 0);
    assert.equal(result.available, false);

    // The merchant's switch was never touched — availability is derived.
    const board = await ok("GET", `/vendors/${vendorA.id}/board?menuId=${stockMenuId}`, { token: alice.token });
    const row = board.sections.flatMap((section) => section.items).find((entry) => entry.item.id === itemId);
    assert.equal(row.item.isAvailable, true, "the switch is still on");
    assert.equal(row.suppressed, false);
    assert.equal(row.outOfStock, true);
    assert.equal(row.live, false);

    const menu = await ok("GET", `/vendors/${vendorA.id}?kind=qr`);
    const customerView = menu.flatMap((section) => section.items).find((entry) => entry.id === itemId);
    assert.equal(customerView.isAvailable, false, "and the customer cannot order it");
  });

  it("refuses to go below zero rather than flooring", async () => {
    // Flooring would record a movement that never happened and break
    // `balance[n] = balance[n-1] + quantity[n]`.
    const error = await refused("POST", `/vendors/${vendorA.id}/items/${itemId}/inventory/adjust`, {
      token: alice.token,
      payload: { delta: -1, kind: "sold" },
    });
    assert.equal(error.key, "errors.stockInvalid");
    assert.equal(error.path, "delta");

    const { stock } = await ok("GET", `/vendors/${vendorA.id}/items/${itemId}/inventory`, { token: alice.token });
    assert.equal(stock.quantity, 0, "and nothing was written");
  });

  it("restores stock, and the dish comes back on its own", async () => {
    const result = await ok("POST", `/vendors/${vendorA.id}/items/${itemId}/inventory/adjust`, {
      token: alice.token,
      payload: { delta: 6, kind: "received", note: "delivery" },
    });
    assert.equal(result.stock.quantity, 6);
    assert.equal(result.available, true);

    const menu = await ok("GET", `/vendors/${vendorA.id}?kind=qr`);
    const customerView = menu.flatMap((section) => section.items).find((entry) => entry.id === itemId);
    assert.equal(customerView.isAvailable, true);
  });

  it("refuses a movement whose sign contradicts its kind", async () => {
    // `catalog.prisma`: "Signed: received > 0, sold < 0".
    assert.equal(
      (
        await refused("POST", `/vendors/${vendorA.id}/items/${itemId}/inventory/adjust`, {
          token: alice.token,
          payload: { delta: 3, kind: "sold" },
        })
      ).key,
      "errors.stockInvalid",
    );
    assert.equal(
      (
        await refused("POST", `/vendors/${vendorA.id}/items/${itemId}/inventory/adjust`, {
          token: alice.token,
          payload: { delta: -3, kind: "received" },
        })
      ).key,
      "errors.stockInvalid",
    );
  });

  it("allows a correction either way, because a correction goes either way", async () => {
    const down = await ok("POST", `/vendors/${vendorA.id}/items/${itemId}/inventory/adjust`, {
      token: alice.token,
      payload: { delta: -1, kind: "adjusted", note: "miscount" },
    });
    assert.equal(down.stock.quantity, 5);
    const up = await ok("POST", `/vendors/${vendorA.id}/items/${itemId}/inventory/adjust`, {
      token: alice.token,
      payload: { delta: 1, kind: "adjusted" },
    });
    assert.equal(up.stock.quantity, 6);
  });

  it("refuses a delta of zero", async () => {
    const error = await refused("POST", `/vendors/${vendorA.id}/items/${itemId}/inventory/adjust`, {
      token: alice.token,
      payload: { delta: 0 },
    });
    assert.equal(error.path, "delta");
  });

  it("refuses adjusting a dish nobody counts", async () => {
    const error = await refused("POST", `/vendors/${vendorA.id}/items/${untracked}/inventory/adjust`, {
      token: alice.token,
      payload: { delta: -1 },
    });
    assert.equal(error.key, "errors.stockInvalid");
  });

  it("refuses a negative opening balance before the service sees it", async () => {
    const { status } = await failed("PUT", `/vendors/${vendorA.id}/items/${untracked}/inventory`, {
      token: alice.token,
      payload: { quantity: -3 },
    });
    assert.equal(status, 400);
  });

  it("setting the count outright writes the difference as a movement", async () => {
    const before = (await ok("GET", `/vendors/${vendorA.id}/items/${itemId}/inventory`, { token: alice.token }))
      .stock.quantity;
    const result = await ok("PUT", `/vendors/${vendorA.id}/items/${itemId}/inventory`, {
      token: alice.token,
      payload: { quantity: 20, note: "stocktake" },
    });
    assert.equal(result.stock.quantity, 20);
    assert.equal(result.movement.kind, "adjusted");
    assert.equal(result.movement.quantity, 20 - before);
    assert.equal(result.movement.balance, 20);
  });

  it("the ledger balances — every movement sums to the balance it recorded", async () => {
    const { movements } = await ok("GET", `/vendors/${vendorA.id}/items/${itemId}/inventory/movements`, {
      token: alice.token,
    });
    const chronological = [...movements].reverse();
    let running = 0;
    for (const movement of chronological) {
      running += movement.quantity;
      assert.equal(movement.balance, running, `balance drifted at ${movement.id}`);
    }
    const { stock } = await ok("GET", `/vendors/${vendorA.id}/items/${itemId}/inventory`, { token: alice.token });
    assert.equal(stock.quantity, running, "and the sum is the balance on the row");
  });

  it("switching tracking off leaves the count but stops it deciding anything", async () => {
    await ok("PUT", `/vendors/${vendorA.id}/items/${itemId}/inventory`, {
      token: alice.token,
      payload: { quantity: 0, trackStock: false },
    });
    const board = await ok("GET", `/vendors/${vendorA.id}/board?menuId=${stockMenuId}`, { token: alice.token });
    const row = board.sections.flatMap((section) => section.items).find((entry) => entry.item.id === itemId);
    assert.equal(row.stockState, "untracked");
    assert.equal(row.live, true, "a count of zero on an untracked dish is not sold out");

    await ok("PUT", `/vendors/${vendorA.id}/items/${itemId}/inventory`, {
      token: alice.token,
      payload: { quantity: 10, trackStock: true },
    });
  });

  it("the kitchen may move stock but may not reprice the dish", async () => {
    const moved = await ok("POST", `/vendors/${vendorA.id}/items/${itemId}/inventory/adjust`, {
      token: kitchen.token,
      payload: { delta: -1, kind: "wasted", note: "dropped" },
    });
    assert.equal(moved.movement.actorId, kitchen.id);

    const { status } = await failed("PATCH", `/vendors/${vendorA.id}/items/${itemId}`, {
      token: kitchen.token,
      payload: { price: 1 },
    });
    assert.equal(status, 403);
  });

  it("the cashier may 86 a dish; a customer may not", async () => {
    await ok("PUT", `/vendors/${vendorA.id}/items/${itemId}/availability`, {
      token: cashier.token,
      payload: { isAvailable: false },
    });
    const { status } = await failed("PUT", `/vendors/${vendorA.id}/items/${itemId}/availability`, {
      token: customer.token,
      payload: { isAvailable: true },
    });
    assert.equal(status, 403);
    await ok("PUT", `/vendors/${vendorA.id}/items/${itemId}/availability`, {
      token: alice.token,
      payload: { isAvailable: true },
    });
  });

  it("another restaurant cannot read or move this one's stock", async () => {
    assert.equal(
      (await failed("GET", `/vendors/${vendorA.id}/items/${itemId}/inventory`, { token: bob.token })).status,
      403,
    );
    assert.equal(
      (
        await failed("POST", `/vendors/${vendorA.id}/items/${itemId}/inventory/adjust`, {
          token: bob.token,
          payload: { delta: -1 },
        })
      ).status,
      403,
    );
    // And naming vendor B in the path does not help: the dish is not theirs.
    assert.equal(
      (await failed("GET", `/vendors/${vendorB.id}/items/${itemId}/inventory`, { token: bob.token })).status,
      404,
    );
  });

  it("lists the vendor's shelves, paginated", async () => {
    const page = await ok("GET", `/vendors/${vendorA.id}/inventory?pageSize=50`, { token: alice.token });
    assert.ok(page.total >= 1);
    assert.ok(page.items.some((row) => row.foodId === itemId));
    assert.equal(typeof page.hasMore, "boolean");
  });

  describe("branch isolation", () => {
    let branchItemId;

    before(async () => {
      const menu = await ok("POST", `/vendors/${vendorA.id}/menus`, {
        token: alice.token,
        payload: { name: `${RUN} branch stock`, kind: "delivery" },
      });
      const section = await ok("POST", `/vendors/${vendorA.id}/menus/${menu.id}/sections`, {
        token: alice.token,
        payload: { name: "Branch counted" },
      });
      const item = await ok("POST", `/vendors/${vendorA.id}/sections/${section.id}/items`, {
        token: alice.token,
        payload: { name: `${RUN} Branch dish`, price: 300 },
      });
      branchItemId = item.item.id;
      await ok("PUT", `/vendors/${vendorA.id}/items/${branchItemId}/inventory`, {
        token: alice.token,
        payload: { quantity: 4, branchId: vendorA.branchIds[0] },
      });
    });

    it("a shelf belongs to the branch it was opened at", async () => {
      const { stock } = await ok("GET", `/vendors/${vendorA.id}/items/${branchItemId}/inventory`, {
        token: alice.token,
      });
      assert.equal(stock.branchId, vendorA.branchIds[0]);
    });

    it("a member scoped to another branch cannot see it", async () => {
      // `VendorStaff.branchId` — null means every branch, a value means one.
      const { status } = await failed("GET", `/vendors/${vendorA.id}/items/${branchItemId}/inventory`, {
        token: branchManager.token,
      });
      assert.equal(status, 404);
    });

    it("nor move it", async () => {
      const { status } = await failed("POST", `/vendors/${vendorA.id}/items/${branchItemId}/inventory/adjust`, {
        token: branchManager.token,
        payload: { delta: -1 },
      });
      assert.equal(status, 404);
    });

    it("nor read its movements", async () => {
      const { status } = await failed(
        "GET",
        `/vendors/${vendorA.id}/items/${branchItemId}/inventory/movements`,
        { token: branchManager.token },
      );
      assert.equal(status, 404);
    });

    it("and its inventory listing excludes the other branch's rows", async () => {
      const page = await ok("GET", `/vendors/${vendorA.id}/inventory?pageSize=100`, {
        token: branchManager.token,
      });
      assert.ok(!page.items.some((row) => row.branchId === vendorA.branchIds[0]));
    });

    it("the owner, who is scoped to no branch, sees both", async () => {
      const page = await ok("GET", `/vendors/${vendorA.id}/inventory?pageSize=100`, { token: alice.token });
      assert.ok(page.items.some((row) => row.branchId === vendorA.branchIds[0]));
      assert.ok(page.items.some((row) => row.branchId === null));
    });

    it("refuses a branch that is not this vendor's", async () => {
      const error = await refused("PUT", `/vendors/${vendorA.id}/items/${branchItemId}/inventory`, {
        token: alice.token,
        payload: { branchId: fixtureId("vbr_") },
      });
      assert.equal(error.path, "branchId");
    });
  });

  describe("concurrency", () => {
    let contested;

    before(async () => {
      const menu = await ok("POST", `/vendors/${vendorA.id}/menus`, {
        token: alice.token,
        payload: { name: `${RUN} race`, kind: "pos" },
      });
      const section = await ok("POST", `/vendors/${vendorA.id}/menus/${menu.id}/sections`, {
        token: alice.token,
        payload: { name: "Last portions" },
      });
      const item = await ok("POST", `/vendors/${vendorA.id}/sections/${section.id}/items`, {
        token: alice.token,
        payload: { name: `${RUN} Last portion`, price: 900 },
      });
      contested = item.item.id;
      await ok("PUT", `/vendors/${vendorA.id}/items/${contested}/inventory`, {
        token: alice.token,
        payload: { quantity: 1 },
      });
    });

    it("two terminals cannot both sell the last portion", async () => {
      // The claim the guarded UPDATE exists to make. Both requests read a
      // balance of 1; PostgreSQL applies the predicate and the increment under
      // one row lock, so exactly one can win.
      const [first, second] = await Promise.all([
        call("POST", `/vendors/${vendorA.id}/items/${contested}/inventory/adjust`, {
          token: alice.token,
          payload: { delta: -1, kind: "sold" },
        }),
        call("POST", `/vendors/${vendorA.id}/items/${contested}/inventory/adjust`, {
          token: kitchen.token,
          payload: { delta: -1, kind: "sold" },
        }),
      ]);

      const outcomes = [first, second].map((response) => response.json());
      const wins = outcomes.filter((body) => body.success === true);
      const losses = outcomes.filter((body) => body.success === false);

      assert.equal(wins.length, 1, `exactly one should win — got ${JSON.stringify(outcomes)}`);
      assert.equal(losses.length, 1);
      assert.equal(wins[0].data.stock.quantity, 0);

      const { stock } = await ok("GET", `/vendors/${vendorA.id}/items/${contested}/inventory`, {
        token: alice.token,
      });
      assert.equal(stock.quantity, 0, "and the balance never went negative");
    });

    it("and exactly one movement was written", async () => {
      const { movements } = await ok(
        "GET",
        `/vendors/${vendorA.id}/items/${contested}/inventory/movements`,
        { token: alice.token },
      );
      const sales = movements.filter((movement) => movement.kind === "sold");
      assert.equal(sales.length, 1, "a losing request must not leave a movement behind");
    });
  });
});

describe("the integration flow", () => {
  it("vendor → branch → menu → section → item → group → option → stock, read back as the frontend expects", async () => {
    const owner = await signUp("restaurant-owner");
    const vendor = await makeVendor({ ownerId: owner.id, slug: `${RUN}-flow` });

    const menu = await ok("POST", `/vendors/${vendor.id}/menus`, {
      token: owner.token,
      payload: { name: "Delivery", kind: "delivery" },
    });
    const section = await ok("POST", `/vendors/${vendor.id}/menus/${menu.id}/sections`, {
      token: owner.token,
      payload: { name: "Wood-fired Pizzas" },
    });
    const item = await ok("POST", `/vendors/${vendor.id}/sections/${section.id}/items`, {
      token: owner.token,
      payload: { name: `${RUN} Diavola`, price: 890, description: "Spicy nduja", spicyLevel: 2 },
    });
    const group = await ok("POST", `/vendors/${vendor.id}/items/${item.item.id}/option-groups`, {
      token: owner.token,
      payload: {
        name: "Size",
        required: true,
        min: 1,
        max: 1,
        options: [{ name: "12 inch" }, { name: "16 inch", priceDelta: 250 }],
      },
    });
    await ok("PUT", `/vendors/${vendor.id}/items/${item.item.id}/inventory`, {
      token: owner.token,
      payload: { quantity: 3, lowStockThreshold: 1 },
    });

    // Read it back exactly as `services/catalog.ts::getVendorMenu` would.
    const board = await ok("GET", `/vendors/${vendor.id}`);
    assert.equal(board.length, 1);
    const [read] = board;
    assert.equal(read.name, "Wood-fired Pizzas");
    assert.equal(read.items.length, 1);

    const dish = read.items[0];
    assert.equal(dish.name, `${RUN} Diavola`);
    assert.equal(dish.price, 890);
    assert.equal(dish.spicyLevel, 2);
    assert.equal(dish.isAvailable, true);
    assert.equal(dish.optionGroups.length, 1);
    assert.equal(dish.optionGroups[0].id, group.id);
    assert.equal(dish.optionGroups[0].options.length, 2);
    assert.equal(dish.optionGroups[0].options[1].priceDelta, 250);

    // And the customiser's arithmetic agrees with the server's.
    const priced = await ok("POST", `/vendors/${vendor.id}/items/${dish.id}/selection`, {
      payload: { options: [dish.optionGroups[0].options[1].id] },
    });
    assert.equal(priced.valid, true);
    assert.equal(priced.unitPrice, 1140);

    // Selling the last three takes it off the board without anybody touching a switch.
    await ok("POST", `/vendors/${vendor.id}/items/${dish.id}/inventory/adjust`, {
      token: owner.token,
      payload: { delta: -3, kind: "sold" },
    });
    const after = await ok("GET", `/vendors/${vendor.id}`);
    assert.equal(after[0].items[0].isAvailable, false);

    const stillPriced = await ok("POST", `/vendors/${vendor.id}/items/${dish.id}/selection`, {
      payload: { options: [dish.optionGroups[0].options[1].id] },
    });
    assert.equal(stillPriced.valid, false);
    assert.equal(stillPriced.violations[0].code, "item-unavailable");
  });
});

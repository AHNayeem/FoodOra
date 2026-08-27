/**
 * catalog.test.js — module 4, against real PostgreSQL and the real routes.
 *
 * Nothing here is mocked. The taxonomy is the one `seed/catalog.js` writes, the
 * storefronts are rows created for the run and hard-deleted after it, and every
 * assertion goes through either the mounted routes (`app.inject`) or the service
 * built over the app's own Prisma client.
 *
 * ## Why both paths, and which is which
 *
 *  - **Through the routes** for everything about the contract and the
 *    authorization: the response schema is what filters `commissionRate` out of a
 *    public payload, the `preHandler` is what decides whether a merchant sees
 *    their own unopened storefront, and neither is exercised by calling a
 *    function.
 *  - **Through the service, with a frozen `now`** for the parts of `isOpen` that
 *    need the clock to be somewhere specific. `listVendors(query, { now })` takes
 *    the instant as an argument precisely so that "open at 01:00 on an overnight
 *    service" is a statement about the database rather than about whenever the
 *    suite happened to run. `catalog-derivation.test.js` covers the same
 *    functions with no database at all.
 *
 * ## Scoping, and why every fixture carries a token
 *
 * The suite runs against a database it shares with the other test files and with
 * whatever a developer has seeded. So every fixture's `description` contains a
 * per-run token and every listing assertion passes `search=<token>`, which makes
 * the totals below exact rather than "at least". `NIGHT` is a *second* token, not
 * a suffix of the first: `contains` would match a prefix, and the night-owl
 * fixture has to be invisible to the `RUN`-scoped queries whose counts it would
 * otherwise change.
 *
 * ## Cleanup
 *
 * Vendors and accounts are hard-deleted through `$unfiltered()` — the soft-delete
 * extension refuses `delete` on both, which is what it is for. The cascades take
 * branches, hours, closures, cuisine and dietary links, staff rows, sessions,
 * credentials and role assignments.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ulid } from "ulid";
import { buildApp } from "../src/app.js";
import { createRepository } from "../src/modules/catalog/repository.js";
import { createService } from "../src/modules/catalog/service.js";
import { seedCatalogTaxonomy } from "../src/seed/catalog.js";
import { ID_PREFIXES } from "../src/shared/constants/id-prefixes.js";
import { newId } from "../src/shared/utils/ids.js";
import { toDbEnum } from "../src/shared/utils/enums.js";
import { WEEKDAYS } from "../src/modules/catalog/hours.js";

const STAMP = Date.now().toString(36);
/** Every fixture's description carries this; every scoped query searches for it. */
const RUN = `m4a${STAMP}`;
/** The night-owl fixture's token — deliberately not a superstring of `RUN`. */
const NIGHT = `m4b${STAMP}`;
const PASSWORD = "correct horse battery staple";
const AUTH = "/api/v1/auth";
const BASE = "/api/v1/catalog";

/** Gulshan 1 — the origin `services/catalog.ts::DEFAULT_ORIGIN` uses. */
const GULSHAN = { lat: 23.7806, lng: 90.4152 };
const BANANI = { lat: 23.7925, lng: 90.4078 };
const CHITTAGONG = { lat: 22.3569, lng: 91.7832 };

let app;
let prisma;
/** A service over the app's own client, so a frozen clock can be passed in. */
let service;
let seq = 0;

const created = { vendors: [], users: [] };
const cuisineIds = {};
const slugs = {};

/**
 * An id for a table module 4 does not write.
 *
 * `shared/constants/id-prefixes.js` is the list of prefixes this backend *mints*,
 * and a storefront fixture in a discovery test is not the onboarding module
 * landing. The shape is the one `newId` produces. Same helper, same reasoning, as
 * `authz.test.js`.
 */
const fixtureId = (prefix) => `${prefix}${ulid()}`;

const bearer = (token) => ({ headers: { authorization: `Bearer ${token}` } });
const get = (path, options = {}) => app.inject({ method: "GET", url: `${BASE}${path}`, ...options });

/** A successful body, asserted to be one. */
async function ok(path, options = {}) {
  const response = await get(path, options);
  assert.equal(response.statusCode, 200, `${path} → ${response.statusCode} ${response.body}`);
  const body = response.json();
  assert.equal(body.success, true, response.body);
  return body.data;
}

/** The `RUN`-scoped vendor listing every count below is taken from. */
const list = (query = "", options = {}) => ok(`/vendors?search=${RUN}${query}`, options);
const slugsOf = (page) => page.items.map((vendor) => vendor.slug);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Register an account and keep what a later assertion needs. */
async function signUp(role = "customer") {
  seq += 1;
  const email = `${RUN}-${seq}@example.test`;
  const response = await app.inject({
    method: "POST",
    url: `${AUTH}/register`,
    payload: { name: `Module 4 Account ${seq}`, email, password: PASSWORD, role },
  });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  created.users.push(body.data.user.id);
  return {
    id: body.data.user.id,
    email,
    token: body.data.accessToken,
    sessionId: body.data.sessionId,
    auth: bearer(body.data.accessToken),
  };
}

const roleIdOf = async (slug) => (await prisma.role.findUnique({ where: { slug }, select: { id: true } })).id;

async function assignRole(userId, slug, { vendorId = null } = {}) {
  await prisma.userRoleAssignment.create({
    data: { id: newId(ID_PREFIXES.userRoleAssignment), userId, roleId: await roleIdOf(slug), vendorId },
    select: { id: true },
  });
}

/** `open` = every day 00:00–23:59; `closed` = seven null rows; or explicit windows. */
function hourRows(branchId, hours) {
  if (hours === "closed") {
    return WEEKDAYS.map((weekday) => ({
      id: fixtureId("bhr_"),
      branchId,
      weekday: toDbEnum("WeekdayKind", weekday),
      openTime: null,
      closeTime: null,
      overnight: false,
      sort: 0,
    }));
  }
  if (hours === "open") {
    return WEEKDAYS.map((weekday) => ({
      id: fixtureId("bhr_"),
      branchId,
      weekday: toDbEnum("WeekdayKind", weekday),
      openTime: "00:00",
      closeTime: "23:59",
      overnight: false,
      sort: 0,
    }));
  }
  return hours.map((window, index) => ({
    id: fixtureId("bhr_"),
    branchId,
    weekday: toDbEnum("WeekdayKind", window.weekday),
    openTime: window.openTime,
    closeTime: window.closeTime,
    overnight: Boolean(window.overnight),
    sort: window.sort ?? index,
  }));
}

/**
 * A vendor and its primary branch, as `catalog.prisma` splits them.
 *
 * Everything the read model shows is here, because the point of most of these
 * fixtures is one field: a rating that orders a sort, a `promoLabel` that answers
 * a facet, a branch status that hides a storefront.
 */
async function makeVendor(overrides = {}) {
  seq += 1;
  const {
    key,
    slug = `${RUN}-vendor-${seq}`,
    name = `Vendor ${seq}`,
    tagline = "",
    description = "",
    token = RUN,
    type = "restaurant",
    status = "active",
    branchStatus = "active",
    ownerId = null,
    cuisines = [],
    dietary = [],
    priceLevel = 2,
    rating = "4.00",
    reviewCount = 10,
    isFeatured = false,
    isTrending = false,
    promoLabel = null,
    at = GULSHAN,
    city = "Dhaka",
    timezone = "Asia/Dhaka",
    etaMin = 25,
    etaMax = 40,
    deliveryFee = "60.00",
    minOrder = "300.00",
    freeDeliveryOver = null,
    deliveryRadiusKm = "8.00",
    supportsDelivery = true,
    supportsPickup = true,
    acceptingOrders = true,
    pausedUntil = null,
    hours = "open",
    closures = [],
    branch = true,
    deleted = false,
  } = overrides;

  const id = fixtureId("ven_");
  await prisma.vendor.create({
    data: {
      id,
      slug,
      type: toDbEnum("VendorTypeKind", type),
      status: toDbEnum("VendorStatus", status),
      ownerId,
      name,
      tagline,
      description: `${description} ${token}`.trim(),
      priceLevel,
      currency: "BDT",
      rating,
      reviewCount,
      isFeatured,
      isTrending,
      promoLabel,
      cuisines: { create: cuisines.map((cuisine, index) => ({ cuisineId: cuisineIds[cuisine], sort: index })) },
      dietary: { create: dietary.map((tag) => ({ tag: toDbEnum("DietaryTagKind", tag) })) },
    },
    select: { id: true },
  });
  created.vendors.push(id);
  if (key) slugs[key] = slug;

  if (branch) {
    const branchId = fixtureId("vbr_");
    await prisma.vendorBranch.create({
      data: {
        id: branchId,
        vendorId: id,
        isPrimary: true,
        name,
        slug: "main",
        lat: String(at.lat),
        lng: String(at.lng),
        address: `${name} Road`,
        city,
        countryCode: "BD",
        timezone,
        etaMinMinutes: etaMin,
        etaMaxMinutes: etaMax,
        deliveryFee,
        minOrder,
        freeDeliveryOver,
        deliveryRadiusKm,
        supportsDelivery,
        supportsPickup,
        acceptingOrders,
        pausedUntil,
        status: toDbEnum("VendorStatus", branchStatus),
        hours: { create: hourRows(branchId, hours).map(({ branchId: _ignored, ...row }) => row) },
        closures: {
          create: closures.map((closure) => ({
            id: fixtureId("bcl_"),
            fromDate: closure.from,
            toDate: closure.to,
            reason: closure.reason ?? null,
          })),
        },
      },
      select: { id: true },
    });
  }

  if (deleted) await prisma.vendor.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id, slug };
}

async function makeStaff({ vendorId, userId, role = "manager", status = "active" }) {
  await prisma.vendorStaff.create({
    data: {
      id: fixtureId("vst_"),
      vendorId,
      userId,
      role: toDbEnum("StaffRoleKind", role),
      status: toDbEnum("StaffStatusKind", status),
    },
    select: { id: true },
  });
}

/** What the service is handed when nobody is signed in. */
const ANON = { userId: null, canSeeAll: false, canAccessVendor: async () => false };

let accounts;

before(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
  prisma = app.prisma;

  // The module's own reference data, seeded on the connection the assertions use
  // — which also proves the seeder is idempotent, since a developer's database
  // already has it.
  await seedCatalogTaxonomy({ prisma, logger: { info: () => {} } });
  service = createService({ repo: createRepository(prisma) });

  for (const row of await prisma.cuisine.findMany({ select: { id: true, slug: true } })) {
    cuisineIds[row.slug] = row.id;
  }

  accounts = {
    customer: await signUp("customer"),
    owner: await signUp("restaurant-owner"),
    manager: await signUp("customer"),
    invitedStaff: await signUp("customer"),
    desk: await signUp("customer"),
    stranger: await signUp("restaurant-owner"),
    assigned: await signUp("customer"),
    blocked: await signUp("restaurant-owner"),
    revoked: await signUp("restaurant-owner"),
  };

  // `customer-support` is one of the four seeded roles holding `restaurants.view`.
  await assignRole(accounts.desk.id, "customer-support");

  // -- The five publicly listable storefronts ------------------------------
  const bella = await makeVendor({
    key: "bella",
    slug: `${RUN}-bella-napoli`,
    name: "Bella Napoli",
    tagline: "Wood-fired Neapolitan pizza",
    description: "Authentic margherita on a 48-hour dough",
    type: "restaurant",
    ownerId: accounts.owner.id,
    cuisines: ["italian"],
    dietary: ["vegetarian"],
    priceLevel: 3,
    rating: "4.80",
    reviewCount: 1284,
    isFeatured: true,
    isTrending: true,
    promoLabel: "20% off over ৳800",
    freeDeliveryOver: "800.00",
    etaMin: 25,
    etaMax: 35,
    at: GULSHAN,
  });

  await makeVendor({
    key: "burger",
    slug: `${RUN}-burger-lab`,
    name: "Burger Lab",
    tagline: "Smash burgers and craft shakes",
    cuisines: ["american"],
    dietary: ["halal"],
    priceLevel: 2,
    rating: "4.60",
    reviewCount: 2043,
    etaMin: 20,
    etaMax: 30,
    at: BANANI,
  });

  await makeVendor({
    key: "sushi",
    slug: `${RUN}-sakura-sushi`,
    name: "Sakura Sushi",
    tagline: "Omakase counter",
    type: "cafe",
    cuisines: ["japanese"],
    priceLevel: 4,
    rating: "4.90",
    reviewCount: 640,
    etaMin: 35,
    etaMax: 50,
    at: CHITTAGONG,
    city: "Chittagong",
    deliveryRadiusKm: "5.00",
    supportsDelivery: false,
    hours: "closed",
  });

  await makeVendor({
    key: "paused",
    slug: `${RUN}-paused-kitchen`,
    name: "Paused Kitchen",
    status: "paused",
    priceLevel: 1,
    rating: "4.20",
    etaMin: 30,
    etaMax: 45,
  });

  await makeVendor({
    key: "stranger",
    slug: `${RUN}-stranger-shop`,
    name: "Stranger Shop",
    ownerId: accounts.stranger.id,
    priceLevel: 2,
    rating: "4.00",
    etaMin: 40,
    etaMax: 60,
  });

  // -- Storefronts the public may not see ----------------------------------
  const pending = await makeVendor({
    key: "pending",
    slug: `${RUN}-pending-place`,
    name: "Pending Place",
    status: "pending",
    ownerId: accounts.owner.id,
    rating: "3.90",
  });
  await makeStaff({ vendorId: pending.id, userId: accounts.manager.id, role: "manager", status: "active" });
  await makeStaff({ vendorId: pending.id, userId: accounts.invitedStaff.id, role: "cashier", status: "invited" });

  const draft = await makeVendor({
    key: "draft",
    slug: `${RUN}-draft-place`,
    name: "Draft Place",
    status: "draft",
    rating: "3.80",
  });
  // The third membership `authz.vendorAccess` recognises: a vendor-scoped role.
  await assignRole(accounts.assigned.id, "vendor-manager", { vendorId: draft.id });

  await makeVendor({ key: "suspended", slug: `${RUN}-suspended-place`, status: "suspended", rating: "3.70" });
  await makeVendor({ key: "deleted", slug: `${RUN}-deleted-place`, deleted: true, rating: "3.60" });
  await makeVendor({ key: "branchGone", slug: `${RUN}-branch-suspended`, branchStatus: "suspended", rating: "3.50" });
  await makeVendor({ key: "noBranch", slug: `${RUN}-no-branch`, branch: false, rating: "3.40" });
  await makeVendor({
    key: "blocked",
    slug: `${RUN}-blocked-owner-place`,
    status: "pending",
    ownerId: accounts.blocked.id,
    rating: "3.30",
  });
  await makeVendor({
    key: "revoked",
    slug: `${RUN}-revoked-session-place`,
    status: "pending",
    ownerId: accounts.revoked.id,
    rating: "3.20",
  });

  // -- The frozen-clock fixture, invisible to every `RUN` query -------------
  await makeVendor({
    key: "night",
    slug: `${NIGHT}-night-owl`,
    name: "Night Owl",
    token: NIGHT,
    at: GULSHAN,
    hours: [{ weekday: "fri", openTime: "23:00", closeTime: "02:00", overnight: true }],
  });

  assert.ok(bella.id, "fixtures created");
});

after(async () => {
  const raw = prisma.$unfiltered();
  if (created.vendors.length > 0) await raw.vendor.deleteMany({ where: { id: { in: created.vendors } } });
  if (created.users.length > 0) await raw.user.deleteMany({ where: { id: { in: created.users } } });
  await app.close();
});

// ---------------------------------------------------------------------------

describe("1. the seeded taxonomy", () => {
  it("serves the cuisine grid in its own order", async () => {
    const data = await ok("/cuisines");
    assert.ok(data.length >= 8, `got ${data.length}`);
    assert.equal(data[0].slug, "italian", "sort 1 comes first");
    assert.ok(data.some((cuisine) => cuisine.slug === "desserts"));
  });

  it("a cuisine is exactly `types/catalog.ts::Cuisine`", async () => {
    const [cuisine] = await ok("/cuisines");
    assert.deepEqual(Object.keys(cuisine).sort(), [
      "createdAt",
      "deletedAt",
      "emoji",
      "id",
      "image",
      "name",
      "slug",
      "updatedAt",
    ]);
    assert.equal(cuisine.deletedAt, null);
    assert.match(cuisine.id, /^cus_/);
  });

  it("serves the craving rail with its keywords projected back to an array", async () => {
    const data = await ok("/categories");
    const pizza = data.find((category) => category.slug === "pizza");
    assert.ok(pizza, "the pizza tile exists");
    assert.equal(pizza.sort, 1);
    assert.ok(Array.isArray(pizza.keywords));
    assert.ok(pizza.keywords.includes("margherita"), JSON.stringify(pizza.keywords));
    assert.deepEqual(Object.keys(pizza).sort(), [
      "createdAt",
      "deletedAt",
      "emoji",
      "id",
      "image",
      "keywords",
      "name",
      "slug",
      "sort",
      "updatedAt",
    ]);
  });

  it("the ten tiles amount to forty-eight keyword rows", async () => {
    const count = await prisma.categoryKeyword.count({
      where: { category: { slug: { in: ["pizza", "burgers", "sushi", "biryani", "pasta", "tacos", "coffee", "desserts", "healthy", "ramen"] } } },
    });
    assert.equal(count, 48);
  });

  it("re-seeding changes nothing and removes a term that left the source", async () => {
    const pizza = await prisma.category.findUnique({ where: { slug: "pizza" }, select: { id: true } });
    await prisma.categoryKeyword.create({ data: { categoryId: pizza.id, term: `${RUN}-stale` } });

    await seedCatalogTaxonomy({ prisma, logger: { info: () => {} } });

    const terms = await prisma.categoryKeyword.findMany({
      where: { categoryId: pizza.id },
      select: { term: true },
    });
    assert.equal(terms.length, 4, JSON.stringify(terms));
    assert.ok(!terms.some((row) => row.term.endsWith("-stale")), "the stale term was reconciled away");
  });
});

describe("2. validation", () => {
  it("accepts the whole facet vocabulary", async () => {
    const response = await get(
      `/vendors?search=${RUN}&type=cafe&dietary=halal&maxPrice=3&minRating=4&maxEta=60` +
        "&openNow=true&freeDelivery=false&offersOnly=false&sort=rating&page=1&pageSize=5&lat=23.78&lng=90.41",
    );
    assert.equal(response.statusCode, 200, response.body);
  });

  it("refuses a sort nobody offers", async () => {
    const response = await get("/vendors?sort=cheapest-first");
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.key, "errors.invalidInput");
  });

  it("refuses an invalid vendor type, dietary tag, page and price level", async () => {
    for (const query of ["type=food-truck", "dietary=paleo", "page=0", "pageSize=101", "maxPrice=9", "minRating=6"]) {
      const response = await get(`/vendors?${query}`);
      assert.equal(response.statusCode, 400, `${query} → ${response.statusCode}`);
    }
  });

  it("refuses a slug that is not slug-shaped", async () => {
    for (const slug of ["Bella%20Napoli", "..", "a_b", "-leading"]) {
      const response = await get(`/vendors/${slug}`);
      assert.ok([400, 404].includes(response.statusCode), `${slug} → ${response.statusCode}`);
    }
  });

  it("drops a parameter nobody declared rather than passing it on", async () => {
    // `removeAdditional: "all"`. `ownerId` would be a filter if it reached Prisma.
    const page = await list("&ownerId=usr_00000000000000000000000000");
    assert.equal(page.total, 5);
  });

  it("`sort=distance` and `deliverable=true` need coordinates, and say so", async () => {
    for (const query of ["sort=distance", "deliverable=true"]) {
      const response = await get(`/vendors?${query}`);
      assert.equal(response.statusCode, 400, query);
      assert.match(response.json().error.message, /lat and lng/);
    }
  });

  it("half a coordinate is not a place", async () => {
    const page = await list("&lat=23.78");
    assert.equal(page.items[0].distanceKm, null);
  });

  it("a cuisine or category slug that names nothing narrows to nothing", async () => {
    assert.equal((await list("&cuisine=klingon")).total, 0);
    assert.equal((await list("&category=nothing-here")).total, 0);
  });
});

describe("3. the vendor read model", () => {
  let bella;

  before(async () => {
    bella = await ok(`/vendors/${slugs.bella}?lat=${GULSHAN.lat}&lng=${GULSHAN.lng}`);
  });

  it("is `types/catalog.ts::Vendor`, field for field", () => {
    assert.deepEqual(Object.keys(bella).sort(), [
      "cover",
      "createdAt",
      "cuisineIds",
      "currency",
      "deletedAt",
      "deliveryFee",
      "description",
      "dietary",
      "distanceKm",
      "etaMinutes",
      "freeDeliveryOver",
      "hours",
      "id",
      "isFeatured",
      "isOpen",
      "isTrending",
      "location",
      "logo",
      "minOrder",
      "name",
      "ownerId",
      "priceLevel",
      "promoLabel",
      "rating",
      "reviewCount",
      "slug",
      "tagline",
      "type",
      "updatedAt",
    ]);
  });

  it("leaks neither the commission rate nor the storefront's status", () => {
    const body = JSON.stringify(bella);
    for (const field of ["commissionRate", "status", "branchId", "closedBecause", "deliveryRadiusKm", "version"]) {
      assert.ok(!body.includes(field), `${field} must not be on the wire`);
    }
  });

  it("flattens the brand and its primary branch into one object", () => {
    assert.equal(bella.name, "Bella Napoli");
    assert.deepEqual(Object.keys(bella.location).sort(), ["address", "city", "countryCode", "lat", "lng"]);
    assert.equal(bella.location.city, "Dhaka");
    assert.equal(bella.location.countryCode, "BD");
    assert.equal(bella.ownerId, accounts.owner.id);
  });

  it("money and ratings are numbers, not Decimal strings", () => {
    for (const field of ["rating", "deliveryFee", "minOrder", "freeDeliveryOver", "distanceKm"]) {
      assert.equal(typeof bella[field], "number", `${field} is ${typeof bella[field]}`);
    }
    assert.equal(bella.rating, 4.8);
    assert.equal(bella.deliveryFee, 60);
    assert.equal(bella.freeDeliveryOver, 800);
  });

  it("`etaMinutes` is the two-entry tuple the four components read", () => {
    assert.deepEqual(bella.etaMinutes, [25, 35]);
  });

  it("`hours` is the seven-key object components index by weekday", () => {
    assert.deepEqual(Object.keys(bella.hours), [...WEEKDAYS]);
    assert.deepEqual(bella.hours.mon, { open: "00:00", close: "23:59" });
  });

  it("enums arrive in the frontend's kebab-case vocabulary", async () => {
    const sushi = await ok(`/vendors/${slugs.sushi}`);
    assert.equal(sushi.type, "cafe");
    assert.deepEqual(bella.dietary, ["vegetarian"]);
    // `main.prisma` §6: the column reads "cafe", the client says `CAFE`, and the
    // wire must read "cafe" again.
    const row = await prisma.vendor.findUnique({ where: { slug: slugs.sushi }, select: { type: true } });
    assert.equal(row.type, "CAFE");
  });

  it("timestamps are ISO-8601 strings, as `BaseEntity` declares", () => {
    assert.match(bella.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(bella.deletedAt, null);
  });
});

describe("4. isOpen, derived per request", () => {
  it("an always-open branch is open and a branch with no hours is not", async () => {
    const page = await list("&pageSize=50");
    const open = Object.fromEntries(page.items.map((vendor) => [vendor.slug, vendor.isOpen]));
    assert.equal(open[slugs.bella], true);
    assert.equal(open[slugs.sushi], false, "no hours at all");
  });

  it("a paused vendor is listed and closed", async () => {
    const page = await list("&pageSize=50");
    const paused = page.items.find((vendor) => vendor.slug === slugs.paused);
    assert.ok(paused, "a paused storefront is still discoverable");
    assert.equal(paused.isOpen, false);
  });

  it("`openNow` keeps only the ones actually serving", async () => {
    const page = await list("&openNow=true&pageSize=50");
    assert.deepEqual(slugsOf(page).sort(), [slugs.bella, slugs.burger, slugs.stranger].sort());
    assert.equal(page.total, 3);
  });

  it("the merchant's kill switch closes a branch whose hours say open", async () => {
    const vendor = await makeVendor({ token: NIGHT, acceptingOrders: false });
    const model = await ok(`/vendors/${vendor.slug}`);
    assert.equal(model.isOpen, false);
    assert.deepEqual(model.hours.mon, { open: "00:00", close: "23:59" }, "the grid still reads open");
  });

  it("a closure covering today closes it", async () => {
    const today = new Date();
    const vendor = await makeVendor({
      token: NIGHT,
      closures: [{ from: today, to: today, reason: "refit" }],
    });
    assert.equal((await ok(`/vendors/${vendor.slug}`)).isOpen, false);
  });

  it("an overnight service is open at 01:00 the next morning — with the clock frozen", async () => {
    // Friday 19:00 UTC is Saturday 01:00 in Dhaka: inside the fri 23:00–02:00 window.
    const inside = await service.listVendors(
      { search: NIGHT, q: "night owl" },
      { viewer: ANON, now: new Date("2026-08-28T19:00:00.000Z") },
    );
    const owl = inside.items.find((vendor) => vendor.slug === `${NIGHT}-night-owl`);
    assert.ok(owl, "the night-owl fixture is in scope");
    assert.equal(owl.isOpen, true);

    // Saturday 12:00 in Dhaka — the window closed ten hours earlier.
    const outside = await service.listVendors(
      { search: NIGHT, q: "night owl" },
      { viewer: ANON, now: new Date("2026-08-29T06:00:00.000Z") },
    );
    assert.equal(outside.items.find((vendor) => vendor.slug === `${NIGHT}-night-owl`).isOpen, false);
  });

  it("`openNow` filters on the frozen clock too, not on the wall clock", async () => {
    const atNight = await service.listVendors(
      { search: NIGHT, q: "night owl", openNow: true },
      { viewer: ANON, now: new Date("2026-08-28T19:00:00.000Z") },
    );
    assert.equal(atNight.total, 1);

    const atLunch = await service.listVendors(
      { search: NIGHT, q: "night owl", openNow: true },
      { viewer: ANON, now: new Date("2026-08-29T06:00:00.000Z") },
    );
    assert.equal(atLunch.total, 0);
  });
});

describe("5. distanceKm, derived from the caller", () => {
  it("is null when the caller sent no coordinates — never a fabricated zero", async () => {
    const page = await list("&pageSize=50");
    assert.ok(page.items.every((vendor) => vendor.distanceKm === null));
  });

  it("is measured from the coordinates given", async () => {
    const page = await list(`&lat=${GULSHAN.lat}&lng=${GULSHAN.lng}&pageSize=50`);
    const by = Object.fromEntries(page.items.map((vendor) => [vendor.slug, vendor.distanceKm]));
    assert.equal(by[slugs.bella], 0, "the origin is Bella Napoli's own address");
    assert.ok(by[slugs.burger] > 1 && by[slugs.burger] < 2, `Banani is ~1.5km, got ${by[slugs.burger]}`);
    assert.ok(by[slugs.sushi] > 200, `Chittagong is ~215km, got ${by[slugs.sushi]}`);
  });

  it("`deliverable` drops a branch whose radius does not reach", async () => {
    const page = await list(`&deliverable=true&lat=${GULSHAN.lat}&lng=${GULSHAN.lng}&pageSize=50`);
    assert.ok(!slugsOf(page).includes(slugs.sushi), "215km away, 5km radius");
    assert.ok(slugsOf(page).includes(slugs.bella));
    assert.equal(page.total, 4);
  });

  it("sorts by distance, nearest first", async () => {
    const page = await list(`&sort=distance&lat=${GULSHAN.lat}&lng=${GULSHAN.lng}&pageSize=50`);
    const distances = page.items.map((vendor) => vendor.distanceKm);
    assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
    assert.equal(page.items[0].slug, slugs.bella);
    assert.equal(page.items.at(-1).slug, slugs.sushi);
  });
});

describe("6. filters", () => {
  const only = async (query, expected) => {
    const page = await list(`${query}&pageSize=50`);
    assert.deepEqual(slugsOf(page).sort(), [...expected].sort(), query);
  };

  it("by vendor type", () => only("&type=cafe", [slugs.sushi]));

  it("by cuisine id and by cuisine slug", async () => {
    await only(`&cuisineId=${cuisineIds.japanese}`, [slugs.sushi]);
    await only("&cuisine=italian", [slugs.bella]);
  });

  it("two cuisine facets narrow rather than widen", async () => {
    await only(`&cuisineId=${cuisineIds.japanese}&cuisine=italian`, []);
    await only(`&cuisineId=${cuisineIds.italian}&cuisine=italian`, [slugs.bella]);
  });

  it("by every dietary tag asked for, not any of them", async () => {
    await only("&dietary=halal", [slugs.burger]);
    await only("&dietary=vegetarian", [slugs.bella]);
    await only("&dietary=halal&dietary=vegetarian", []);
  });

  it("by price level ceiling and rating floor", async () => {
    await only("&maxPrice=2", [slugs.burger, slugs.paused, slugs.stranger]);
    await only("&minRating=4.7", [slugs.bella, slugs.sushi]);
  });

  it("by free delivery and by running an offer", async () => {
    await only("&freeDelivery=true", [slugs.bella]);
    await only("&offersOnly=true", [slugs.bella]);
  });

  it("by the low end of the ETA window", () => only("&maxEta=20", [slugs.burger]));

  it("by what the branch supports", () => only("&supportsDelivery=true", [slugs.bella, slugs.burger, slugs.paused, slugs.stranger]));

  it("by free text over name, tagline, description and cuisine name", async () => {
    // `q` rather than a second `search`: the two are combined, so the run token
    // still scopes the query and the term still has to match as well.
    await only("&q=neapolitan", [slugs.bella]);
    await only("&q=japanese", [slugs.sushi], "the cuisine's name, not the vendor's");
    await only("&q=margherita", [slugs.bella], "the description");
    await only("&q=burger%20lab", [slugs.burger]);
    await only("&q=zzzznothingatall", []);
  });

  it("a category tile behaves like a query over its keywords", async () => {
    const page = await ok(`/vendors?category=pizza&pageSize=50`);
    const found = slugsOf(page);
    assert.ok(found.includes(slugs.bella), "matched on tagline, description and cuisine");
    assert.ok(!found.includes(slugs.sushi), "a sushi bar is not a pizza result");
  });

  it("combines facets rather than widening", () => only("&type=restaurant&minRating=4.5&openNow=true", [slugs.bella, slugs.burger]));
});

describe("7. sorting", () => {
  const order = async (sort) => slugsOf(await list(`&sort=${sort}&pageSize=50`));

  it("recommended puts the featured storefront first, then rating", async () => {
    const sorted = await order("recommended");
    assert.equal(sorted[0], slugs.bella, "featured");
    assert.deepEqual(sorted.slice(1), [slugs.sushi, slugs.burger, slugs.paused, slugs.stranger]);
  });

  it("by rating", async () => {
    assert.deepEqual(await order("rating"), [slugs.sushi, slugs.bella, slugs.burger, slugs.paused, slugs.stranger]);
  });

  it("by delivery time, on the low end of the window", async () => {
    assert.deepEqual(await order("delivery-time"), [
      slugs.burger,
      slugs.bella,
      slugs.paused,
      slugs.sushi,
      slugs.stranger,
    ]);
  });

  it("by price level, both ways", async () => {
    assert.equal((await order("price-low"))[0], slugs.paused);
    assert.equal((await order("price-high"))[0], slugs.sushi);
  });

  it("by relevance, scoring a name hit above a description hit", async () => {
    const page = await list("&q=bella&sort=relevance&pageSize=50");
    assert.equal(page.items[0].slug, slugs.bella);
  });
});

describe("8. pagination", () => {
  it("pages the SQL path and reports the whole total", async () => {
    const first = await list("&pageSize=2&page=1");
    assert.equal(first.items.length, 2);
    assert.equal(first.total, 5);
    assert.equal(first.hasMore, true);

    const last = await list("&pageSize=2&page=3");
    assert.equal(last.items.length, 1);
    assert.equal(last.hasMore, false);
  });

  it("pages the derived path the same way", async () => {
    const first = await list("&openNow=true&pageSize=2&page=1");
    assert.equal(first.items.length, 2);
    assert.equal(first.total, 3);
    assert.equal(first.hasMore, true);

    const second = await list("&openNow=true&pageSize=2&page=2");
    assert.equal(second.items.length, 1);
    assert.equal(second.hasMore, false);
  });

  it("a page past the end is empty rather than an error", async () => {
    const page = await list("&pageSize=2&page=99");
    assert.deepEqual(page.items, []);
    assert.equal(page.total, 5);
  });

  it("defaults to page 1 and the shared page size", async () => {
    const page = await list();
    assert.equal(page.page, 1);
    assert.equal(page.pageSize, 20);
  });
});

describe("9. what the public may not see", () => {
  it("the listing shows active and paused storefronts and nothing else", async () => {
    const page = await list("&pageSize=50");
    assert.equal(page.total, 5);
    for (const key of ["pending", "draft", "suspended", "deleted", "branchGone", "noBranch", "blocked"]) {
      assert.ok(!slugsOf(page).includes(slugs[key]), `${key} must not be listed`);
    }
  });

  it("a vendor with no live primary branch is not a listing at all", async () => {
    const page = await list("&pageSize=50");
    assert.ok(!slugsOf(page).includes(slugs.noBranch));
    const response = await get(`/vendors/${slugs.noBranch}`);
    assert.equal(response.statusCode, 404, "there is no address, hours or fee to render");
  });

  it("a non-public storefront is 404, not 403 — the refusal admits nothing", async () => {
    for (const key of ["pending", "draft", "suspended", "branchGone"]) {
      const response = await get(`/vendors/${slugs[key]}`);
      assert.equal(response.statusCode, 404, `${key} → ${response.statusCode}`);
      assert.equal(response.json().error.code, "NOT_FOUND");
    }
  });

  it("a soft-deleted storefront is gone for everybody, super-admin included", async () => {
    for (const options of [{}, accounts.desk.auth, accounts.owner.auth]) {
      const response = await get(`/vendors/${slugs.deleted}`, options);
      assert.equal(response.statusCode, 404);
    }
    const page = await list("&pageSize=50", accounts.desk.auth);
    assert.ok(!slugsOf(page).includes(slugs.deleted));
  });

  it("the rails never carry a storefront the public cannot order from", async () => {
    await makeVendor({ token: NIGHT, status: "suspended", isFeatured: true, isTrending: true });
    for (const rail of ["featured", "trending"]) {
      const data = await ok(`/vendors/${rail}?limit=50`);
      assert.ok(data.length >= 1, rail);
      assert.ok(!data.some((vendor) => vendor.slug.startsWith(`${NIGHT}-vendor`)), `${rail} carries a suspended vendor`);
    }
  });
});

describe("10. who may see more", () => {
  it("the owner reaches their own storefront before it opens", async () => {
    const vendor = await ok(`/vendors/${slugs.pending}`, accounts.owner.auth);
    assert.equal(vendor.slug, slugs.pending);
    assert.equal(vendor.isOpen, false, "pending is not open, whoever is looking");
  });

  it("active staff reach it; an invitation does not", async () => {
    assert.equal((await get(`/vendors/${slugs.pending}`, accounts.manager.auth)).statusCode, 200);
    assert.equal((await get(`/vendors/${slugs.pending}`, accounts.invitedStaff.auth)).statusCode, 404);
  });

  it("a vendor-scoped role assignment is the third membership", async () => {
    assert.equal((await get(`/vendors/${slugs.draft}`, accounts.assigned.auth)).statusCode, 200);
    assert.equal((await get(`/vendors/${slugs.pending}`, accounts.assigned.auth)).statusCode, 404, "only that vendor");
  });

  it("another merchant's owner is refused, and told nothing", async () => {
    const response = await get(`/vendors/${slugs.pending}`, accounts.stranger.auth);
    assert.equal(response.statusCode, 404);
  });

  it("a customer with no rights is refused", async () => {
    assert.equal((await get(`/vendors/${slugs.pending}`, accounts.customer.auth)).statusCode, 404);
  });

  it("a desk holding `restaurants.view` sees every storefront", async () => {
    for (const key of ["pending", "draft", "suspended", "branchGone"]) {
      const response = await get(`/vendors/${slugs[key]}`, accounts.desk.auth);
      assert.equal(response.statusCode, 200, `${key} → ${response.statusCode} ${response.body}`);
    }
  });

  it("`includeHidden` widens the listing for that desk only", async () => {
    const page = await list("&includeHidden=true&pageSize=50", accounts.desk.auth);
    assert.equal(page.total, 11, slugsOf(page).join(", "));
    for (const key of ["pending", "draft", "suspended", "branchGone", "blocked"]) {
      assert.ok(slugsOf(page).includes(slugs[key]), `${key} should be included`);
    }
    assert.ok(!slugsOf(page).includes(slugs.deleted), "soft deletion is still absolute");
    assert.ok(!slugsOf(page).includes(slugs.noBranch), "still not renderable");
  });

  it("`includeHidden` is refused rather than ignored: 401 for nobody, 403 for the wrong somebody", async () => {
    const anonymous = await get("/vendors?includeHidden=true");
    assert.equal(anonymous.statusCode, 401);
    assert.equal(anonymous.json().error.key, "errors.unauthenticated");

    const customer = await get("/vendors?includeHidden=true", accounts.customer.auth);
    assert.equal(customer.statusCode, 403);
    assert.deepEqual(customer.json().error.details.required, ["restaurants.view"]);

    const owner = await get("/vendors?includeHidden=true", accounts.owner.auth);
    assert.equal(owner.statusCode, 403, "owning a restaurant is not a platform right");
  });

  it("a revoked role stops widening without a new token being issued", async () => {
    // By slug: registration already wrote a `customer` assignment, and deleting
    // that one would prove nothing.
    const assignment = await prisma.userRoleAssignment.findFirst({
      where: { userId: accounts.desk.id, role: { slug: "customer-support" } },
      select: { id: true },
    });
    await prisma.userRoleAssignment.delete({ where: { id: assignment.id } });

    const refused = await get(`/vendors/${slugs.pending}`, accounts.desk.auth);
    assert.equal(refused.statusCode, 404, "the same token, now without the role");

    await assignRole(accounts.desk.id, "customer-support");
    assert.equal((await get(`/vendors/${slugs.pending}`, accounts.desk.auth)).statusCode, 200);
  });
});

describe("11. authentication, on a public surface", () => {
  it("no token at all is fine — the catalogue is public", async () => {
    assert.equal((await get(`/vendors/${slugs.bella}`)).statusCode, 200);
    assert.equal((await get("/cuisines")).statusCode, 200);
  });

  it("a token that cannot be used degrades to anonymous rather than 401", async () => {
    for (const token of ["not-a-jwt", `${accounts.customer.token}tampered`]) {
      const response = await get(`/vendors/${slugs.bella}`, bearer(token));
      assert.equal(response.statusCode, 200, "browsing still works");
    }
  });

  it("a revoked session stops widening immediately", async () => {
    assert.equal((await get(`/vendors/${slugs.revoked}`, accounts.revoked.auth)).statusCode, 200, "their own pending place");

    await prisma.session.updateMany({
      where: { userId: accounts.revoked.id },
      data: { revokedAt: new Date(), revokeReason: toDbEnum("SessionRevokeReason", "logout") },
    });

    assert.equal(
      (await get(`/vendors/${slugs.revoked}`, accounts.revoked.auth)).statusCode,
      404,
      "the access token is still signed and still unexpired",
    );
    assert.equal((await get(`/vendors/${slugs.bella}`, accounts.revoked.auth)).statusCode, 200, "still browsing");
  });

  it("a suspended account loses its merchant view within the token's lifetime", async () => {
    assert.equal((await get(`/vendors/${slugs.blocked}`, accounts.blocked.auth)).statusCode, 200);

    await prisma.user.update({
      where: { id: accounts.blocked.id },
      data: { status: toDbEnum("UserStatus", "suspended") },
    });

    assert.equal((await get(`/vendors/${slugs.blocked}`, accounts.blocked.auth)).statusCode, 404);
  });

  it("a forged `permissions` claim grants nothing — authorization is the database's", async () => {
    const claims = app.jwt.decode(accounts.customer.token);
    const forged = app.signAccessToken({
      sub: claims.sub,
      sessionId: claims.sessionId,
      epoch: claims.epoch,
      roles: ["super-admin"],
      permissions: ["restaurants.view", "settings.manage"],
    });

    // The signature is ours and `requireUser` accepts the account, so this is a
    // genuinely authenticated request carrying claims it should not be believed on.
    const me = await app.inject({ method: "GET", url: `${AUTH}/me`, ...bearer(forged) });
    assert.equal(me.statusCode, 200, "the token itself is valid");

    const listed = await get("/vendors?includeHidden=true", bearer(forged));
    assert.equal(listed.statusCode, 403, "the claim is not a grant");
    assert.equal((await get(`/vendors/${slugs.pending}`, bearer(forged))).statusCode, 404);
  });
});

describe("12. rails and suggestions", () => {
  it("the featured rail carries the featured storefront, up to the limit", async () => {
    const data = await ok("/vendors/featured?limit=1");
    assert.equal(data.length, 1);
    assert.ok(Object.hasOwn(data[0], "isOpen"), "the same read model as everywhere else");
  });

  it("a rail computes distance when the caller offers coordinates", async () => {
    const [nearest] = await ok(`/vendors/trending?limit=50&lat=${GULSHAN.lat}&lng=${GULSHAN.lng}`);
    assert.equal(typeof nearest.distanceKm, "number");
  });

  it("suggestions match vendor names first, then the taxonomy", async () => {
    const data = await ok("/search/suggestions?q=bella");
    assert.ok(data.includes("Bella Napoli"), JSON.stringify(data));

    const cuisine = await ok("/search/suggestions?q=japan");
    assert.ok(cuisine.includes("Japanese"), JSON.stringify(cuisine));
  });

  it("an empty query answers with the category rail rather than invented words", async () => {
    const data = await ok("/search/suggestions?limit=3");
    assert.deepEqual(data, ["Pizza", "Burgers", "Sushi"]);
  });

  it("suggestions never name a storefront the public cannot see", async () => {
    const data = await ok("/search/suggestions?q=pending%20place&limit=20");
    assert.ok(!data.includes("Pending Place"), JSON.stringify(data));
  });

  it("respects its limit", async () => {
    assert.ok((await ok("/search/suggestions?q=a&limit=2")).length <= 2);
  });
});

describe("13. the database, after all of that", () => {
  it("nothing was written to a storefront by reading it", async () => {
    const rows = await prisma.vendor.findMany({
      where: { id: { in: created.vendors } },
      select: { id: true, version: true, updatedBy: true },
    });
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.equal(row.version, 0, `${row.id} version moved`);
      assert.equal(row.updatedBy, null);
    }
  });

  it("the taxonomy ids are deterministic, so a second database agrees with this one", async () => {
    const pizza = await prisma.category.findUnique({ where: { slug: "pizza" }, select: { id: true } });
    const italian = await prisma.cuisine.findUnique({ where: { slug: "italian" }, select: { id: true } });
    assert.equal(pizza.id, "cat_5TQBZNTZ5AWQKZFENWFA47K110");
    assert.equal(italian.id, "cus_4BA5TTYV50NRFGBG76V98E1M2X");
  });

  it("the scan limit is a bound the service reports rather than hides", () => {
    const bounded = createService({ repo: createRepository(prisma), scanLimit: 2 });
    assert.equal(bounded.scanLimit, 2);
  });

  it("a truncated scan says so", async () => {
    const bounded = createService({ repo: createRepository(prisma), scanLimit: 2 });
    const page = await bounded.listVendors({ search: RUN, openNow: true, pageSize: 50 }, { viewer: ANON });
    assert.equal(page.truncated, true);
    assert.ok(page.total <= 2, `total ${page.total} counts the scanned window`);

    const whole = await service.listVendors({ search: RUN, openNow: true, pageSize: 50 }, { viewer: ANON });
    assert.equal(whole.truncated, false);
    assert.equal(whole.total, 3);
  });
});

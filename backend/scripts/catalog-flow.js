#!/usr/bin/env node
/**
 * catalog-flow.js — the module 4 discovery journey, driven over a real socket.
 *
 * The same standard `auth-flow.js` sets and for the same reason: unit tests are
 * not a module being complete. This binds a port, speaks HTTP with `fetch`, and
 * walks the path a customer's browser actually walks —
 *
 *   the cuisine grid → the craving rail → the directory → a facet → a search
 *   → one storefront → the merchant's own view of one that has not opened
 *
 * — against real PostgreSQL, with the taxonomy seeded by the real seeder.
 *
 * What it adds over `tests/catalog.test.js`, which covers the same ground through
 * `app.inject()`:
 *
 *  - the wire, not the injection path: real status codes, real JSON, real query
 *    strings including the array form (`?dietary=halal&dietary=vegan`);
 *  - the **rate limiter on**, because `npm test` turns it off and a public
 *    discovery endpoint is the one place a limiter that fired too eagerly would
 *    break ordinary browsing;
 *  - the storefront it creates is a *live* one: open right now, in Dhaka, so the
 *    open/closed answer is the one the clock gives rather than one a frozen
 *    instant was chosen to produce.
 *
 * It leaves nothing behind. The two vendors and the two accounts are hard-deleted
 * at the end, cascades taking branches, hours, cuisines, staff, sessions and
 * credentials. The taxonomy stays, because it is reference data and the seeder is
 * idempotent.
 *
 *     npm run catalog:flow
 */
process.env.NODE_ENV ??= "development";
process.env.LOG_LEVEL ??= "silent";
/**
 * Module 3's permission cache off, and the rate limiter left **on**.
 *
 * The two knobs go opposite ways on purpose. The limiter stays on because a
 * public discovery endpoint is exactly where one that fired too eagerly would
 * break ordinary browsing, and `npm test` cannot see that.
 *
 * The authorization cache goes off because step 7 grants a role and then reuses
 * the token already in hand. With the default `AUTHZ_CACHE_TTL_MS=5000` that
 * check has to wait out five seconds — which is module 3's documented
 * consistency bound, covered by module 3's own tests, and not a statement about
 * the catalog. Sleeping through it in a gate that runs on every verify would buy
 * nothing.
 */
process.env.AUTHZ_CACHE_TTL_MS ??= "0";

const { buildApp } = await import("../src/app.js");
const { default: env } = await import("../src/config/env.js");
const { seedCatalogTaxonomy } = await import("../src/seed/catalog.js");
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

async function call(path, { token } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${path}`, { headers });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  return { status: response.status, body: payload };
}

const app = await buildApp();
await app.listen({ host: "127.0.0.1", port: 0 });
const origin = `http://127.0.0.1:${app.server.address().port}`;
base = `${origin}${env.apiPrefix}/catalog`;

const prisma = app.prisma;
const stamp = Date.now().toString(36);
const RUN = `flow${stamp}`;
const GULSHAN = { lat: 23.7806, lng: 90.4152 };
const BANANI = { lat: 23.7925, lng: 90.4078 };

const fixtureId = (prefix) => `${prefix}${ulid()}`;
const vendors = [];
const users = [];

/** Register through the real endpoint — the flow needs a usable token, not a row. */
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

/** A storefront that is open right now, wherever "now" is. */
async function makeVendor({ slug, name, tagline, status, ownerId = null, cuisineSlug, at, rating, featured = false }) {
  const id = fixtureId("ven_");
  const cuisine = cuisineSlug
    ? await prisma.cuisine.findUnique({ where: { slug: cuisineSlug }, select: { id: true } })
    : null;

  await prisma.vendor.create({
    data: {
      id,
      slug,
      name,
      tagline,
      description: `Created by catalog-flow ${RUN}`,
      type: toDbEnum("VendorTypeKind", "restaurant"),
      status: toDbEnum("VendorStatus", status),
      ownerId,
      currency: "BDT",
      priceLevel: 2,
      rating,
      reviewCount: 100,
      isFeatured: featured,
      isTrending: featured,
      promoLabel: featured ? "20% off" : null,
      ...(cuisine ? { cuisines: { create: [{ cuisineId: cuisine.id, sort: 0 }] } } : {}),
      dietary: { create: [{ tag: toDbEnum("DietaryTagKind", "halal") }] },
    },
    select: { id: true },
  });
  vendors.push(id);

  await prisma.vendorBranch.create({
    data: {
      id: fixtureId("vbr_"),
      vendorId: id,
      isPrimary: true,
      name,
      slug: "main",
      lat: String(at.lat),
      lng: String(at.lng),
      address: `${name} Road, Dhaka`,
      city: "Dhaka",
      countryCode: "BD",
      timezone: "Asia/Dhaka",
      etaMinMinutes: 25,
      etaMaxMinutes: 40,
      deliveryFee: "60.00",
      minOrder: "300.00",
      freeDeliveryOver: "800.00",
      deliveryRadiusKm: "8.00",
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

  return { id, slug };
}

try {
  console.log(`FoodOra — module 4 catalog & discovery against ${base}\n`);

  // -- 1. Reference data ----------------------------------------------------
  step("1. The taxonomy");
  {
    const counts = await seedCatalogTaxonomy({ prisma, logger: { info: () => {} } });
    check("the seeder runs against this database", counts.cuisines === 8 && counts.categories === 10);

    const cuisines = await call("/cuisines");
    check("the cuisine grid answers", cuisines.status === 200 && cuisines.body.data.length >= 8);
    check("in its own sort order", cuisines.body.data[0].slug === "italian");
    check(
      "and is exactly `types/catalog.ts::Cuisine`",
      Object.keys(cuisines.body.data[0]).sort().join(",") ===
        "createdAt,deletedAt,emoji,id,image,name,slug,updatedAt",
    );

    const categories = await call("/categories");
    const pizza = categories.body.data.find((category) => category.slug === "pizza");
    check("the craving rail answers", categories.status === 200 && Boolean(pizza));
    check("a tile carries the keywords that make it a query", pizza.keywords.includes("margherita"));
  }

  // -- 2. Two storefronts ---------------------------------------------------
  step("2. Two storefronts, one of them not open for business yet");
  const merchant = await signUp("restaurant-owner", "Flow Merchant");
  const customer = await signUp("customer", "Flow Customer");

  const live = await makeVendor({
    slug: `${RUN}-open-house`,
    name: "Open House",
    tagline: "Wood-fired pizza, all day",
    status: "active",
    ownerId: merchant.id,
    cuisineSlug: "italian",
    at: GULSHAN,
    rating: "4.70",
    featured: true,
  });

  const pending = await makeVendor({
    slug: `${RUN}-not-yet`,
    name: "Not Yet",
    tagline: "Opening soon",
    status: "pending",
    ownerId: merchant.id,
    at: BANANI,
    rating: "4.10",
  });

  check("an active storefront exists", Boolean(live.id));
  check("and a pending one, owned by the same merchant", Boolean(pending.id));

  // -- 3. Browsing, as anybody ---------------------------------------------
  step("3. The directory, anonymously");
  {
    const page = await call(`/vendors?search=${RUN}&pageSize=10`);
    check("the directory answers 200 with no token at all", page.status === 200);
    const found = page.body.data.items.map((vendor) => vendor.slug);
    check("it lists the active storefront", found.includes(live.slug));
    check("and not the pending one", !found.includes(pending.slug), found.join(", "));
    check("the envelope is `Paginated<Vendor>`", page.body.data.total === 1 && page.body.data.hasMore === false);

    const [vendor] = page.body.data.items;
    check("`isOpen` is derived and true — the branch is serving right now", vendor.isOpen === true);
    check("`distanceKm` is null without coordinates, not zero", vendor.distanceKm === null);
    check("`etaMinutes` is a two-entry tuple", Array.isArray(vendor.etaMinutes) && vendor.etaMinutes.length === 2);
    check("`hours` is the seven-key weekly object", Object.keys(vendor.hours).length === 7);
    check("money is a number, not a Decimal string", typeof vendor.deliveryFee === "number");
    check(
      "the commission rate is nowhere on the wire",
      !JSON.stringify(vendor).includes("commissionRate") && !JSON.stringify(vendor).includes("status"),
    );
  }

  step("4. Facets, distance and text");
  {
    const near = await call(`/vendors?search=${RUN}&lat=${GULSHAN.lat}&lng=${GULSHAN.lng}`);
    check("distance is measured from the coordinates given", near.body.data.items[0].distanceKm === 0);

    const openNow = await call(`/vendors?search=${RUN}&openNow=true`);
    check("`openNow` keeps a storefront that is serving", openNow.body.data.total === 1);

    const italian = await call(`/vendors?search=${RUN}&cuisine=italian`);
    check("a cuisine slug narrows the list", italian.body.data.total === 1);

    const wrongCuisine = await call(`/vendors?search=${RUN}&cuisine=japanese`);
    check("and narrows it to nothing when it should", wrongCuisine.body.data.total === 0);

    const dietary = await call(`/vendors?search=${RUN}&dietary=halal&dietary=vegan`);
    check("every dietary tag is required, not any of them", dietary.body.data.total === 0);

    const text = await call(`/vendors?search=${RUN}&q=wood-fired`);
    check("free text matches the tagline", text.body.data.total === 1);

    const nothing = await call(`/vendors?search=${RUN}&q=zzzznothing`);
    check("and matches nothing when there is nothing", nothing.body.data.total === 0);

    const tile = await call("/vendors?category=pizza&pageSize=50");
    check(
      "the pizza tile resolves through its keywords",
      tile.body.data.items.some((vendor) => vendor.slug === live.slug),
    );

    const rail = await call("/vendors/featured?limit=50");
    check("the featured rail carries it", rail.body.data.some((vendor) => vendor.slug === live.slug));

    const suggestions = await call("/search/suggestions?q=open%20house");
    check("type-ahead finds it by name", suggestions.body.data.includes("Open House"));
    check(
      "and never names the storefront that has not opened",
      !(await call("/search/suggestions?q=not%20yet")).body.data.includes("Not Yet"),
    );
  }

  step("5. One storefront");
  {
    const found = await call(`/vendors/${live.slug}?lat=${GULSHAN.lat}&lng=${GULSHAN.lng}`);
    check("it answers by slug", found.status === 200 && found.body.data.slug === live.slug);
    check("with the merchant's own account id, which the dashboard reads", found.body.data.ownerId === merchant.id);

    const missing = await call(`/vendors/${RUN}-no-such-place`);
    check("an unknown slug is 404 in the error contract", missing.status === 404 && missing.body.error.code === "NOT_FOUND");
    check("with the i18n key the client renders", missing.body.error.key === "errors.notFound");

    const bad = await call("/vendors/Not%20A%20Slug");
    check("a slug that is not slug-shaped is refused before the database", bad.status === 400);
  }

  // -- 6. Who may see more --------------------------------------------------
  step("6. The merchant's own view, and the refusals");
  {
    const anonymous = await call(`/vendors/${pending.slug}`);
    check("a pending storefront is 404 to the public — not 403", anonymous.status === 404);

    const asCustomer = await call(`/vendors/${pending.slug}`, { token: customer.token });
    check("and 404 to a signed-in customer", asCustomer.status === 404);

    const asOwner = await call(`/vendors/${pending.slug}`, { token: merchant.token });
    check("the owner reaches it", asOwner.status === 200 && asOwner.body.data.slug === pending.slug);
    check("and it is not open, whoever is looking", asOwner.body.data.isOpen === false);

    const hiddenAnon = await call("/vendors?includeHidden=true");
    check("`includeHidden` without a token is 401", hiddenAnon.status === 401);

    const hiddenCustomer = await call("/vendors?includeHidden=true", { token: customer.token });
    check("with the wrong token it is 403", hiddenCustomer.status === 403);
    check(
      "and it names the permission it wanted, not the caller's rights",
      hiddenCustomer.body.error.details.required[0] === "restaurants.view" &&
        !JSON.stringify(hiddenCustomer.body).includes("orders.view"),
    );

    const hiddenOwner = await call("/vendors?includeHidden=true", { token: merchant.token });
    check("owning a restaurant is not a platform right", hiddenOwner.status === 403);

    const garbage = await call(`/vendors/${live.slug}`, { token: "not-a-jwt" });
    check("an unusable token still browses, as anonymous", garbage.status === 200);
  }

  // -- 7. The desk ----------------------------------------------------------
  step("7. A desk that holds `restaurants.view`");
  {
    const role = await prisma.role.findUnique({ where: { slug: "customer-support" }, select: { id: true } });
    const { newId } = await import("../src/shared/utils/ids.js");
    const { ID_PREFIXES } = await import("../src/shared/constants/id-prefixes.js");
    await prisma.userRoleAssignment.create({
      data: { id: newId(ID_PREFIXES.userRoleAssignment), userId: customer.id, roleId: role.id },
      select: { id: true },
    });

    // The same token as two steps ago. Nothing was re-issued.
    const detail = await call(`/vendors/${pending.slug}`, { token: customer.token });
    check("the role takes effect on the token already in hand", detail.status === 200);

    const page = await call(`/vendors?search=${RUN}&includeHidden=true&pageSize=50`, { token: customer.token });
    check("`includeHidden` now widens the listing", page.status === 200 && page.body.data.total === 2);
    check(
      "and shows both statuses",
      page.body.data.items.map((vendor) => vendor.slug).sort().join(",") === [live.slug, pending.slug].sort().join(","),
    );
  }

  // -- 8. What was written --------------------------------------------------
  step("8. What all that reading wrote");
  {
    const rows = await prisma.vendor.findMany({
      where: { id: { in: vendors } },
      select: { version: true, updatedBy: true, status: true },
    });
    check("no storefront was modified by being read", rows.every((row) => row.version === 0 && row.updatedBy === null));
    check("`isOpen` is nowhere in the table — it is derived every time", !Object.keys(rows[0]).includes("isOpen"));

    const limited = await call(`/vendors?search=${RUN}`);
    check("the rate limiter, which is on here, does not fire on ordinary browsing", limited.status === 200);
  }
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

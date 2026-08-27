/**
 * authz.test.js — module 3, against real PostgreSQL and the real seeded RBAC.
 *
 * STEP 16 asks that authorization be proved against the actual `roles`,
 * `permissions`, `role_permissions` and `user_role_assignments` rows rather than
 * against a fixture that agrees with the implementation, so nothing here is
 * mocked. The seeder's fourteen roles, twenty permissions and fifty-four grants
 * are read as they stand, and §"the seeded configuration" asserts the numbers
 * before anything else runs — a suite that silently tested an empty catalogue
 * would pass every "is refused" case for the wrong reason.
 *
 * ## How an account gets a role it cannot register with
 *
 * Registration offers three roles (`customer`, `restaurant-owner`,
 * `delivery-rider`) and that closed list is itself one of the security cases
 * below. Every other role is written straight into `user_role_assignments` with
 * Prisma — which is not a shortcut but the point: the account's **token never
 * changes**. A customer's access token, minted before the row existed and
 * carrying `permissions: []`, starts passing `orders.view` the moment support's
 * role is assigned and stops the moment it is taken away. That is the whole of
 * "database-backed authorization is authoritative", and it cannot be
 * demonstrated any other way.
 *
 * ## `AUTHZ_CACHE_TTL_MS=0`
 *
 * Set by the `test` script, so every assertion here is a statement about the
 * database rather than about a `Map`. The cache is covered separately in
 * §"the permission cache", by building a service with a TTL over the same
 * `app.prisma`.
 *
 * ## Cleanup
 *
 * Accounts are created with a per-run email prefix and hard-deleted through
 * `$unfiltered()` afterwards — the extension refuses `delete` on soft-deletable
 * models, which is what it is for. Cascades take credentials, sessions, role
 * assignments, direct permissions and staff rows; vendors and the one custom
 * role are removed by hand because nothing owns them.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ulid } from "ulid";
import { buildApp } from "../src/app.js";
import { createRepository } from "../src/modules/authz/repository.js";
import { createService } from "../src/modules/authz/service.js";
import { normalise } from "../src/modules/authz/policy.js";
import { ID_PREFIXES } from "../src/shared/constants/id-prefixes.js";
import { newId } from "../src/shared/utils/ids.js";
import { toDbEnum } from "../src/shared/utils/enums.js";

const RUN = `m3-${Date.now().toString(36)}`;
const PASSWORD = "correct horse battery staple";
const AUTH = "/api/v1/auth";
const BASE = "/api/v1/_authz";

let app;
let prisma;
let seq = 0;

/**
 * The service, built over the running app's own Prisma client.
 *
 * Not `app.authz`: module 2 and module 3 are both `fastify-plugin`-wrapped
 * *inside* the versioned route table, so their decorators live on that instance
 * — which is exactly where every future module mounts and therefore exactly
 * where they are wanted, but it is not reachable from the root handle a test
 * holds. Building one here is the same code over the same connection, and the
 * TTL is zero so nothing below is answered from a cache.
 *
 * The app's *own* instance is exercised too, through every route in this file.
 */
let authz;
/** The two vocabularies, as `index.js` reads them at boot. */
let catalogue;

/**
 * An id for a fixture row in a table module 3 does not write.
 *
 * Not `newId`: `shared/constants/id-prefixes.js` is deliberately the list of
 * prefixes this backend *mints*, and a vendor fixture in an authorization test
 * is not the vendor module landing. The shape is the same one `newId` produces.
 */
const fixtureId = (prefix) => `${prefix}${ulid()}`;

const bearer = (token) => ({ headers: { authorization: `Bearer ${token}` } });
const get = (path, options = {}) => app.inject({ method: "GET", url: `${BASE}${path}`, ...options });

/** Register an account and keep everything a later assertion might need. */
async function signUp(role = "customer") {
  seq += 1;
  const email = `${RUN}-${seq}@example.test`;
  const response = await app.inject({
    method: "POST",
    url: `${AUTH}/register`,
    payload: { name: `Module 3 Account ${seq}`, email, password: PASSWORD, role },
  });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json();
  assert.equal(body.success, true, response.body);
  return {
    id: body.data.user.id,
    email,
    token: body.data.accessToken,
    user: body.data.user,
    auth: bearer(body.data.accessToken),
  };
}

// ---------------------------------------------------------------------------
// Writing the RBAC rows directly — see the header
// ---------------------------------------------------------------------------

const roleIdOf = async (slug) => (await prisma.role.findUnique({ where: { slug }, select: { id: true } })).id;
const permissionIdOf = async (slug) =>
  (await prisma.permission.findUnique({ where: { slug }, select: { id: true } })).id;

async function assignRole(userId, slug, { vendorId = null, expiresAt = null } = {}) {
  const row = await prisma.userRoleAssignment.create({
    data: { id: newId(ID_PREFIXES.userRoleAssignment), userId, roleId: await roleIdOf(slug), vendorId, expiresAt },
    select: { id: true },
  });
  return row.id;
}

async function grant(userId, slug, { effect = true, vendorId = null, expiresAt = null } = {}) {
  const row = await prisma.userPermission.create({
    data: {
      id: newId(ID_PREFIXES.userPermission),
      userId,
      permissionId: await permissionIdOf(slug),
      effect,
      vendorId,
      expiresAt,
    },
    select: { id: true },
  });
  return row.id;
}

const deny = (userId, slug, options = {}) => grant(userId, slug, { ...options, effect: false });

/** A vendor with an owner, and optionally some staff. */
async function makeVendor({ ownerId = null } = {}) {
  seq += 1;
  const id = fixtureId("ven_");
  await prisma.vendor.create({
    data: {
      id,
      slug: `${RUN}-vendor-${seq}`,
      type: toDbEnum("VendorTypeKind", "restaurant"),
      ownerId,
      name: `Module 3 Vendor ${seq}`,
      currency: "BDT",
    },
    select: { id: true },
  });
  return id;
}

async function makeStaff({ vendorId, userId, role = "manager", status = "active", branchId = null }) {
  const id = fixtureId("vst_");
  await prisma.vendorStaff.create({
    data: {
      id,
      vendorId,
      userId,
      branchId,
      role: toDbEnum("StaffRoleKind", role),
      status: toDbEnum("StaffStatusKind", status),
    },
    select: { id: true },
  });
  return id;
}

// ---------------------------------------------------------------------------
// Fixtures, built once
// ---------------------------------------------------------------------------

/** What the seeder says each role grants — the expectation §"seeded" compares against. */
const SEEDED_GRANTS = {
  customer: [],
  "restaurant-owner": [],
  "delivery-rider": [],
  moderator: ["customers.view", "orders.view", "restaurants.view", "reviews.moderate", "support.view"],
  "customer-support": [
    "customers.manage",
    "customers.view",
    "orders.manage",
    "orders.view",
    "refunds.manage",
    "restaurants.view",
    "riders.view",
    "support.manage",
    "support.view",
  ],
  "finance-manager": [
    "analytics.view",
    "audit.view",
    "orders.view",
    "payouts.manage",
    "payouts.view",
    "refunds.manage",
    "restaurants.view",
    "riders.view",
  ],
};

/** Every account this run creates, so the cleanup can find them. */
const created = [];
const vendors = [];
let customRoleId = null;

/** Shared, read-only accounts. Anything that mutates an account makes its own. */
let customer;
let support;
let admin;
let ownerA;
let ownerB;
let vendorA;
let vendorB;

before(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
  prisma = app.prisma;
  const repo = createRepository(prisma);
  authz = createService({ repo, ttlMs: 0 });
  catalogue = await repo.listCatalogue();

  customer = await signUp("customer");
  support = await signUp("customer");
  admin = await signUp("customer");
  ownerA = await signUp("restaurant-owner");
  ownerB = await signUp("restaurant-owner");
  created.push(customer, support, admin, ownerA, ownerB);

  await assignRole(support.id, "customer-support");
  await assignRole(admin.id, "super-admin");

  vendorA = await makeVendor({ ownerId: ownerA.id });
  vendorB = await makeVendor({ ownerId: ownerB.id });
  vendors.push(vendorA, vendorB);
});

after(async () => {
  const ids = created.map((account) => account.id);
  if (ids.length > 0) {
    await prisma.$unfiltered().userPermission.deleteMany({ where: { userId: { in: ids } } });
    await prisma.$unfiltered().userRoleAssignment.deleteMany({ where: { userId: { in: ids } } });
    await prisma.$unfiltered().vendorStaff.deleteMany({ where: { userId: { in: ids } } });
  }
  if (vendors.length > 0) {
    await prisma.$unfiltered().vendorStaff.deleteMany({ where: { vendorId: { in: vendors } } });
    await prisma.$unfiltered().vendor.deleteMany({ where: { id: { in: vendors } } });
  }
  if (customRoleId) {
    await prisma.$unfiltered().rolePermission.deleteMany({ where: { roleId: customRoleId } });
    await prisma.$unfiltered().userRoleAssignment.deleteMany({ where: { roleId: customRoleId } });
    await prisma.$unfiltered().role.delete({ where: { id: customRoleId } });
  }
  if (ids.length > 0) {
    await prisma.$unfiltered().user.deleteMany({ where: { id: { in: ids } } });
  }
  await app.close();
});

// ---------------------------------------------------------------------------

describe("the seeded configuration", () => {
  it("is the fourteen roles, twenty permissions and fifty-four grants the database phase built", async () => {
    assert.equal(await prisma.role.count(), 14);
    assert.equal(await prisma.permission.count(), 20);
    assert.equal(await prisma.rolePermission.count(), 54);
  });

  it("loads both vocabularies into the catalogue at boot", () => {
    assert.equal(catalogue.permissions.length, 20);
    assert.equal(catalogue.roles.length, 14);
    assert.ok(catalogue.permissions.includes("payouts.manage"));
    assert.ok(catalogue.roles.includes("super-admin"));
  });

  it("resolves each seeded role to exactly the set the seeder wrote", async () => {
    for (const [slug, expected] of Object.entries(SEEDED_GRANTS)) {
      const account = await signUp("customer");
      created.push(account);
      if (slug !== "customer") await assignRole(account.id, slug);
      const held = await authz.permissionsOf(account.id);
      assert.deepEqual(held, expected, `${slug} grants`);
    }
  });

  it("gives super-admin all twenty and no more", async () => {
    const held = await authz.permissionsOf(admin.id);
    assert.equal(held.length, 20);
    assert.deepEqual(held, [...catalogue.permissions].sort());
  });
});

describe("role resolution", () => {
  it("reads the account's one role from user_role_assignments", async () => {
    const roles = await authz.rolesOf(customer.id);
    assert.deepEqual(roles, ["customer"]);
  });

  it("combines the permissions of several roles", async () => {
    const account = await signUp("customer");
    created.push(account);
    await assignRole(account.id, "moderator");
    await assignRole(account.id, "marketing-manager");

    const roles = await authz.rolesOf(account.id);
    assert.deepEqual([...roles].sort(), ["customer", "marketing-manager", "moderator"]);

    const held = await authz.permissionsOf(account.id);
    assert.ok(held.includes("reviews.moderate"), "from moderator");
    assert.ok(held.includes("coupons.manage"), "from marketing-manager");
    assert.ok(!held.includes("payouts.manage"), "from neither");
  });

  it("normalises a permission both roles grant to one entry", async () => {
    const account = await signUp("customer");
    created.push(account);
    // `orders.view` is granted by moderator, customer-support and finance-manager.
    await assignRole(account.id, "moderator");
    await assignRole(account.id, "customer-support");
    await assignRole(account.id, "finance-manager");

    const held = await authz.permissionsOf(account.id);
    assert.equal(held.filter((slug) => slug === "orders.view").length, 1);
    assert.equal(new Set(held).size, held.length, "no duplicates at all");
    assert.deepEqual(held, [...held].sort(), "and a deterministic order");
  });

  it("ignores an assignment that has expired — the schema's only 'inactive'", async () => {
    const account = await signUp("customer");
    created.push(account);
    await assignRole(account.id, "finance-manager", { expiresAt: new Date(Date.now() - 60_000) });

    assert.deepEqual(await authz.rolesOf(account.id), ["customer"]);
    assert.deepEqual(await authz.permissionsOf(account.id), []);
  });

  it("honours an assignment that has not expired yet", async () => {
    const account = await signUp("customer");
    created.push(account);
    await assignRole(account.id, "finance-manager", { expiresAt: new Date(Date.now() + 3_600_000) });

    assert.ok((await authz.permissionsOf(account.id)).includes("payouts.manage"));
  });

  it("stops granting the moment the assignment is revoked", async () => {
    const account = await signUp("customer");
    created.push(account);
    const assignmentId = await assignRole(account.id, "finance-manager");
    assert.ok((await authz.permissionsOf(account.id)).includes("payouts.manage"));

    // A revoke is a deleted row: `UserRoleAssignment` has no `revokedAt`.
    await prisma.userRoleAssignment.delete({ where: { id: assignmentId } });
    assert.deepEqual(await authz.permissionsOf(account.id), []);
  });

  it("ignores an assignment whose role has been soft-deleted", async () => {
    const account = await signUp("customer");
    created.push(account);

    customRoleId = fixtureId("rol_");
    await prisma.role.create({
      data: {
        id: customRoleId,
        slug: `${RUN}-custom`,
        name: "Module 3 custom role",
        rank: 30,
        permissions: { create: { permissionId: await permissionIdOf("audit.view") } },
      },
      select: { id: true },
    });
    await prisma.userRoleAssignment.create({
      data: { id: newId(ID_PREFIXES.userRoleAssignment), userId: account.id, roleId: customRoleId },
    });
    assert.deepEqual(await authz.permissionsOf(account.id), ["audit.view"]);

    await prisma.role.update({ where: { id: customRoleId }, data: { deletedAt: new Date() } });
    assert.deepEqual(await authz.permissionsOf(account.id), [], "a deleted role grants nothing");
    assert.deepEqual(await authz.rolesOf(account.id), ["customer"]);
  });

  it("does not read User.primaryRole — the assignments are authoritative", async () => {
    const account = await signUp("customer");
    created.push(account);
    // The column that backs the frontend's `User.role`. Writing it must not
    // grant anything: it is a display field, and an account-update endpoint that
    // let it through would otherwise be a privilege-escalation path.
    await prisma.user.update({
      where: { id: account.id },
      data: { primaryRole: toDbEnum("UserRoleSlug", "super-admin") },
    });

    assert.deepEqual(await authz.permissionsOf(account.id), []);
    assert.deepEqual(await authz.rolesOf(account.id), ["customer"]);
  });
});

describe("permission resolution — the direct layer", () => {
  it("adds a direct grant on top of the role", async () => {
    const account = await signUp("customer");
    created.push(account);
    await grant(account.id, "audit.view");

    assert.deepEqual(await authz.permissionsOf(account.id), ["audit.view"]);
  });

  it("removes a role-granted permission with a denial", async () => {
    const account = await signUp("customer");
    created.push(account);
    await assignRole(account.id, "finance-manager");
    await deny(account.id, "payouts.manage");

    const held = await authz.permissionsOf(account.id);
    assert.ok(!held.includes("payouts.manage"), "denied");
    assert.ok(held.includes("payouts.view"), "and nothing else touched");
  });

  it("cannot hold a grant and a denial of one permission in one scope — the database forbids it", async () => {
    const account = await signUp("customer");
    created.push(account);
    await grant(account.id, "audit.view");

    // `user_permissions_platform_uq` — the partial unique index on
    // `(user_id, permission_id) WHERE vendor_id IS NULL` that `identity.prisma`
    // documents. The contradiction is unwritable rather than resolved, which is
    // a better place for the rule than in this module.
    await assert.rejects(() => deny(account.id, "audit.view"), /Unique constraint/);
    assert.deepEqual(await authz.permissionsOf(account.id), ["audit.view"]);
  });

  it("lets a platform denial beat a vendor grant of the same permission", async () => {
    const account = await signUp("customer");
    created.push(account);
    await assignRole(account.id, "vendor-manager", { vendorId: vendorA });
    // The two rows differ by `vendorId`, so the unique index permits both — this
    // is the only shape in which the precedence rule can actually be exercised.
    await deny(account.id, "restaurants.approve");

    const snapshot = await authz.resolve(account.id);
    assert.ok(snapshot.has("restaurants.view", vendorA), "the rest of the role is intact");
    assert.ok(!snapshot.has("restaurants.approve", vendorA), "a denial beats a grant, at its own reach");
  });

  it("ignores an expired grant and an expired denial alike", async () => {
    const account = await signUp("customer");
    created.push(account);
    await assignRole(account.id, "finance-manager");
    await grant(account.id, "settings.manage", { expiresAt: new Date(Date.now() - 1_000) });
    await deny(account.id, "payouts.manage", { expiresAt: new Date(Date.now() - 1_000) });

    const held = await authz.permissionsOf(account.id);
    assert.ok(!held.includes("settings.manage"), "the expired grant is gone");
    assert.ok(held.includes("payouts.manage"), "and so is the expired denial");
  });

  it("holds nothing for an account that may not act", async () => {
    const suspended = await signUp("customer");
    const removed = await signUp("customer");
    created.push(suspended, removed);
    await assignRole(suspended.id, "super-admin");
    await assignRole(removed.id, "super-admin");

    await prisma.user.update({
      where: { id: suspended.id },
      data: { status: toDbEnum("UserStatus", "suspended") },
    });
    await prisma.user.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });

    assert.deepEqual(await authz.permissionsOf(suspended.id), [], "suspended");
    assert.deepEqual(await authz.permissionsOf(removed.id), [], "soft-deleted");

    const gone = await authz.resolve(`usr_${ulid()}`);
    assert.equal(gone.exists, false);
    assert.equal(gone.usable, false);
    assert.deepEqual(gone.permissions, []);
  });
});

describe("authorization — the route guards", () => {
  it("refuses an unauthenticated request with 401, not 403", async () => {
    const response = await get("/probe/orders-view");
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "UNAUTHENTICATED");
  });

  it("refuses a token that is not an access token with 401", async () => {
    const response = await get("/probe/orders-view", { headers: { authorization: "Bearer not-a-token" } });
    assert.equal(response.statusCode, 401);
  });

  it("lets a permitted account through", async () => {
    const response = await get("/probe/orders-view", support.auth);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.allowed, true);
  });

  it("refuses an authenticated account without the permission with 403", async () => {
    const response = await get("/probe/orders-view", customer.auth);
    assert.equal(response.statusCode, 403);
    const body = response.json();
    assert.equal(body.error.code, "FORBIDDEN");
    assert.equal(body.error.key, "errors.forbidden");
  });

  it("refuses support the one permission its role withholds", async () => {
    // `customer-support` may refund but may not pay a partner — `lib/rbac.ts`.
    const response = await get("/probe/payouts-manage", support.auth);
    assert.equal(response.statusCode, 403);
  });

  it("says what the route required and never what the caller holds", async () => {
    const body = (await get("/probe/orders-view", customer.auth)).json();
    assert.deepEqual(body.error.details, { required: { permissions: ["orders.view"] } });

    const serialised = JSON.stringify(body);
    assert.ok(!serialised.includes("customer-support"), "no role configuration");
    assert.ok(!serialised.includes("missing-permission"), "no internal reason");
    assert.ok(!serialised.includes("user_role_assignments"), "no database detail");
  });

  it("means ALL of them when a route names two permissions", async () => {
    const account = await signUp("customer");
    created.push(account);
    await assignRole(account.id, "moderator"); // orders.view, but not refunds.manage

    assert.equal((await get("/probe/orders-view", account.auth)).statusCode, 200);
    assert.equal((await get("/probe/orders-and-refunds", account.auth)).statusCode, 403);
    assert.equal((await get("/probe/orders-and-refunds", support.auth)).statusCode, 200);
  });

  it("means ANY of them only where the route asked for it", async () => {
    const account = await signUp("customer");
    created.push(account);
    await grant(account.id, "support.view");

    assert.equal((await get("/probe/support-or-orders", account.auth)).statusCode, 200);
    assert.equal((await get("/probe/orders-view", account.auth)).statusCode, 403);
    assert.equal((await get("/probe/support-or-orders", customer.auth)).statusCode, 403);
  });

  it("checks a role requirement against the assignments", async () => {
    assert.equal((await get("/probe/super-admin", admin.auth)).statusCode, 200);
    assert.equal((await get("/probe/super-admin", support.auth)).statusCode, 403);
    assert.equal((await get("/probe/super-admin", customer.auth)).statusCode, 403);
  });

  it("takes effect on an unchanged token, in both directions", async () => {
    const account = await signUp("customer");
    created.push(account);
    assert.equal((await get("/probe/orders-view", account.auth)).statusCode, 403);

    const assignmentId = await assignRole(account.id, "moderator");
    assert.equal((await get("/probe/orders-view", account.auth)).statusCode, 200, "granted without a new token");

    await prisma.userRoleAssignment.delete({ where: { id: assignmentId } });
    assert.equal((await get("/probe/orders-view", account.auth)).statusCode, 403, "and revoked without one");
  });

  it("refuses a suspended account with 401 before authorization is even asked", async () => {
    const account = await signUp("customer");
    created.push(account);
    await assignRole(account.id, "super-admin");
    assert.equal((await get("/probe/super-admin", account.auth)).statusCode, 200);

    await prisma.user.update({
      where: { id: account.id },
      data: { status: toDbEnum("UserStatus", "suspended") },
    });
    const response = await get("/probe/super-admin", account.auth);
    assert.equal(response.statusCode, 401, "requireUser refuses the identity, not the right");
    assert.equal(response.json().error.code, "UNAUTHENTICATED");
  });

  it("refuses a soft-deleted account with 401", async () => {
    const account = await signUp("customer");
    created.push(account);
    await assignRole(account.id, "super-admin");
    await prisma.user.update({ where: { id: account.id }, data: { deletedAt: new Date() } });

    assert.equal((await get("/probe/super-admin", account.auth)).statusCode, 401);
  });

  it("reports the caller's own resolution on /context", async () => {
    const response = await get("/context", support.auth);
    assert.equal(response.statusCode, 200, response.body);
    const data = response.json().data;
    assert.equal(data.userId, support.id);
    assert.equal(data.status, "active");
    assert.deepEqual(
      data.roles.map((role) => role.slug).sort(),
      ["customer", "customer-support"],
    );
    assert.deepEqual(data.permissions, SEEDED_GRANTS["customer-support"]);
    assert.equal(data.rank, 40, "Role.rank — the highest held");
  });

  it("answers the same question as data on /check", async () => {
    const yes = await get("/check?permission=orders.view", support.auth);
    assert.equal(yes.statusCode, 200);
    assert.equal(yes.json().data.allowed, true);

    const no = await get("/check?permission=payouts.manage", support.auth);
    assert.equal(no.statusCode, 200, "asking is not being refused");
    assert.equal(no.json().data.allowed, false);
  });

  it("refuses a permission slug this database does not have", async () => {
    const response = await get("/check?permission=orders.veiw", support.auth);
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "BAD_USER_INPUT");
  });
});

describe("resource scope — vendors", () => {
  it("lets an owner reach their own vendor", async () => {
    const response = await get(`/probe/vendor/${vendorA}`, ownerA.auth);
    assert.equal(response.statusCode, 200, response.body);
  });

  it("refuses an owner another owner's vendor", async () => {
    assert.equal((await get(`/probe/vendor/${vendorB}`, ownerA.auth)).statusCode, 403);
    assert.equal((await get(`/probe/vendor/${vendorA}`, ownerB.auth)).statusCode, 403);
  });

  it("refuses a customer any vendor at all", async () => {
    assert.equal((await get(`/probe/vendor/${vendorA}`, customer.auth)).statusCode, 403);
  });

  it("lets active staff reach the vendor they work at, and no other", async () => {
    const account = await signUp("customer");
    created.push(account);
    await makeStaff({ vendorId: vendorA, userId: account.id, role: "manager", status: "active" });

    assert.equal((await get(`/probe/vendor/${vendorA}`, account.auth)).statusCode, 200);
    assert.equal((await get(`/probe/vendor/${vendorB}`, account.auth)).statusCode, 403);
  });

  it("refuses staff who have only been invited, and staff who have been deactivated", async () => {
    const invited = await signUp("customer");
    const inactive = await signUp("customer");
    created.push(invited, inactive);
    await makeStaff({ vendorId: vendorA, userId: invited.id, status: "invited" });
    await makeStaff({ vendorId: vendorA, userId: inactive.id, status: "inactive" });

    assert.equal((await get(`/probe/vendor/${vendorA}`, invited.auth)).statusCode, 403, "invited is not employed yet");
    assert.equal((await get(`/probe/vendor/${vendorA}`, inactive.auth)).statusCode, 403, "inactive is a suspension");
  });

  it("refuses staff whose row has been removed", async () => {
    const account = await signUp("customer");
    created.push(account);
    const staffId = await makeStaff({ vendorId: vendorA, userId: account.id });
    assert.equal((await get(`/probe/vendor/${vendorA}`, account.auth)).statusCode, 200);

    await prisma.vendorStaff.update({ where: { id: staffId }, data: { deletedAt: new Date() } });
    assert.equal((await get(`/probe/vendor/${vendorA}`, account.auth)).statusCode, 403);
  });

  it("admits a vendor-scoped role assignment, and only to that vendor", async () => {
    const account = await signUp("customer");
    created.push(account);
    await assignRole(account.id, "vendor-manager", { vendorId: vendorA });

    assert.equal((await get(`/probe/vendor/${vendorA}`, account.auth)).statusCode, 200);
    assert.equal((await get(`/probe/vendor/${vendorB}`, account.auth)).statusCode, 403);
  });

  it("keeps a vendor-scoped permission out of the platform set and out of other vendors", async () => {
    const account = await signUp("customer");
    created.push(account);
    await assignRole(account.id, "vendor-manager", { vendorId: vendorA });

    const snapshot = await authz.resolve(account.id);
    assert.deepEqual(snapshot.permissionsIn(null), [], "nothing platform-wide");
    assert.ok(snapshot.permissionsIn(vendorA).includes("restaurants.approve"), "everything inside vendorA");
    assert.deepEqual(snapshot.permissionsIn(vendorB), [], "and nothing inside vendorB");
  });

  it("keeps a vendor-scoped denial inside its vendor", async () => {
    const account = await signUp("customer");
    created.push(account);
    await assignRole(account.id, "customer-support");
    await deny(account.id, "orders.manage", { vendorId: vendorA });

    const snapshot = await authz.resolve(account.id);
    assert.ok(snapshot.has("orders.manage", null), "still held platform-wide");
    assert.ok(!snapshot.has("orders.manage", vendorA), "but not at vendorA");
    assert.ok(snapshot.has("orders.manage", vendorB), "and untouched at vendorB");
  });

  it("does not distinguish a vendor that is not yours from one that does not exist", async () => {
    const missing = await get(`/probe/vendor/${fixtureId("ven_")}`, ownerA.auth);
    const other = await get(`/probe/vendor/${vendorB}`, ownerA.auth);
    assert.equal(missing.statusCode, 403);
    assert.equal(other.statusCode, 403);
    assert.deepEqual(missing.json().error, { ...other.json().error, requestId: missing.json().error.requestId });
  });

  it("returns 404 rather than 403 where the route says to hide the resource", async () => {
    assert.equal((await get(`/probe/hidden/${vendorA}`, ownerA.auth)).statusCode, 200);
    const hidden = await get(`/probe/hidden/${vendorA}`, ownerB.auth);
    assert.equal(hidden.statusCode, 404);
    assert.equal(hidden.json().error.code, "NOT_FOUND");
  });

  it("requires the permission AND the resource, not either one", async () => {
    // The owner can reach the vendor but holds no platform right at all.
    assert.equal((await get(`/probe/vendor/${vendorA}`, ownerA.auth)).statusCode, 200);
    assert.equal((await get(`/probe/vendor/${vendorA}/orders`, ownerA.auth)).statusCode, 403, "no orders.view");

    // A customer holds neither.
    assert.equal((await get(`/probe/vendor/${vendorA}/orders`, customer.auth)).statusCode, 403);
  });

  it("does not scope a platform desk to the vendors it works at", async () => {
    // `customer-support` holds `orders.view` platform-wide precisely so that it
    // can see every order — `lib/rbac.ts`. Membership is not asked for.
    assert.equal((await get(`/probe/vendor/${vendorA}`, support.auth)).statusCode, 403, "not a member");
    assert.equal((await get(`/probe/vendor/${vendorA}/orders`, support.auth)).statusCode, 200, "but not scoped");
    assert.equal((await get(`/probe/vendor/${vendorB}/orders`, support.auth)).statusCode, 200);
  });

  it("still refuses a platform desk a vendor that does not exist", async () => {
    assert.equal((await get(`/probe/vendor/${fixtureId("ven_")}/orders`, support.auth)).statusCode, 403);
  });

  it("lets a vendor-scoped denial overrule a platform desk at one vendor", async () => {
    const account = await signUp("customer");
    created.push(account);
    await assignRole(account.id, "customer-support");
    await deny(account.id, "orders.view", { vendorId: vendorA });

    assert.equal((await get(`/probe/vendor/${vendorA}/orders`, account.auth)).statusCode, 403);
    assert.equal((await get(`/probe/vendor/${vendorB}/orders`, account.auth)).statusCode, 200);
  });

  it("narrows to a staff role where the route asks for one", async () => {
    const manager = await signUp("customer");
    const cook = await signUp("customer");
    created.push(manager, cook);
    await makeStaff({ vendorId: vendorA, userId: manager.id, role: "manager" });
    await makeStaff({ vendorId: vendorA, userId: cook.id, role: "kitchen" });

    assert.equal((await get(`/probe/vendor/${vendorA}/manage`, manager.auth)).statusCode, 200);
    assert.equal((await get(`/probe/vendor/${vendorA}/manage`, cook.auth)).statusCode, 403);
    assert.equal((await get(`/probe/vendor/${vendorA}/manage`, ownerA.auth)).statusCode, 200, "the owner is every role");
  });

  it("reports the membership and the scoped set on /context/:vendorId", async () => {
    const account = await signUp("customer");
    created.push(account);
    await makeStaff({ vendorId: vendorA, userId: account.id, role: "cashier" });

    const response = await get(`/context/${vendorA}`, account.auth);
    assert.equal(response.statusCode, 200, response.body);
    const data = response.json().data;
    assert.deepEqual(data.access, { allowed: true, via: "staff", staffRole: "cashier", branchId: null });
    assert.deepEqual(data.permissions, [], "a cashier holds no *platform* right");
  });
});

describe("resource scope — the caller's own record", () => {
  it("lets an account reach its own, holding no permission at all", async () => {
    const response = await get(`/probe/self/${customer.id}`, customer.auth);
    assert.equal(response.statusCode, 200, response.body);
  });

  it("refuses somebody else's", async () => {
    assert.equal((await get(`/probe/self/${admin.id}`, customer.auth)).statusCode, 403);
  });

  it("admits the desk that holds the platform right to look", async () => {
    // `customers.view` — `customer-support` has it.
    assert.equal((await get(`/probe/self/${customer.id}`, support.auth)).statusCode, 200);
  });
});

describe("the client cannot elevate itself", () => {
  it("refuses to register into a role the sign-up screen does not offer", async () => {
    seq += 1;
    const response = await app.inject({
      method: "POST",
      url: `${AUTH}/register`,
      payload: {
        name: "Would-be admin",
        email: `${RUN}-escalate-${seq}@example.test`,
        password: PASSWORD,
        role: "super-admin",
      },
    });
    assert.equal(response.statusCode, 400, response.body);
  });

  it("ignores forged role and permission claims in a validly signed token", async () => {
    // Signed with this server's own key, carrying every claim an attacker would
    // want. The signature is genuine; the claims are not read.
    const forged = app.jwt.sign(
      {
        sub: customer.id,
        sessionId: app.jwt.decode(customer.token).sessionId,
        epoch: 0,
        roles: ["super-admin"],
        permissions: ["*", "payouts.manage", "settings.manage"],
        tokenType: "access",
      },
      { expiresIn: "5m" },
    );

    assert.equal((await get("/probe/orders-view", bearer(forged))).statusCode, 403);
    assert.equal((await get("/probe/payouts-manage", bearer(forged))).statusCode, 403);
    assert.equal((await get("/probe/super-admin", bearer(forged))).statusCode, 403);

    const context = await get("/context", bearer(forged));
    assert.equal(context.statusCode, 200);
    assert.deepEqual(context.json().data.permissions, [], "the claim is not the answer");
    assert.deepEqual(context.json().data.roles.map((role) => role.slug), ["customer"]);
  });

  it("ignores roles and permissions asserted in headers or the query string", async () => {
    const response = await get("/probe/payouts-manage?permission=payouts.manage&role=super-admin", {
      headers: {
        ...customer.auth.headers,
        "x-roles": "super-admin",
        "x-permissions": "*",
        "x-user-id": admin.id,
      },
    });
    assert.equal(response.statusCode, 403);
  });

  it("does not let the caller name somebody else as the account being resolved", async () => {
    const response = await get(`/check?permission=payouts.manage&userId=${admin.id}`, customer.auth);
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.allowed, false, "resolved for the caller, not for the id they sent");
  });
});

describe("the access token contract is unchanged", () => {
  it("still carries no permissions — STEP 13", () => {
    const claims = app.jwt.decode(support.token);
    assert.deepEqual(claims.permissions, [], "authorization is resolved, not claimed");
    assert.deepEqual(claims.roles, ["customer"], "identity only, and stale by design");
    assert.equal(claims.tokenType, "access");
  });

  it("fills the read model's permissions from the database instead", async () => {
    const before = await app.inject({ method: "GET", url: `${AUTH}/me`, ...customer.auth });
    assert.equal(before.statusCode, 200, before.body);
    assert.deepEqual(before.json().data.permissions, []);

    const mine = await app.inject({ method: "GET", url: `${AUTH}/me`, ...support.auth });
    assert.deepEqual(mine.json().data.permissions, SEEDED_GRANTS["customer-support"]);
    assert.equal(mine.json().data.role, "customer", "role is still the display column");
  });

  it("reports the resolved set on a fresh sign-in too", async () => {
    const account = await signUp("customer");
    created.push(account);
    await assignRole(account.id, "moderator");

    const login = await app.inject({
      method: "POST",
      url: `${AUTH}/login`,
      payload: { email: account.email, password: PASSWORD },
    });
    assert.equal(login.statusCode, 200, login.body);
    assert.deepEqual(login.json().data.user.permissions, SEEDED_GRANTS.moderator);
  });
});

describe("requirements are validated when the route is declared", () => {
  const catalogue = { permissions: ["orders.view", "payouts.manage"], roles: ["super-admin"] };

  it("refuses a permission that is not in the database", () => {
    assert.throws(() => normalise({ permission: "orders.veiw" }, catalogue), /not a permission/);
  });

  it("refuses a role that is not in the database", () => {
    assert.throws(() => normalise({ roles: ["god-mode"] }, catalogue), /not a role/);
  });

  it("refuses a key nobody defined, rather than ignoring it", () => {
    assert.throws(() => normalise({ permision: "orders.view" }, catalogue), /not part of an authorization requirement/);
  });

  it("refuses a requirement that requires nothing", () => {
    assert.throws(() => normalise({}, catalogue), /would authorise everything/);
  });

  it("accepts the shapes the guards build", () => {
    assert.equal(normalise({ permissions: ["orders.view", "payouts.manage"] }, catalogue).all.length, 2);
    assert.equal(normalise({ anyPermission: ["orders.view"] }, catalogue).any.length, 1);
    assert.equal(normalise({ vendor: () => "ven_1" }, catalogue).platformScope, true);
    assert.equal(normalise({ vendor: "ven_1", platformScope: false }, catalogue).platformScope, false);
    assert.equal(normalise({ self: "usr_1" }, catalogue).hide, false);
  });

  it("skips validation when the database has no catalogue to validate against", () => {
    assert.doesNotThrow(() => normalise({ permission: "anything.at-all" }, { permissions: [], roles: [] }));
  });

});

describe("the permission cache", () => {
  it("is off in the test suite, so every assertion above read the database", () => {
    assert.equal(authz.ttlMs, 0);
    assert.equal(authz.stats().snapshots, 0);
  });

  it("reuses a resolution within its TTL and drops it on invalidate", async () => {
    const account = await signUp("customer");
    created.push(account);
    const cached = createService({ repo: createRepository(prisma), ttlMs: 60_000 });

    assert.deepEqual(await cached.permissionsOf(account.id), []);
    assert.equal(cached.stats().snapshots, 1);

    await assignRole(account.id, "finance-manager");
    assert.deepEqual(await cached.permissionsOf(account.id), [], "still the cached answer");

    cached.invalidate(account.id);
    assert.equal(cached.stats().snapshots, 0);
    assert.ok((await cached.permissionsOf(account.id)).includes("payouts.manage"), "re-read after invalidate");
  });

  it("caches vendor membership under the same key, and drops it with the account", async () => {
    const account = await signUp("customer");
    created.push(account);
    const cached = createService({ repo: createRepository(prisma), ttlMs: 60_000 });

    assert.equal((await cached.vendorAccess(account.id, vendorA)).allowed, false);
    assert.equal(cached.stats().memberships, 1);

    await makeStaff({ vendorId: vendorA, userId: account.id });
    assert.equal((await cached.vendorAccess(account.id, vendorA)).allowed, false, "still cached");

    cached.invalidate(account.id);
    assert.equal(cached.stats().memberships, 0);
    assert.equal((await cached.vendorAccess(account.id, vendorA)).via, "staff");
  });

  it("holds nothing at all when the TTL is zero", async () => {
    const uncached = createService({ repo: createRepository(prisma), ttlMs: 0 });
    await uncached.permissionsOf(customer.id);
    await uncached.vendorAccess(customer.id, vendorA);
    assert.deepEqual(uncached.stats(), { snapshots: 0, memberships: 0, ttlMs: 0 });
  });

  it("expires an entry when its TTL has passed", async () => {
    const account = await signUp("customer");
    created.push(account);
    const brief = createService({ repo: createRepository(prisma), ttlMs: 30 });

    assert.deepEqual(await brief.permissionsOf(account.id), []);
    await assignRole(account.id, "finance-manager");
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.ok((await brief.permissionsOf(account.id)).includes("payouts.manage"));
  });
});

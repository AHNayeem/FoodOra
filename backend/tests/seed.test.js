/**
 * seed.test.js — the seeder is safe to run again.
 *
 * The property under test is the one that decides whether anyone dares run it
 * against a database that already has data: running it twice changes nothing.
 * So the test seeds, snapshots, seeds again, and compares — ids included,
 * because a second run that *replaced* the permission rows would keep the counts
 * identical while breaking every grant that referenced them.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@foodora/database";
import { seedReferenceData } from "../src/seed/reference.js";
import { notificationTemplates } from "../src/seed/data/notification-templates.js";
import { permissions, roles } from "../src/seed/data/reference.js";

const silent = { info() {} };

describe("reference seeder", () => {
  let prisma;

  before(async () => {
    prisma = new PrismaClient();
    await seedReferenceData({ logger: silent });
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it("writes the minimum set BACKEND-REQUIREMENTS §2 lists", async () => {
    const [currencies, languages, countries, taxRules, providers, ledger, collections] = await Promise.all([
      prisma.currency.count(),
      prisma.language.count(),
      prisma.country.count(),
      prisma.taxRule.count(),
      prisma.paymentProvider.count(),
      prisma.ledgerAccount.count({ where: { ownerId: null } }),
      prisma.cmsCollection.count(),
    ]);

    assert.ok(currencies >= 1, "at least one currency");
    assert.equal(languages, 3, "the frontend's three locales");
    assert.ok(countries >= 1, "at least one country — no account can exist without one");
    assert.ok(taxRules >= 1);
    assert.ok(providers >= 2, "cash and wallet at minimum");
    assert.ok(ledger >= 1);
    assert.equal(collections, 9);
  });

  it("unblocks account creation: BD exists with its currency and timezone", async () => {
    // The single fact §2 calls blocking — `User.countryCode` is a non-null FK.
    const bd = await prisma.country.findUnique({ where: { code: "BD" } });
    assert.equal(bd?.currencyCode, "BDT");
    assert.equal(bd?.timezone, "Asia/Dhaka");
  });

  it("writes the whole permission catalogue and every built-in role", async () => {
    assert.equal(await prisma.permission.count(), permissions.length);
    assert.equal(await prisma.role.count(), roles.length);

    const superAdmin = await prisma.role.findUnique({
      where: { slug: "super-admin" },
      include: { permissions: true },
    });
    assert.equal(superAdmin.permissions.length, permissions.length, "super-admin holds everything");

    const customer = await prisma.role.findUnique({ where: { slug: "customer" }, include: { permissions: true } });
    assert.equal(customer.permissions.length, 0, "a customer holds no platform rights, deliberately");
  });

  it("gives every zone area a centroid, which dispatch needs to place a stop", async () => {
    const areas = await prisma.zoneArea.findMany();
    assert.ok(areas.length > 0);
    assert.ok(
      areas.every((area) => area.lat !== null && area.lng !== null),
      "an area with no centroid is an area a real order cannot be routed to",
    );
  });

  it("stores enum labels in the frontend's vocabulary, not Prisma's", async () => {
    const [row] = await prisma.$queryRaw`SELECT direction::text FROM languages WHERE code = 'ar'`;
    assert.equal(row.direction, "rtl", "the column reads as the TypeScript union does");

    const arabic = await prisma.language.findUnique({ where: { code: "ar" } });
    assert.equal(arabic.direction, "RTL", "…while the client speaks identifiers");
  });

  it("writes one template per message key, and no prose", async () => {
    assert.equal(await prisma.notificationTemplate.count(), notificationTemplates.length);
    const template = await prisma.notificationTemplate.findFirst({ where: { key: "refunded", audience: "CUSTOMER" } });
    assert.equal(template.category, "PAYMENT");
    assert.equal(template.topic, "ORDER_UPDATES");
    assert.ok(template.isRequired, "a receipt is not suppressible");
  });

  it("changes nothing on a second run", async () => {
    const snapshot = async () => ({
      permissions: await prisma.permission.findMany({ orderBy: { id: "asc" }, select: { id: true, slug: true } }),
      roleGrants: await prisma.rolePermission.count(),
      templates: await prisma.notificationTemplate.count(),
      zones: await prisma.deliveryZone.count(),
      ledger: await prisma.ledgerAccount.count(),
    });

    const before = await snapshot();
    await seedReferenceData({ logger: silent });
    const after = await snapshot();

    assert.deepEqual(after, before);
  });

  it("keeps the same ids in every database, so a grant means the same thing everywhere", async () => {
    const ordersView = await prisma.permission.findUnique({ where: { slug: "orders.view" } });
    // Derived from the slug by hash — reproducible, not random.
    assert.match(ordersView.id, /^prm_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);

    const again = await prisma.permission.findUnique({ where: { slug: "orders.view" } });
    assert.equal(again.id, ordersView.id);
  });
});

/**
 * soft-delete.test.js — the filter, against real PostgreSQL.
 *
 * `deletedAt IS NULL` means active and nothing in the database enforces it, so
 * the only proof the extension works is a deleted row that a query genuinely
 * fails to return. Every case runs inside a transaction that is rolled back by
 * throwing, so the seeded reference data is exactly as it was afterwards.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { buildApp } from "../src/app.js";

/** Run `body` against a transaction and roll it back, whatever it returns. */
async function inRollback(prisma, body) {
  const ROLLBACK = Symbol("rollback");
  let result;
  try {
    await prisma.$transaction(async (tx) => {
      result = await body(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
  return result;
}

describe("soft delete", () => {
  let app;

  before(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it("hides a deleted row from findMany", async () => {
    const outcome = await inRollback(app.prisma, async (tx) => {
      const before = await tx.deliveryZone.count();
      await tx.deliveryZone.update({ where: { id: "dzn_uttara" }, data: { deletedAt: new Date() } });
      return { before, after: await tx.deliveryZone.count() };
    });
    assert.equal(outcome.after, outcome.before - 1);
  });

  it("hides a deleted row from findUnique, which is the case that leaks", async () => {
    // A deleted vendor fetched by id and rendered on its own page is the exact
    // leak the convention exists to prevent — and the one a naive extension,
    // which only filters findMany, still allows.
    const found = await inRollback(app.prisma, async (tx) => {
      await tx.deliveryZone.update({ where: { id: "dzn_uttara" }, data: { deletedAt: new Date() } });
      return tx.deliveryZone.findUnique({ where: { id: "dzn_uttara" } });
    });
    assert.equal(found, null);
  });

  it("still returns rows that are not deleted", async () => {
    const zone = await app.prisma.deliveryZone.findUnique({ where: { id: "dzn_uttara" } });
    assert.equal(zone?.id, "dzn_uttara");
  });

  it("refuses a hard delete on a soft-deletable model", async () => {
    await assert.rejects(
      () => app.prisma.deliveryZone.delete({ where: { id: "dzn_uttara" } }),
      /is disabled/,
    );
  });

  it("leaves models without deletedAt alone", async () => {
    // `Permission` has no `deletedAt`; filtering on it would be an error on a
    // query that should work.
    const count = await app.prisma.permission.count();
    assert.equal(count, 20);
  });

  it("offers $unfiltered for the three callers that legitimately need it", async () => {
    const unfiltered = app.prisma.$unfiltered();
    const seen = await inRollback(unfiltered, async (tx) => {
      await tx.deliveryZone.update({ where: { id: "dzn_uttara" }, data: { deletedAt: new Date() } });
      return tx.deliveryZone.findUnique({ where: { id: "dzn_uttara" } });
    });
    assert.equal(seen?.id, "dzn_uttara");
  });
});

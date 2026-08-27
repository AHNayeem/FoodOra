/**
 * prisma-layer.test.js — the three conventions the schema cannot enforce itself.
 *
 * Enum translation, soft delete and optimistic locking are all things
 * BACKEND-REQUIREMENTS §1 says produce *silently wrong data* rather than an
 * error when they are missed. That is exactly the class of bug a test has to
 * catch, because nothing else will.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@foodora/database";
import { ENUM_MAPS, MODEL_ENUM_FIELDS, toApiEnum, toApiRow, toDbEnum, toDbInput } from "../src/shared/utils/enums.js";
import { SOFT_DELETE_MODELS } from "../src/plugins/prisma.js";
import { deterministicId, hasPrefix, newId, prefixOf } from "../src/shared/utils/ids.js";
import { toDecimal, toJsonSafe } from "../src/shared/utils/serialize.js";
import { toSkipTake } from "../src/shared/utils/pagination.js";

describe("enum translation", () => {
  it("covers every enum in the schema", () => {
    assert.equal(Object.keys(ENUM_MAPS).length, Prisma.dmmf.datamodel.enums.length);
    assert.ok(Object.keys(ENUM_MAPS).length > 100, "the schema has 127 enums");
  });

  it("translates an identifier to the frontend's kebab-case vocabulary", () => {
    // The example the schema's own comment uses.
    assert.equal(toApiEnum("OrderStatusKind", "COMPLETED"), "completed");
    assert.equal(toApiEnum("OrderStatusKind", "RIDER_ASSIGNED"), "rider-assigned");
    assert.equal(toDbEnum("OrderStatusKind", "rider-assigned"), "RIDER_ASSIGNED");
  });

  it("accepts an identifier on the way in as well, so a Prisma-speaking caller still works", () => {
    assert.equal(toDbEnum("OrderStatusKind", "COMPLETED"), "COMPLETED");
  });

  it("round-trips every member of every enum", () => {
    for (const [name, map] of Object.entries(ENUM_MAPS)) {
      for (const [identifier, api] of Object.entries(map.toApi)) {
        assert.equal(toDbEnum(name, api), identifier, `${name}.${identifier} did not round-trip`);
      }
    }
  });

  it("refuses a value that is not a member, rather than passing it to PostgreSQL", () => {
    assert.throws(() => toDbEnum("OrderStatusKind", "definitely-not-a-status"), /not a member/);
    assert.throws(() => toApiEnum("NoSuchEnum", "X"), /Unknown enum/);
  });

  it("translates a row's enum fields and leaves everything else alone", () => {
    const row = toApiRow("Order", { id: "ord_1", status: "COMPLETED", total: 100 });
    assert.deepEqual(row, { id: "ord_1", status: "completed", total: 100 });
  });

  it("translates enum filters, not just plain values", () => {
    const where = toDbInput("Order", { status: { in: ["completed", "cancelled"] } });
    assert.deepEqual(where.status.in, ["COMPLETED", "CANCELLED"]);
  });

  it("handles list-valued enum fields", () => {
    const data = toDbInput("PaymentProvider", { capabilities: ["charge", "partial-refund"] });
    assert.deepEqual(data.capabilities, ["CHARGE", "PARTIAL_REFUND"]);
  });

  it("knows which model field is which enum", () => {
    assert.equal(MODEL_ENUM_FIELDS.Order.status.enum, "OrderStatusKind");
    assert.equal(MODEL_ENUM_FIELDS.PaymentProvider.capabilities.isList, true);
  });
});

describe("soft delete", () => {
  it("discovers the models carrying deletedAt from the schema", () => {
    assert.ok(SOFT_DELETE_MODELS.has("Vendor"));
    assert.ok(SOFT_DELETE_MODELS.has("User"));
  });

  it("excludes the immutable financial records, which are never deleted", () => {
    // `main.prisma` §3: superseded, not removed. A filter on a column they do
    // not have would be a runtime error on a query that used to work.
    for (const model of ["LedgerEntry", "OrderEvent", "PaymentTransaction"]) {
      assert.ok(!SOFT_DELETE_MODELS.has(model), `${model} should not be soft-deletable`);
    }
  });
});

describe("ids", () => {
  it("mints a prefixed, sortable id", () => {
    const id = newId("rol_");
    assert.ok(hasPrefix(id, "rol_"));
    assert.equal(prefixOf(id), "rol_");
    assert.equal(id.length, 30);
  });

  it("sorts chronologically", () => {
    const earlier = newId("rol_", new Date("2026-01-01T00:00:00Z"));
    const later = newId("rol_", new Date("2026-06-01T00:00:00Z"));
    assert.ok(earlier < later);
  });

  it("refuses an unregistered prefix rather than minting a row nobody can find", () => {
    assert.throws(() => newId("usre_"), /not a registered id prefix/);
    assert.throws(() => newId("NOPE"), /not a valid id prefix/);
  });

  it("derives the same reference id in every database", () => {
    assert.equal(deterministicId("prm_", "orders.view"), deterministicId("prm_", "orders.view"));
    assert.notEqual(deterministicId("prm_", "orders.view"), deterministicId("prm_", "orders.manage"));
    assert.match(deterministicId("prm_", "orders.view"), /^prm_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  });
});

describe("boundary serialisation", () => {
  it("turns Decimal into a number, because the frontend types money as one", () => {
    const row = toJsonSafe({ total: new Prisma.Decimal("1380.50"), nested: [{ fee: new Prisma.Decimal("60") }] });
    assert.equal(row.total, 1380.5);
    assert.equal(row.nested[0].fee, 60);
    assert.equal(typeof row.total, "number");
  });

  it("does not let decimal.js render money as a string", () => {
    // `Decimal#toJSON` returns "1380.5". Left to JSON.stringify, every money
    // field on the wire would change type.
    assert.equal(typeof JSON.parse(JSON.stringify(toJsonSafe({ v: new Prisma.Decimal("1380.5") }))).v, "number");
  });

  it("keeps dates as dates for JSON.stringify to render as ISO-8601", () => {
    const at = new Date("2026-08-27T10:00:00.000Z");
    assert.equal(toJsonSafe({ at }).at, at);
    assert.equal(JSON.parse(JSON.stringify(toJsonSafe({ at }))).at, "2026-08-27T10:00:00.000Z");
  });

  it("converts a number back to Decimal through its string form", () => {
    assert.equal(toDecimal(0.1).plus(toDecimal(0.2)).toString(), "0.3");
  });
});

describe("pagination", () => {
  it("converts a page to skip/take", () => {
    assert.deepEqual(toSkipTake({ page: 3, pageSize: 20 }), { page: 3, pageSize: 20, skip: 40, take: 20 });
  });

  it("clamps a caller who asks for a million rows", () => {
    assert.equal(toSkipTake({ pageSize: 1_000_000 }).take, 100);
    assert.equal(toSkipTake({ page: -5 }).page, 1);
  });
});

/**
 * error-contract.test.js — every failure comes out in the same shape.
 *
 * The contract is only worth having if it holds for failures nobody wrote a
 * handler for, so most of what is asserted here is the *unhandled* case: a route
 * that throws a plain `Error`, a Prisma constraint violation, a body that fails
 * validation. Each is checked for the envelope, the closed-set code, and — for
 * the 500 — that nothing internal leaks out with it.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Prisma } from "@foodora/database";
import { buildApp } from "../src/app.js";
import { AppError, badRequest, conflict, forbidden, notFound } from "../src/shared/errors/app-error.js";
import { normalizeError } from "../src/middleware/error-handler.js";
import { refuse } from "../src/shared/errors/envelope.js";

describe("error contract", () => {
  let app;

  before(async () => {
    app = await buildApp({ logger: false });

    app.get("/t/app-error", async () => {
      throw notFound("Vendor");
    });
    app.get("/t/forbidden", async () => {
      throw forbidden("Not yours");
    });
    app.get("/t/conflict", async () => {
      throw conflict("Someone else got there first");
    });
    app.get("/t/boom", async () => {
      throw new Error("a stack trace nobody outside should read");
    });
    app.get("/t/prisma-unique", async () => {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "6.x",
        meta: { target: ["slug"] },
      });
    });
    app.get("/t/prisma-missing", async () => {
      throw new Prisma.PrismaClientKnownRequestError("Record not found", {
        code: "P2025",
        clientVersion: "6.x",
      });
    });
    app.get("/t/refusal", async () => refuse("errors.invalidOtp", "code"));

    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  const bodyOf = async (url) => {
    const response = await app.inject({ method: "GET", url });
    return { status: response.statusCode, body: response.json() };
  };

  it("passes an AppError through with its code, key and status", async () => {
    const { status, body } = await bodyOf("/t/app-error");
    assert.equal(status, 404);
    assert.deepEqual(
      { success: body.success, code: body.error.code, key: body.error.key },
      { success: false, code: "NOT_FOUND", key: "errors.notFound" },
    );
  });

  it("uses the keys the frontend can already render", async () => {
    // `lib/graphql/result.ts::BY_CODE` maps exactly these. A code that arrives
    // with a key outside the whitelist degrades to "something went wrong".
    assert.equal((await bodyOf("/t/forbidden")).body.error.key, "errors.forbidden");
    assert.equal((await bodyOf("/t/app-error")).body.error.key, "errors.notFound");
  });

  it("says CONFLICT rather than NOT_FOUND when a versioned write loses", async () => {
    const { status, body } = await bodyOf("/t/conflict");
    assert.equal(status, 409);
    assert.equal(body.error.code, "CONFLICT");
  });

  it("turns an unexpected throw into a 500 that reveals nothing", async () => {
    const { status, body } = await bodyOf("/t/boom");
    assert.equal(status, 500);
    assert.equal(body.error.code, "INTERNAL_ERROR");
    assert.equal(body.error.key, "errors.generic");
    assert.ok(!JSON.stringify(body).includes("stack trace nobody"));
    assert.equal(body.error.details, undefined);
    assert.ok(body.error.requestId);
  });

  it("maps a unique violation to CONFLICT and a missing row to NOT_FOUND", async () => {
    const unique = await bodyOf("/t/prisma-unique");
    assert.equal(unique.status, 409);
    assert.equal(unique.body.error.code, "CONFLICT");
    assert.deepEqual(unique.body.error.details.fields, ["slug"]);

    const missing = await bodyOf("/t/prisma-missing");
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, "NOT_FOUND");
  });

  it("returns an expected refusal as data at HTTP 200", async () => {
    // The distinction the frontend is written against: `fromPayload` unwraps
    // this, and a 4xx here would push a business answer into the exception path.
    const { status, body } = await bodyOf("/t/refusal");
    assert.equal(status, 200);
    assert.deepEqual(body, { success: false, error: { key: "errors.invalidOtp", path: "code" } });
  });

  it("normalizes an unreachable database to SERVICE_UNAVAILABLE", () => {
    const initialization = new Prisma.PrismaClientInitializationError("cannot reach", "6.x");
    assert.equal(normalizeError(initialization).code, "SERVICE_UNAVAILABLE");

    const p1001 = new Prisma.PrismaClientKnownRequestError("down", { code: "P1001", clientVersion: "6.x" });
    assert.equal(normalizeError(p1001).code, "SERVICE_UNAVAILABLE");
  });

  it("treats a malformed query as our bug, not the caller's", () => {
    const error = new Prisma.PrismaClientValidationError("Unknown arg", { clientVersion: "6.x" });
    const normalized = normalizeError(error);
    assert.equal(normalized.code, "INTERNAL_ERROR");
    assert.equal(normalized.statusCode, 500);
  });

  it("refuses to construct an error outside the closed set", () => {
    assert.throws(() => new AppError("TEAPOT", "no"), /Unknown error code/);
    assert.equal(badRequest("x").statusCode, 400);
  });
});

/**
 * validation.test.js — the route schema is the contract.
 *
 * Routes are declared here rather than taken from `src/routes`, because there
 * are no domain routes yet by instruction. What is under test is the *machinery*
 * a module will rely on: that a declared schema is enforced, that its failure
 * comes out in the error contract with the offending field named, that query
 * strings are coerced, and that undeclared body fields are dropped rather than
 * forwarded.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { buildApp } from "../src/app.js";
import { commonErrorResponses, success } from "../src/shared/validators/schemas.js";
import { ok } from "../src/shared/errors/envelope.js";

describe("validation", () => {
  let app;

  before(async () => {
    app = await buildApp({ logger: false });

    app.post(
      "/t/orders",
      {
        schema: {
          body: {
            type: "object",
            required: ["vendorId", "quantity"],
            properties: {
              vendorId: { $ref: "id#" },
              quantity: { type: "integer", minimum: 1, maximum: 50 },
              note: { type: "string", maxLength: 200 },
            },
          },
          response: {
            200: success({ type: "object", properties: { echoed: {} } }),
            ...commonErrorResponses,
          },
        },
      },
      async (request) => ok({ echoed: request.body }),
    );

    app.get(
      "/t/list",
      { schema: { querystring: { $ref: "paginationQuery#" } } },
      async (request) => ok(request.query),
    );

    app.get(
      "/t/vendors/:id",
      { schema: { params: { type: "object", properties: { id: { $ref: "id#" } }, required: ["id"] } } },
      async (request) => ok(request.params),
    );

    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it("accepts a well-formed body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/t/orders",
      payload: { vendorId: "ven_01J8F3K2M7QX9V4B6C8D0EGHJK", quantity: 2 },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.echoed.quantity, 2);
  });

  it("refuses a missing field and names it", async () => {
    const response = await app.inject({ method: "POST", url: "/t/orders", payload: { quantity: 2 } });
    assert.equal(response.statusCode, 400);

    const body = response.json();
    assert.equal(body.error.code, "BAD_USER_INPUT");
    assert.equal(body.error.key, "errors.invalidInput");
    assert.ok(body.error.details.some((issue) => issue.field === "vendorId"));
  });

  it("refuses an id that is not in the platform's id format", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/t/orders",
      payload: { vendorId: "42", quantity: 1 },
    });
    assert.equal(response.statusCode, 400);
    assert.ok(response.json().error.details.some((issue) => issue.rule === "pattern"));
  });

  it("reports every problem at once rather than one per round trip", async () => {
    const response = await app.inject({ method: "POST", url: "/t/orders", payload: { vendorId: "42", quantity: 0 } });
    assert.equal(response.statusCode, 400);
    assert.ok(response.json().error.details.length >= 2);
  });

  it("drops fields the schema does not declare", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/t/orders",
      payload: { vendorId: "ven_01J8F3K2M7QX9V4B6C8D0EGHJK", quantity: 1, isAdmin: true },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.echoed.isAdmin, undefined);
  });

  it("coerces and defaults a query string", async () => {
    const defaults = await app.inject({ method: "GET", url: "/t/list" });
    assert.deepEqual(defaults.json().data, { page: 1, pageSize: 20 });

    const given = await app.inject({ method: "GET", url: "/t/list?page=3&pageSize=50" });
    assert.deepEqual(given.json().data, { page: 3, pageSize: 50 });
  });

  it("caps the page size rather than trusting the caller", async () => {
    const response = await app.inject({ method: "GET", url: "/t/list?pageSize=100000" });
    assert.equal(response.statusCode, 400);
  });

  it("validates path parameters too", async () => {
    const good = await app.inject({ method: "GET", url: "/t/vendors/ven_01J8F3K2M7QX9V4B6C8D0EGHJK" });
    assert.equal(good.statusCode, 200);

    const bad = await app.inject({ method: "GET", url: "/t/vendors/42" });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, "BAD_USER_INPUT");

    // A traversal attempt is normalised by the router and matches nothing, so it
    // never reaches a handler at all — a 404, not a 400.
    const traversal = await app.inject({ method: "GET", url: "/t/vendors/../../etc/passwd" });
    assert.equal(traversal.statusCode, 404);
  });

  it("refuses unparseable JSON in the error contract", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/t/orders",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "BAD_USER_INPUT");
  });
});

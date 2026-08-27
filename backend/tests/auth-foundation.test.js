/**
 * auth-foundation.test.js — the guards, not the module.
 *
 * There is no sign-in endpoint to test, by instruction. What there is is the
 * shape every future route will lean on: a token requirement that refuses
 * without one, a permission check that mirrors the frontend's, and the
 * `tokenType` distinction that stops a refresh token being used as a bearer
 * credential.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { buildApp } from "../src/app.js";
import { hasPermission } from "../src/plugins/auth.js";
import { ok } from "../src/shared/errors/envelope.js";

describe("authentication foundation", () => {
  let app;
  let accessToken;

  before(async () => {
    app = await buildApp({ logger: false });

    app.get("/t/private", { preHandler: app.authenticate }, async (request) => ok(request.user));
    app.get("/t/optional", { preHandler: app.optionalAuth }, async (request) => ok({ signedIn: Boolean(request.user) }));
    app.get(
      "/t/payouts",
      { preHandler: [app.authenticate, app.authorize("payouts.manage")] },
      async () => ok({ ran: true }),
    );

    await app.ready();

    accessToken = app.signAccessToken({
      sub: "usr_01J8F3K2M7QX9V4B6C8D0EGHJK",
      roles: ["customer-support"],
      permissions: ["orders.view", "orders.manage", "refunds.manage"],
    });
  });

  after(async () => {
    await app.close();
  });

  const withToken = (token) =>
    app.inject({ method: "GET", url: "/t/private", headers: { authorization: `Bearer ${token}` } });

  it("refuses a request with no token, in the error contract", async () => {
    const response = await app.inject({ method: "GET", url: "/t/private" });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "UNAUTHENTICATED");
    assert.equal(response.json().error.key, "errors.unauthenticated");
  });

  it("refuses a token signed with someone else's key", async () => {
    const forged =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3JfaGFja2VyIn0.qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
    assert.equal((await withToken(forged)).statusCode, 401);
  });

  it("populates request.user in the frontend's vocabulary", async () => {
    const response = await withToken(accessToken);
    assert.equal(response.statusCode, 200);

    const user = response.json().data;
    assert.equal(user.sub, "usr_01J8F3K2M7QX9V4B6C8D0EGHJK");
    // kebab-case, as `types/user.ts::UserRole` has it — never a Prisma identifier.
    assert.deepEqual(user.roles, ["customer-support"]);
    assert.equal(user.tokenType, "access");
  });

  it("refuses a refresh token presented as an access token", async () => {
    // Same key, different lifetime and type. Without the check, a stolen refresh
    // token would be a bearer credential for the whole API.
    const refresh = app.signRefreshToken({ sub: "usr_01J8F3K2M7QX9V4B6C8D0EGHJK", sessionId: "ses_x" });
    assert.equal((await withToken(refresh)).statusCode, 401);
  });

  it("lets an anonymous request through optionalAuth", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/t/optional" });
    assert.equal(anonymous.statusCode, 200);
    assert.equal(anonymous.json().data.signedIn, false);

    const signedIn = await app.inject({
      method: "GET",
      url: "/t/optional",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(signedIn.json().data.signedIn, true);
  });

  it("refuses a permission the account does not hold", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/t/payouts",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "FORBIDDEN");
    assert.deepEqual(response.json().error.details.required, ["payouts.manage"]);
  });

  it("allows it once the account holds it", async () => {
    const token = app.signAccessToken({ sub: "usr_x", roles: ["finance-manager"], permissions: ["payouts.manage"] });
    const response = await app.inject({
      method: "GET",
      url: "/t/payouts",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 200);
  });

  it("reads permissions exactly as lib/rbac.ts does", () => {
    // Two vocabularies that disagree would mean the frontend hides a button the
    // API still honours, or the reverse.
    assert.ok(hasPermission({ permissions: ["*"] }, "payouts.manage"), "the seeded super-admin's wildcard");
    assert.ok(hasPermission({ permissions: ["orders.*"] }, "orders.view"), "a resource wildcard");
    assert.ok(!hasPermission({ permissions: ["orders.view"] }, "orders.manage"));
    // The legacy colon vocabulary grants nothing — `lib/rbac.ts` is explicit
    // that reading `orders:view` as `orders.view` would hand every restaurant
    // owner the platform-wide order list.
    assert.ok(!hasPermission({ permissions: ["orders:view"] }, "orders.view"));
    assert.ok(!hasPermission({ permissions: undefined }, "orders.view"));
  });
});

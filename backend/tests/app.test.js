/**
 * app.test.js — the application boots, routes, and shuts down.
 *
 * `buildApp()` is the unit under test rather than `server.js`: it is the whole
 * application minus the socket, so everything here exercises the real plugin
 * chain, the real error handler and the real Prisma connection.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { buildApp } from "../src/app.js";

describe("application", () => {
  let app;

  before(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it("boots with the database connected and the auth decorators in place", () => {
    assert.equal(typeof app.prisma, "object");
    assert.equal(typeof app.checkDatabase, "function");
    assert.equal(typeof app.authenticate, "function");
    assert.equal(typeof app.authorize, "function");
    assert.equal(typeof app.signAccessToken, "function");
  });

  it("describes itself at the root", async () => {
    const response = await app.inject({ method: "GET", url: "/" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().apiPrefix, "/api/v1");
  });

  it("returns a request id on every response, and reuses a caller's", async () => {
    const generated = await app.inject({ method: "GET", url: "/health" });
    assert.match(generated.headers["x-request-id"], /^req_/);

    const traced = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "trace-from-the-frontend" },
    });
    assert.equal(traced.headers["x-request-id"], "trace-from-the-frontend");
  });

  it("refuses a forged request id rather than echoing it into the logs", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "not ok\nlevel=fatal" },
    });
    assert.match(response.headers["x-request-id"], /^req_/);
  });

  it("answers an unknown route in the error contract", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/nothing-here" });
    assert.equal(response.statusCode, 404);

    const body = response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "NOT_FOUND");
    assert.equal(body.error.key, "errors.notFound");
    assert.equal(body.error.requestId, response.headers["x-request-id"]);
  });

  it("sends the security headers a JSON API should send", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["cache-control"], "no-store");
    // CSP belongs to the frontend's HTML, not to a JSON body.
    assert.equal(response.headers["content-security-policy"], undefined);
  });

  it("answers a CORS preflight for an allowed origin only", async () => {
    const allowed = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/health",
      headers: { origin: "http://localhost:3000", "access-control-request-method": "GET" },
    });
    assert.equal(allowed.headers["access-control-allow-origin"], "http://localhost:3000");
    assert.equal(allowed.headers["access-control-allow-credentials"], "true");

    const rejected = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/health",
      headers: { origin: "https://evil.example", "access-control-request-method": "GET" },
    });
    assert.equal(rejected.headers["access-control-allow-origin"], undefined);
  });

  it("closes cleanly, running the hook that returns the Prisma pool", async () => {
    // Asserted through the log rather than by counting PostgreSQL connections:
    // the suite runs several apps against the same database at once, so a global
    // connection count is not attributable to one of them. What is ours to test
    // is that `close()` resolves and that the plugin's `onClose` actually ran.
    const lines = [];
    const throwaway = await buildApp({
      logger: { level: "info", stream: { write: (line) => lines.push(line) } },
    });
    await throwaway.ready();
    await throwaway.prisma.$queryRaw`SELECT 1`;

    await throwaway.close();

    assert.ok(
      lines.some((line) => line.includes("disconnecting from PostgreSQL")),
      "the prisma plugin's onClose hook should have run",
    );
    assert.equal(throwaway.server.listening, false);
  });
});

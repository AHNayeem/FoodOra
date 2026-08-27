/**
 * health.test.js — liveness, readiness, and the difference between them.
 *
 * The readiness test that matters is the failing one. "Returns 200 when the
 * database is up" passes just as happily against a handler that returns 200
 * unconditionally, which is the bug the phase brief names outright: *do not
 * pretend the service is ready if the database is unavailable.* So the check is
 * forced to fail and the response is asserted to be a 503 in the error contract.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { buildApp } from "../src/app.js";

describe("health", () => {
  let app;

  before(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it("GET /health reports the process alive without touching the database", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    assert.equal(response.statusCode, 200);

    const body = response.json();
    assert.equal(body.status, "ok");
    assert.equal(typeof body.uptimeSeconds, "number");
    assert.equal(typeof body.version, "string");
    assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("GET /health/ready queries PostgreSQL and reports the latency", async () => {
    const response = await app.inject({ method: "GET", url: "/health/ready" });
    assert.equal(response.statusCode, 200);

    const body = response.json();
    assert.equal(body.status, "ready");
    assert.equal(body.checks.database.status, "up");
    assert.ok(body.checks.database.latencyMs >= 0);
  });

  it("serves both under the versioned prefix as well", async () => {
    for (const url of ["/api/v1/health", "/api/v1/health/ready"]) {
      const response = await app.inject({ method: "GET", url });
      assert.equal(response.statusCode, 200, `${url} should be 200`);
    }
  });

  it("answers 503 in the error contract when the database is unreachable", async () => {
    const working = app.checkDatabase;
    app.checkDatabase = async () => ({ ok: false, latencyMs: 12, error: "connection refused" });

    try {
      const response = await app.inject({ method: "GET", url: "/health/ready" });
      assert.equal(response.statusCode, 503);

      const body = response.json();
      assert.equal(body.success, false);
      assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
      assert.equal(body.error.key, "errors.serviceUnavailable");
      assert.equal(body.error.details.database.status, "down");
    } finally {
      app.checkDatabase = working;
    }
  });

  it("is exempt from the rate limiter", async () => {
    // A probe calling /health every second must never rate-limit itself into
    // reporting the service down.
    const responses = await Promise.all(
      Array.from({ length: 40 }, () => app.inject({ method: "GET", url: "/health" })),
    );
    assert.ok(responses.every((response) => response.statusCode === 200));
  });
});

/**
 * auth-sessions.test.js — module 2, against real PostgreSQL.
 *
 * Every case below drives the actual routes through `app.inject()`: the real
 * validation, the real Argon2id, the real session and refresh-token rows. There
 * is no mocked repository, because the properties worth testing here — a
 * rotation chain that detects reuse, a lockout counter, a soft-deleted account
 * that cannot sign in — are properties of what is *written*, and a fake would
 * only prove that the fake agrees with itself.
 *
 * Accounts are created with a per-run email prefix and hard-deleted afterwards
 * through `$unfiltered()` (the extension refuses `delete` on soft-deletable
 * models, which is the point of it). The cascades take credentials, sessions,
 * refresh tokens, devices, settings and role assignments with them;
 * `login_attempts` has no foreign key by design — the table records attempts
 * against accounts that never existed — so it is cleaned by identifier.
 *
 * `AUTH_ECHO_SECRETS=1` is set by the `test` script. Without it the OTP code and
 * the reset token are only logged, and neither flow can be driven end to end at
 * all; the environment refuses the flag in production.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { buildApp } from "../src/app.js";
import env from "../src/config/env.js";

const RUN = `m2-${Date.now().toString(36)}`;
/**
 * Four digits that make this run's phone numbers unlike the last run's.
 *
 * `otp_challenges` rows outlive the accounts they belong to (many have no
 * account at all), and the resend cooldown is keyed on the destination — so a
 * fixed number would make the second `npm test` inside a minute fail with
 * `errors.otpTooSoon` on a case that is about something else entirely.
 */
const RUN_DIGITS = String(Date.now()).slice(-6, -2);
/** `+8801RRRRNNNNN` once normalised — the prefix the cleanup deletes by. */
const PHONE_PREFIX = `+8801${RUN_DIGITS}`;
const PASSWORD = "correct horse battery staple";
const BASE = "/api/v1/auth";

let app;
let seq = 0;

/** A fresh, unused identity. */
const identity = () => {
  seq += 1;
  return {
    name: `Test Account ${seq}`,
    email: `${RUN}-${seq}@example.test`,
    phone: phoneNumber(),
    password: PASSWORD,
  };
};

/** A BD mobile number no other test and no earlier run has used. */
function phoneNumber() {
  seq += 1;
  return `01${RUN_DIGITS}${String(seq).padStart(5, "0")}`;
}

const post = (path, payload, options = {}) =>
  app.inject({ method: "POST", url: `${BASE}${path}`, payload, ...options });

const get = (path, options = {}) => app.inject({ method: "GET", url: `${BASE}${path}`, ...options });

const bearer = (token) => ({ headers: { authorization: `Bearer ${token}` } });

/** The two cookies plus the header the double-submit check wants. */
function credentialsOf(response) {
  const refresh = response.cookies.find((cookie) => cookie.name === "foodora_rt")?.value ?? null;
  const csrf = response.cookies.find((cookie) => cookie.name === "csrf")?.value ?? null;
  return {
    refresh,
    csrf,
    ...(refresh && csrf
      ? { cookies: { foodora_rt: refresh, csrf }, headers: { "x-csrf-token": csrf } }
      : {}),
  };
}

/** Register an account and return everything a later assertion might need. */
async function signUp(overrides = {}) {
  const who = { ...identity(), ...overrides };
  const response = await post("/register", { ...who, role: overrides.role ?? "customer" });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().success, true, response.body);
  return { who, response, body: response.json().data, ...credentialsOf(response) };
}

before(async () => {
  app = await buildApp({ logger: false });
  await app.ready();
});

after(async () => {
  // `login_attempts` is written without being awaited (see `service.logAttempt`),
  // so the last few writes of the suite are still in flight when this runs.
  await new Promise((resolve) => setTimeout(resolve, 250));

  const raw = app.prisma.$unfiltered();
  await raw.loginAttempt.deleteMany({ where: { identifier: { startsWith: RUN } } });
  await raw.otpChallenge.deleteMany({ where: { destination: { startsWith: RUN } } });
  await raw.otpChallenge.deleteMany({ where: { destination: { startsWith: PHONE_PREFIX } } });
  await raw.loginAttempt.deleteMany({ where: { identifier: { startsWith: PHONE_PREFIX } } });
  await raw.user.deleteMany({ where: { email: { startsWith: RUN } } });
  await app.close();
});

// ---------------------------------------------------------------------------

describe("registration", () => {
  it("creates an account, a credential and a session in one call", async () => {
    const { who, body } = await signUp();

    assert.equal(body.user.email, who.email.toLowerCase());
    assert.equal(body.user.role, "customer");
    assert.equal(body.user.isVerified, false, "a new account has verified nothing yet");
    assert.ok(body.accessToken && body.sessionId && body.accessTokenExpiresAt);

    const raw = app.prisma.$unfiltered();
    const credential = await raw.credential.findUnique({ where: { userId: body.user.id } });
    assert.ok(credential, "the credential row exists");
    assert.match(credential.passwordHash, /^\$argon2id\$/, "Argon2id, per the schema's own comment");
    assert.notEqual(credential.passwordHash, PASSWORD);

    const session = await raw.session.findUnique({ where: { id: body.sessionId } });
    assert.equal(session.userId, body.user.id);
    assert.equal(session.revokedAt, null);

    const tokens = await raw.refreshToken.findMany({ where: { sessionId: body.sessionId } });
    assert.equal(tokens.length, 1, "one refresh token, the head of the chain");
    assert.equal(tokens[0].tokenHash.length, 64, "SHA-256 hex — the token itself is not stored");
  });

  it("records the role assignment module 3 will read", async () => {
    const { body } = await signUp({ role: "delivery-rider" });
    assert.equal(body.user.role, "delivery-rider");

    const assignments = await app.prisma.$unfiltered().userRoleAssignment.findMany({
      where: { userId: body.user.id },
      include: { role: { select: { slug: true } } },
    });
    assert.deepEqual(assignments.map((row) => row.role.slug), ["delivery-rider"]);
  });

  it("normalises the phone number to E.164", async () => {
    const { body } = await signUp();
    assert.match(body.user.phone, /^\+8801\d{9}$/);
  });

  it("refuses a duplicate email as a refusal, not an exception", async () => {
    const { who } = await signUp();
    const again = await post("/register", { ...who, email: who.email.toUpperCase(), phone: "01999888777" });

    assert.equal(again.statusCode, 200, "a taken address is an answer, not a fault");
    assert.equal(again.json().success, false);
    assert.equal(again.json().error.key, "errors.emailTaken");
  });

  it("refuses a duplicate phone", async () => {
    const first = await signUp();
    const second = await post("/register", { ...identity(), phone: first.who.phone });
    assert.equal(second.json().error.key, "errors.phoneTaken");
  });

  it("rejects a short password at the schema, before any work is done", async () => {
    const response = await post("/register", { ...identity(), password: "short" });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, "BAD_USER_INPUT");
    assert.ok(response.json().error.details.some((detail) => detail.field === "password"));
  });

  it("rejects a malformed email", async () => {
    const response = await post("/register", { ...identity(), email: "not-an-address" });
    assert.equal(response.json().error.key, "errors.emailInvalid");
  });

  it("rejects a role self-registration may not grant", async () => {
    const response = await post("/register", { ...identity(), role: "super-admin" });
    assert.equal(response.statusCode, 400, "the enum is closed to three roles");
  });

  it("rejects a missing body", async () => {
    assert.equal((await post("/register", {})).statusCode, 400);
  });
});

// ---------------------------------------------------------------------------

describe("password sign-in", () => {
  it("signs in with the right password", async () => {
    const { who } = await signUp();
    const response = await post("/login", { email: who.email, password: PASSWORD });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().success, true);
    assert.equal(response.json().data.user.email, who.email.toLowerCase());
    assert.ok(credentialsOf(response).refresh, "the refresh token leaves as a cookie");
  });

  it("is case-insensitive on the address, as citext makes the column", async () => {
    const { who } = await signUp();
    const response = await post("/login", { email: `  ${who.email.toUpperCase()}  `, password: PASSWORD });
    assert.equal(response.json().success, true);
  });

  it("refuses the wrong password", async () => {
    const { who } = await signUp();
    const response = await post("/login", { email: who.email, password: "not the password" });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().error.key, "errors.invalidCredentials");
  });

  it("gives an unknown account exactly the same answer", async () => {
    const response = await post("/login", { email: `${RUN}-nobody@example.test`, password: PASSWORD });
    assert.equal(response.json().error.key, "errors.invalidCredentials");
  });

  it("refuses a suspended account", async () => {
    const { who, body } = await signUp();
    await app.prisma.user.update({ where: { id: body.user.id }, data: { status: "SUSPENDED" } });

    const response = await post("/login", { email: who.email, password: PASSWORD });
    assert.equal(response.json().error.key, "errors.accountSuspended");
  });

  it("refuses a banned account", async () => {
    const { who, body } = await signUp();
    await app.prisma.user.update({ where: { id: body.user.id }, data: { status: "BANNED" } });

    const response = await post("/login", { email: who.email, password: PASSWORD });
    assert.equal(response.json().error.key, "errors.accountSuspended");
  });

  it("lets a pending account in — verification is tracked separately", async () => {
    const { who, body } = await signUp();
    await app.prisma.user.update({ where: { id: body.user.id }, data: { status: "PENDING" } });

    assert.equal((await post("/login", { email: who.email, password: PASSWORD })).json().success, true);
  });

  it("treats a soft-deleted account as one that never existed", async () => {
    const { who, body } = await signUp();
    await app.prisma.user.update({ where: { id: body.user.id }, data: { deletedAt: new Date() } });

    const response = await post("/login", { email: who.email, password: PASSWORD });
    assert.equal(response.json().error.key, "errors.invalidCredentials", "not 'deleted' — that would confirm the address");
  });

  it("locks the credential after the configured number of failures", async () => {
    const { who, body } = await signUp();

    let last;
    for (let attempt = 0; attempt < env.authLockoutThreshold; attempt += 1) {
      last = await post("/login", { email: who.email, password: `wrong-${attempt}` });
    }
    assert.equal(last.json().error.key, "errors.accountLocked", "the failure that locks says so");

    const now = await post("/login", { email: who.email, password: PASSWORD });
    assert.equal(now.json().error.key, "errors.accountLocked", "the right password does not open a locked credential");

    const credential = await app.prisma.$unfiltered().credential.findUnique({ where: { userId: body.user.id } });
    assert.ok(credential.lockedUntil > new Date());
  });

  it("clears the failure counter on a successful sign-in", async () => {
    const { who, body } = await signUp();
    await post("/login", { email: who.email, password: "wrong" });
    await post("/login", { email: who.email, password: PASSWORD });

    const credential = await app.prisma.$unfiltered().credential.findUnique({ where: { userId: body.user.id } });
    assert.equal(credential.failedCount, 0);
    assert.equal(credential.lockedUntil, null);
  });

  it("writes a login_attempts row for a failure against an account that does not exist", async () => {
    const identifier = `${RUN}-ghost@example.test`;
    await post("/login", { email: identifier, password: PASSWORD });

    // The write is deliberately not awaited by the handler; give it a tick.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const attempts = await app.prisma.loginAttempt.findMany({ where: { identifier } });
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].success, false);
    assert.equal(attempts[0].userId, null);
    assert.equal(attempts[0].reason, "invalidCredentials");
  });
});

// ---------------------------------------------------------------------------

describe("access tokens", () => {
  it("accepts a valid one and answers with the account", async () => {
    const { who, body } = await signUp();
    const response = await get("/me", bearer(body.accessToken));

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.email, who.email.toLowerCase());
  });

  it("refuses a missing token", async () => {
    const response = await get("/me");
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "UNAUTHENTICATED");
    assert.equal(response.json().error.key, "errors.unauthenticated");
  });

  it("refuses a malformed token", async () => {
    assert.equal((await get("/me", bearer("not.a.jwt"))).statusCode, 401);
    assert.equal((await get("/me", bearer("Bearer"))).statusCode, 401);
  });

  it("refuses an expired token", async () => {
    const { body } = await signUp();
    // `expiresIn` will not take a negative, so the clock is moved instead: an
    // hour ago plus a one-second lifetime is a token that expired 59 minutes ago.
    const expired = app.jwt.sign(
      { sub: body.user.id, sessionId: body.sessionId, roles: ["customer"], permissions: [], epoch: 0, tokenType: "access" },
      { expiresIn: 1000, clockTimestamp: Date.now() - 3_600_000 },
    );
    assert.equal((await get("/me", bearer(expired))).statusCode, 401);
  });

  it("refuses a token signed with another key", async () => {
    const forged =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3JfaGFja2VyIiwidG9rZW5UeXBlIjoiYWNjZXNzIn0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    assert.equal((await get("/me", bearer(forged))).statusCode, 401);
  });

  it("refuses the opaque refresh token presented as a bearer credential", async () => {
    const { refresh } = await signUp();
    assert.equal((await get("/me", bearer(refresh))).statusCode, 401);
  });

  it("refuses a refresh *JWT* presented as a bearer credential", async () => {
    // Nothing mints these — the refresh credential is opaque — but the guard in
    // `plugins/auth.js` is what keeps that true if a later module reaches for
    // `signRefreshToken`, so it is worth a test of its own.
    const { body } = await signUp();
    const token = app.signRefreshToken({ sub: body.user.id, sessionId: body.sessionId });
    assert.equal((await get("/me", bearer(token))).statusCode, 401);
  });

  it("refuses a well-signed token whose account has since been suspended", async () => {
    const { body } = await signUp();
    assert.equal((await get("/me", bearer(body.accessToken))).statusCode, 200);

    await app.prisma.user.update({ where: { id: body.user.id }, data: { status: "SUSPENDED" } });
    assert.equal(
      (await get("/me", bearer(body.accessToken))).statusCode,
      401,
      "a live token must not outlive the account's right to use it",
    );
  });

  it("refuses a well-signed token whose account has since been soft-deleted", async () => {
    const { body } = await signUp();
    await app.prisma.user.update({ where: { id: body.user.id }, data: { deletedAt: new Date() } });
    assert.equal((await get("/me", bearer(body.accessToken))).statusCode, 401);
  });

  it("refuses a token that names no session", async () => {
    const { body } = await signUp();
    const sessionless = app.signAccessToken({ sub: body.user.id, roles: ["customer"], permissions: [], epoch: 0 });
    assert.equal((await get("/me", bearer(sessionless))).statusCode, 401);
  });
});

// ---------------------------------------------------------------------------

describe("refresh rotation", () => {
  it("exchanges the cookie for a new access token and a new refresh token", async () => {
    const first = await signUp();
    const response = await post("/refresh", undefined, { cookies: first.cookies, headers: first.headers });

    assert.equal(response.statusCode, 200);
    const next = credentialsOf(response);
    assert.ok(next.refresh);
    assert.notEqual(next.refresh, first.refresh, "the chain rotates; a token is spent once");
    assert.equal(response.json().data.sessionId, first.body.sessionId, "the same session, a new link");
  });

  it("links the new token to the one it replaced", async () => {
    const first = await signUp();
    await post("/refresh", undefined, { cookies: first.cookies, headers: first.headers });

    const chain = await app.prisma.$unfiltered().refreshToken.findMany({
      where: { sessionId: first.body.sessionId },
      orderBy: { issuedAt: "asc" },
    });
    assert.equal(chain.length, 2);
    assert.ok(chain[0].usedAt, "the head is spent");
    assert.equal(chain[1].parentId, chain[0].id);
  });

  it("accepts the token in the body, for a client with no cookie jar", async () => {
    const first = await signUp();
    const response = await post("/refresh", { refreshToken: first.refresh });
    assert.equal(response.statusCode, 200);
  });

  it("refuses the cookie without the CSRF header", async () => {
    const first = await signUp();
    const response = await post("/refresh", undefined, { cookies: first.cookies });
    assert.equal(response.statusCode, 401);
  });

  it("refuses a CSRF header that does not match the cookie", async () => {
    const first = await signUp();
    const response = await post("/refresh", undefined, {
      cookies: first.cookies,
      headers: { "x-csrf-token": "x".repeat(first.csrf.length) },
    });
    assert.equal(response.statusCode, 401);
  });

  it("refuses an unknown token", async () => {
    const response = await post("/refresh", { refreshToken: "a".repeat(43) });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, "UNAUTHENTICATED");
  });

  it("refuses an expired token", async () => {
    const first = await signUp();
    await app.prisma.$unfiltered().refreshToken.updateMany({
      where: { sessionId: first.body.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal((await post("/refresh", { refreshToken: first.refresh })).statusCode, 401);
  });

  it("treats a replayed token as theft and kills the whole session", async () => {
    const first = await signUp();
    const rotated = credentialsOf(await post("/refresh", { refreshToken: first.refresh }));

    const replay = await post("/refresh", { refreshToken: first.refresh });
    assert.equal(replay.statusCode, 401, "the spent link is refused");

    const afterwards = await post("/refresh", { refreshToken: rotated.refresh });
    assert.equal(afterwards.statusCode, 401, "and the live link dies with it");

    const session = await app.prisma.$unfiltered().session.findUnique({ where: { id: first.body.sessionId } });
    assert.ok(session.revokedAt);
    assert.equal(session.revokeReason, "ROTATION_REUSE");
  });

  it("refuses a token whose session was revoked", async () => {
    const first = await signUp();
    await post("/logout", undefined, { cookies: first.cookies, headers: first.headers });
    assert.equal((await post("/refresh", { refreshToken: first.refresh })).statusCode, 401);
  });

  it("refuses to refresh a suspended account and revokes the session", async () => {
    const first = await signUp();
    await app.prisma.user.update({ where: { id: first.body.user.id }, data: { status: "SUSPENDED" } });

    assert.equal((await post("/refresh", { refreshToken: first.refresh })).statusCode, 401);
    const session = await app.prisma.$unfiltered().session.findUnique({ where: { id: first.body.sessionId } });
    assert.ok(session.revokedAt);
  });

  it("clears the cookies when it refuses, so a dead chain stops being presented", async () => {
    const response = await post("/refresh", { refreshToken: "b".repeat(43) });
    const cleared = response.cookies.filter((cookie) => cookie.value === "");
    assert.equal(cleared.length, 2);
  });
});

// ---------------------------------------------------------------------------

describe("logout", () => {
  it("revokes the session and every token on it", async () => {
    const first = await signUp();
    const response = await post("/logout", undefined, { cookies: first.cookies, headers: first.headers });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.revoked, 1);

    const session = await app.prisma.$unfiltered().session.findUnique({ where: { id: first.body.sessionId } });
    assert.equal(session.revokeReason, "LOGOUT");

    const live = await app.prisma.$unfiltered().refreshToken.count({
      where: { sessionId: first.body.sessionId, revokedAt: null },
    });
    assert.equal(live, 0);
  });

  it("refuses a refresh after it", async () => {
    const first = await signUp();
    await post("/logout", undefined, { cookies: first.cookies, headers: first.headers });
    assert.equal((await post("/refresh", { refreshToken: first.refresh })).statusCode, 401);
  });

  it("invalidates the access token too, because the session is gone", async () => {
    const first = await signUp();
    await post("/logout", undefined, { cookies: first.cookies, headers: first.headers });
    assert.equal((await get("/me", bearer(first.body.accessToken))).statusCode, 401);
  });

  it("is idempotent — signing out twice is not an error", async () => {
    const first = await signUp();
    await post("/logout", undefined, { cookies: first.cookies, headers: first.headers });
    const again = await post("/logout", undefined, { cookies: first.cookies, headers: first.headers });
    assert.equal(again.statusCode, 200);
    assert.equal(again.json().data.revoked, 0);
  });

  it("signs out with no credential at all, and still clears the cookies", async () => {
    const response = await post("/logout", undefined);
    assert.equal(response.statusCode, 200);
    assert.equal(response.cookies.filter((cookie) => cookie.value === "").length, 2);
  });

  it("ends every session when asked, using a bearer token", async () => {
    const { who } = await signUp();
    const a = credentialsOf(await post("/login", { email: who.email, password: PASSWORD }));
    const b = await post("/login", { email: who.email, password: PASSWORD });
    const bodyB = b.json().data;

    const response = await post("/logout", { allDevices: true }, bearer(bodyB.accessToken));
    assert.equal(response.statusCode, 200);
    assert.ok(response.json().data.revoked >= 2);

    assert.equal((await post("/refresh", { refreshToken: a.refresh })).statusCode, 401);
    assert.equal((await get("/me", bearer(bodyB.accessToken))).statusCode, 401);
  });
});

// ---------------------------------------------------------------------------

describe("one-time codes", () => {
  const otpFor = (destination, purpose = "login") =>
    post("/otp/request", { destination, channel: "sms", purpose });

  it("issues a code and signs the account in with it", async () => {
    const { who } = await signUp();
    const issued = await otpFor(who.phone);

    assert.equal(issued.statusCode, 200);
    assert.equal(issued.json().data.resendAfterSeconds, env.authOtpResendSeconds);
    assert.match(issued.json().data.destination, /^\+880/, "normalised to E.164 and echoed back");

    const verified = await post("/otp/verify", {
      destination: who.phone,
      code: issued.json().data.code,
      channel: "sms",
      purpose: "login",
    });
    assert.equal(verified.statusCode, 200);
    assert.equal(verified.json().data.user.email, who.email.toLowerCase());
    assert.equal(verified.json().data.user.isVerified, true, "an SMS code verifies the number it was sent to");
  });

  it("succeeds for a number no account holds — an oracle would be the bug", async () => {
    const response = await otpFor(phoneNumber());
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().success, true);
  });

  it("refuses to sign in a number no account holds, once the code is proved", async () => {
    const destination = phoneNumber();
    const issued = await otpFor(destination);
    const verified = await post("/otp/verify", { destination, code: issued.json().data.code, channel: "sms" });
    assert.equal(verified.json().error.key, "errors.accountNotFound");
  });

  it("refuses a wrong code", async () => {
    const { who } = await signUp();
    const issued = await otpFor(who.phone);
    const wrong = String((Number(issued.json().data.code) + 1) % 1_000_000).padStart(6, "0");

    const verified = await post("/otp/verify", { destination: who.phone, code: wrong, channel: "sms" });
    assert.equal(verified.json().error.key, "errors.invalidOtp");
  });

  it("stops accepting codes once the attempts are used up", async () => {
    const { who } = await signUp();
    const issued = await otpFor(who.phone);
    const code = issued.json().data.code;
    const wrong = String((Number(code) + 7) % 1_000_000).padStart(6, "0");

    let last;
    for (let attempt = 0; attempt < env.authOtpMaxAttempts; attempt += 1) {
      last = await post("/otp/verify", { destination: who.phone, code: wrong, channel: "sms" });
    }
    assert.equal(last.json().error.key, "errors.otpAttemptsExhausted");

    const right = await post("/otp/verify", { destination: who.phone, code, channel: "sms" });
    assert.equal(right.json().error.key, "errors.otpAttemptsExhausted", "the right code does not reopen it");
  });

  it("refuses an expired code", async () => {
    const { who } = await signUp();
    const issued = await otpFor(who.phone);
    await app.prisma.otpChallenge.updateMany({
      where: { destination: issued.json().data.destination },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const verified = await post("/otp/verify", { destination: who.phone, code: issued.json().data.code, channel: "sms" });
    assert.equal(verified.json().error.key, "errors.otpExpired");
  });

  it("refuses a code that was already spent", async () => {
    const { who } = await signUp();
    const issued = await otpFor(who.phone);
    const code = issued.json().data.code;

    await post("/otp/verify", { destination: who.phone, code, channel: "sms" });
    const replay = await post("/otp/verify", { destination: who.phone, code, channel: "sms" });
    assert.equal(replay.json().error.key, "errors.invalidOtp");
  });

  it("refuses a verify with no challenge in flight", async () => {
    const response = await post("/otp/verify", { destination: phoneNumber(), code: "123456", channel: "sms" });
    assert.equal(response.json().error.key, "errors.otpNotRequested");
  });

  it("refuses a resend inside the cooldown", async () => {
    const { who } = await signUp();
    await otpFor(who.phone);
    assert.equal((await otpFor(who.phone)).json().error.key, "errors.otpTooSoon");
  });

  it("checks a code without signing anyone in, for a purpose that is not a sign-in", async () => {
    const { who } = await signUp();
    const issued = await otpFor(who.phone, "reset-password");
    const verified = await post("/otp/verify", {
      destination: who.phone,
      code: issued.json().data.code,
      channel: "sms",
      purpose: "reset-password",
    });

    assert.equal(verified.json().data.verified, true);
    assert.equal(verified.json().data.accessToken, undefined, "no session — that is not what this code was for");
  });

  it("stores only the hash of the code", async () => {
    const { who } = await signUp();
    const issued = await otpFor(who.phone);
    const challenge = await app.prisma.otpChallenge.findFirst({
      where: { destination: issued.json().data.destination },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(challenge.codeHash.length, 64);
    assert.notEqual(challenge.codeHash, issued.json().data.code);
  });
});

// ---------------------------------------------------------------------------

describe("password reset", () => {
  it("answers the same for a known and an unknown address", async () => {
    const { who } = await signUp();
    const known = await post("/password/forgot", { email: who.email });
    const unknown = await post("/password/forgot", { email: `${RUN}-nobody2@example.test` });

    assert.equal(known.json().success, true);
    assert.equal(unknown.json().success, true);
    assert.equal(unknown.json().data.email, `${RUN}-nobody2@example.test`);
    assert.equal(unknown.json().data.token, undefined, "no token is minted for an account that is not there");
  });

  it("changes the password and lets the new one in", async () => {
    const { who } = await signUp();
    const token = (await post("/password/forgot", { email: who.email })).json().data.token;

    const reset = await post("/password/reset", { token, password: "an entirely different phrase" });
    assert.equal(reset.statusCode, 200);
    assert.equal(reset.json().success, true);

    assert.equal((await post("/login", { email: who.email, password: PASSWORD })).json().success, false);
    assert.equal((await post("/login", { email: who.email, password: "an entirely different phrase" })).json().success, true);
  });

  it("revokes every session and kills the access tokens with them", async () => {
    const first = await signUp();
    const token = (await post("/password/forgot", { email: first.who.email })).json().data.token;

    assert.equal((await get("/me", bearer(first.body.accessToken))).statusCode, 200);
    await post("/password/reset", { token, password: "yet another passphrase" });

    assert.equal((await get("/me", bearer(first.body.accessToken))).statusCode, 401, "tokenEpoch moved");
    assert.equal((await post("/refresh", { refreshToken: first.refresh })).statusCode, 401);

    const credential = await app.prisma.$unfiltered().credential.findUnique({ where: { userId: first.body.user.id } });
    assert.equal(credential.tokenEpoch, 1);
  });

  it("refuses a token that has already been spent", async () => {
    const { who } = await signUp();
    const token = (await post("/password/forgot", { email: who.email })).json().data.token;
    await post("/password/reset", { token, password: "the first replacement" });

    const again = await post("/password/reset", { token, password: "the second replacement" });
    assert.equal(again.json().error.key, "errors.resetTokenInvalid");
  });

  it("refuses an unknown or expired token with the same key", async () => {
    const unknown = await post("/password/reset", { token: "z".repeat(43), password: "some new passphrase" });
    assert.equal(unknown.json().error.key, "errors.resetTokenInvalid");

    const { who } = await signUp();
    const token = (await post("/password/forgot", { email: who.email })).json().data.token;
    await app.prisma.passwordReset.updateMany({ where: { consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await post("/password/reset", { token, password: "another passphrase" })).json().error.key, "errors.resetTokenInvalid");
  });

  it("refuses reusing the current password", async () => {
    const { who } = await signUp();
    const token = (await post("/password/forgot", { email: who.email })).json().data.token;
    assert.equal((await post("/password/reset", { token, password: PASSWORD })).json().error.key, "errors.samePassword");
  });

  it("rejects a short replacement at the schema", async () => {
    const response = await post("/password/reset", { token: "y".repeat(43), password: "tiny" });
    assert.equal(response.statusCode, 400);
  });
});

// ---------------------------------------------------------------------------

describe("what must never leave", () => {
  /** Every string that would be a finding if it appeared in a response body. */
  const FORBIDDEN = ["passwordHash", "$argon2", "tokenHash", "codeHash", "blockReason", "blockedById", "failedCount", "lockedUntil", "tokenEpoch", "primaryRole"];

  const clean = (body, where) => {
    for (const needle of FORBIDDEN) {
      assert.ok(!body.includes(needle), `${where} leaked "${needle}": ${body.slice(0, 300)}`);
    }
    assert.ok(!body.includes(PASSWORD), `${where} echoed the password back`);
  };

  it("keeps them out of every successful response", async () => {
    const { who, body, cookies, headers } = await signUp();
    clean((await post("/login", { email: who.email, password: PASSWORD })).body, "login");
    clean((await get("/me", bearer(body.accessToken))).body, "me");
    clean((await post("/refresh", undefined, { cookies, headers })).body, "refresh");
  });

  it("keeps them out of every failure, and sends no stack trace", async () => {
    const { who } = await signUp();
    clean((await post("/login", { email: who.email, password: "wrong" })).body, "bad password");
    clean((await post("/register", { ...who, password: "x" })).body, "bad input");

    const unauthorised = await get("/me");
    clean(unauthorised.body, "unauthenticated");
    assert.equal(unauthorised.json().error.details, undefined);
    assert.ok(!unauthorised.body.includes("at Object."), "no stack frames");
  });

  it("never puts a permission or a hash in the access token's claims", async () => {
    const { body } = await signUp();
    const claims = app.jwt.decode(body.accessToken);

    assert.deepEqual(Object.keys(claims).sort(), ["epoch", "exp", "iat", "permissions", "roles", "sessionId", "sub", "tokenType"]);
    assert.deepEqual(claims.permissions, [], "authorization is module 3; the claim is a placeholder");
    assert.deepEqual(claims.roles, ["customer"]);
    assert.equal(claims.tokenType, "access");
  });

  it("does not put the refresh token in the response body", async () => {
    const { response, refresh } = await signUp();
    assert.ok(refresh, "it exists");
    assert.ok(!response.body.includes(refresh), "and it travels only as an HttpOnly cookie");
  });

  it("scopes the refresh cookie to the auth path and hides it from script", async () => {
    const { response } = await signUp();
    const cookie = response.cookies.find((entry) => entry.name === "foodora_rt");
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.path, env.authCookiePath);

    const csrf = response.cookies.find((entry) => entry.name === "csrf");
    assert.notEqual(csrf.httpOnly, true, "the double-submit cookie has to be readable");
    assert.equal(csrf.path, "/");
  });
});

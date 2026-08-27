#!/usr/bin/env node
/**
 * auth-flow.js — the module 2 lifecycle, driven over a real socket.
 *
 * STEP 15 is explicit that the module is not complete on unit tests: the whole
 * sequence has to run end to end. This is that run, and it is deliberately *not*
 * `app.inject()` — it binds a port, speaks HTTP over it with `fetch`, and keeps a
 * cookie jar, because three of the properties being checked only exist outside
 * the injection path:
 *
 *  - the refresh cookie's `Path`, `HttpOnly` and `Max-Age` attributes, as a real
 *    client would receive and re-present them;
 *  - the CSRF double-submit, with the header echoed from the cookie the way a
 *    browser makes a client do it;
 *  - the rate limiter, which the test suite turns off (`RATE_LIMIT_ENABLED=false`)
 *    and which is the only brute-force defence that fires before the credential
 *    lockout does.
 *
 * It leaves nothing behind: the account it creates is hard-deleted at the end,
 * cascades taking the session, the refresh chain, the credential, the settings
 * and the role assignment with it.
 *
 *     npm run auth:flow
 */
process.env.NODE_ENV ??= "development";
// The flow spends an OTP and a reset token, and there is no provider to read
// them from. The environment refuses this in production.
process.env.AUTH_ECHO_SECRETS = "1";
// Tight enough that the last step reaches it in a handful of requests.
process.env.AUTH_RATE_MAX ??= "8";
process.env.LOG_LEVEL ??= "silent";

const { buildApp } = await import("../src/app.js");
const { default: env } = await import("../src/config/env.js");

let failures = 0;
let checks = 0;

function check(label, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const step = (title) => console.log(`\n${title}`);

// ---------------------------------------------------------------------------
// A cookie jar, because the point is to behave like a browser
// ---------------------------------------------------------------------------

const jar = new Map();

/** Record `Set-Cookie`, including the attributes the assertions read. */
function absorb(response) {
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair, ...attributes] = line.split(";").map((part) => part.trim());
    const index = pair.indexOf("=");
    const name = pair.slice(0, index);
    const value = decodeURIComponent(pair.slice(index + 1));
    const meta = Object.fromEntries(
      attributes.map((attribute) => {
        const eq = attribute.indexOf("=");
        return eq < 0 ? [attribute.toLowerCase(), true] : [attribute.slice(0, eq).toLowerCase(), attribute.slice(eq + 1)];
      }),
    );
    if (value === "") jar.delete(name);
    else jar.set(name, { value, meta });
  }
}

const cookieHeader = () => [...jar].map(([name, entry]) => `${name}=${encodeURIComponent(entry.value)}`).join("; ");

let base;

async function call(path, { method = "POST", body, token } = {}) {
  // Only when there is one: Fastify refuses `content-type: application/json`
  // with an empty body, and `session.ts` posts to /refresh with neither.
  const headers = body === undefined ? {} : { "content-type": "application/json" };
  if (jar.size > 0) headers.cookie = cookieHeader();
  if (jar.has("csrf")) headers["x-csrf-token"] = jar.get("csrf").value;
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  absorb(response);

  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }
  return { status: response.status, body: payload };
}

// ---------------------------------------------------------------------------

const app = await buildApp();
await app.listen({ host: "127.0.0.1", port: 0 });
base = `http://127.0.0.1:${app.server.address().port}${env.apiPrefix}/auth`;

const stamp = Date.now();
const account = {
  name: "Auth Flow",
  email: `auth-flow-${stamp}@example.test`,
  phone: `01${String(stamp).slice(-9)}`,
  password: "correct horse battery staple",
};
let createdUserId = null;

try {
  console.log(`FoodOra — module 2 auth lifecycle against ${base}\n`);

  // -- 1. Register ----------------------------------------------------------
  step("1. Register");
  {
    const { status, body } = await call("/register", { body: { ...account, role: "customer" } });
    check("registers and returns a session", status === 200 && body.success === true, JSON.stringify(body));
    createdUserId = body.data?.user?.id ?? null;
    check("the user read model is the frontend's", body.data?.user?.role === "customer" && Array.isArray(body.data?.user?.permissions));
    check("no password or hash comes back", !JSON.stringify(body).includes(account.password) && !JSON.stringify(body).includes("argon2"));

    const refresh = jar.get("foodora_rt");
    check("the refresh token is HttpOnly", Boolean(refresh?.meta.httponly));
    check(`the refresh cookie is scoped to ${env.authCookiePath}`, refresh?.meta.path === env.authCookiePath, refresh?.meta.path);
    check("the csrf cookie is readable and site-wide", jar.has("csrf") && !jar.get("csrf").meta.httponly && jar.get("csrf").meta.path === "/");
    check("the refresh token is not in the body", !JSON.stringify(body).includes(refresh.value));
  }

  // -- 2. Sign in -----------------------------------------------------------
  step("2. Sign in with the password");
  let access;
  {
    const wrong = await call("/login", { body: { email: account.email, password: "not it" } });
    check("a wrong password is a 200 refusal, not a 4xx", wrong.status === 200 && wrong.body.success === false);
    check("and its key is the one the form renders", wrong.body.error.key === "errors.invalidCredentials", wrong.body.error.key);

    const { status, body } = await call("/login", { body: { email: account.email, password: account.password } });
    check("the right password signs in", status === 200 && body.success === true);
    access = body.data.accessToken;
  }

  // -- 3. A protected endpoint ---------------------------------------------
  step("3. Reach a protected endpoint");
  {
    const anonymous = await fetch(`${base}/me`);
    check("no token is 401 in the error contract", anonymous.status === 401);

    const { status, body } = await call("/me", { method: "GET", token: access });
    check("the access token is accepted", status === 200 && body.data.email === account.email);

    const asBearer = await fetch(`${base}/me`, { headers: { authorization: `Bearer ${jar.get("foodora_rt").value}` } });
    check("the refresh token is refused as a bearer credential", asBearer.status === 401);
  }

  // -- 4. Refresh -----------------------------------------------------------
  step("4. Rotate the refresh token");
  let spent;
  {
    spent = jar.get("foodora_rt").value;
    const { status, body } = await call("/refresh");
    check("the cookie plus the CSRF header rotates the chain", status === 200 && body.success === true);
    check("a new refresh token replaces the old one", jar.get("foodora_rt").value !== spent);
    check("the session id is unchanged", body.data.sessionId.startsWith("ses_"));
    access = body.data.accessToken;

    const noCsrf = await fetch(`${base}/refresh`, { method: "POST", headers: { cookie: cookieHeader() } });
    check("without the CSRF header it is refused", noCsrf.status === 401);
  }

  // -- 5. Reuse detection ---------------------------------------------------
  step("5. Replay the spent token");
  {
    const live = jar.get("foodora_rt").value;
    const replay = await call("/refresh", { body: { refreshToken: spent } });
    check("the spent link is refused", replay.status === 401);

    const after = await call("/refresh", { body: { refreshToken: live } });
    check("and the live link dies with the session", after.status === 401);

    const me = await call("/me", { method: "GET", token: access });
    check("the access token stops working immediately", me.status === 401);
  }

  // -- 6. Sign in again, then out ------------------------------------------
  step("6. Sign out");
  {
    jar.clear();
    const signedIn = await call("/login", { body: { email: account.email, password: account.password } });
    access = signedIn.body.data.accessToken;
    const refresh = jar.get("foodora_rt").value;

    const out = await call("/logout", { body: { allDevices: false } });
    check("logout succeeds", out.status === 200 && out.body.success === true);
    check("it revoked exactly this session", out.body.data.revoked === 1, JSON.stringify(out.body.data));
    check("the cookies are cleared", !jar.has("foodora_rt") && !jar.has("csrf"));

    const again = await call("/refresh", { body: { refreshToken: refresh } });
    check("refreshing afterwards is refused", again.status === 401);

    const me = await call("/me", { method: "GET", token: access });
    check("the access token is dead too", me.status === 401);

    const twice = await call("/logout", { body: {} });
    check("signing out twice is not an error", twice.status === 200);
  }

  // -- 7. OTP ---------------------------------------------------------------
  step("7. Sign in with a one-time code");
  {
    jar.clear();
    const issued = await call("/otp/request", { body: { destination: account.phone, channel: "sms", purpose: "login" } });
    check("a code is issued", issued.status === 200 && issued.body.success === true);
    check("the destination comes back in E.164", issued.body.data.destination.startsWith("+880"));

    const tooSoon = await call("/otp/request", { body: { destination: account.phone, channel: "sms", purpose: "login" } });
    check("a resend inside the cooldown is refused", tooSoon.body.error?.key === "errors.otpTooSoon");

    const wrong = await call("/otp/verify", {
      body: { destination: account.phone, code: "000000" === issued.body.data.code ? "111111" : "000000", channel: "sms" },
    });
    check("a wrong code is refused", wrong.body.error?.key === "errors.invalidOtp", JSON.stringify(wrong.body));

    const { status, body } = await call("/otp/verify", {
      body: { destination: account.phone, code: issued.body.data.code, channel: "sms", purpose: "login" },
    });
    check("the right code signs in", status === 200 && body.success === true);
    check("and marks the number verified", body.data.user.isVerified === true);
  }

  // -- 8. Password reset ----------------------------------------------------
  step("8. Reset the password");
  {
    const unknown = await call("/password/forgot", { body: { email: `nobody-${stamp}@example.test` } });
    check("an unknown address answers success — no enumeration", unknown.status === 200 && unknown.body.success === true);
    check("and mints nothing", unknown.body.data.token === undefined);

    const requested = await call("/password/forgot", { body: { email: account.email } });
    const token = requested.body.data.token;
    check("a known address mints a token", typeof token === "string");

    const same = await call("/password/reset", { body: { token, password: account.password } });
    check("reusing the current password is refused", same.body.error?.key === "errors.samePassword");

    const replacement = "an entirely different passphrase";
    const reset = await call("/password/reset", { body: { token, password: replacement } });
    check("the reset succeeds", reset.status === 200 && reset.body.success === true);

    const spentToken = await call("/password/reset", { body: { token, password: "one more passphrase" } });
    check("the token cannot be spent twice", spentToken.body.error?.key === "errors.resetTokenInvalid");

    const old = await call("/login", { body: { email: account.email, password: account.password } });
    check("the old password no longer works", old.body.success === false);

    const now = await call("/login", { body: { email: account.email, password: replacement } });
    check("the new one does", now.status === 200 && now.body.success === true);
    account.password = replacement;
  }

  // -- 9. Blocked account ---------------------------------------------------
  step("9. Suspend the account");
  {
    jar.clear();
    const signedIn = await call("/login", { body: { email: account.email, password: account.password } });
    const token = signedIn.body.data.accessToken;

    await app.prisma.user.update({ where: { id: createdUserId }, data: { status: "SUSPENDED" } });

    const me = await call("/me", { method: "GET", token });
    check("a live access token stops working the moment the account is suspended", me.status === 401);

    const login = await call("/login", { body: { email: account.email, password: account.password } });
    check("signing in says so", login.body.error?.key === "errors.accountSuspended", JSON.stringify(login.body));

    await app.prisma.user.update({ where: { id: createdUserId }, data: { status: "ACTIVE" } });
  }

  // -- 10. The rate limiter -------------------------------------------------
  step("10. Brute force");
  {
    jar.clear();
    let limited = null;
    for (let attempt = 0; attempt < env.authRateMax + 4 && !limited; attempt += 1) {
      const response = await call("/login", { body: { email: account.email, password: `guess-${attempt}` } });
      if (response.status === 429) limited = response;
    }
    check(`the limiter fires within ${env.authRateMax + 4} guesses`, Boolean(limited));
    check("and answers 429 in the error contract", limited?.body?.error?.code === "TOO_MANY_REQUESTS", JSON.stringify(limited?.body));
    check("with the i18n key the client renders", limited?.body?.error?.key === "errors.tooManyRequests");
  }

  // -- 11. What the database holds -----------------------------------------
  step("11. What was written");
  {
    const raw = app.prisma.$unfiltered();
    const credential = await raw.credential.findUnique({ where: { userId: createdUserId } });
    check("the password is an Argon2id hash", credential.passwordHash.startsWith("$argon2id$"));
    check("tokenEpoch moved with the reset", credential.tokenEpoch === 1, String(credential.tokenEpoch));

    const sessions = await raw.session.findMany({ where: { userId: createdUserId } });
    check("every session is accounted for", sessions.length > 0);
    check(
      "each revoked session carries a reason",
      sessions.filter((session) => session.revokedAt).every((session) => session.revokeReason),
    );

    const tokens = await raw.refreshToken.findMany({ where: { session: { userId: createdUserId } } });
    check("only hashes of refresh tokens are stored", tokens.every((token) => /^[0-9a-f]{64}$/.test(token.tokenHash)));

    const attempts = await raw.loginAttempt.count({ where: { userId: createdUserId } });
    check("the attempt log recorded the run", attempts > 0, String(attempts));
  }
} finally {
  if (createdUserId) {
    // `login_attempts` is written fire-and-forget, so give the last few writes a
    // moment to land — otherwise the cleanup races them and leaves rows behind.
    await new Promise((resolve) => setTimeout(resolve, 250));

    const raw = app.prisma.$unfiltered();
    const tail = String(stamp).slice(-9);
    // Both keys: a failure against a known account carries the user id, one
    // against a bare destination (a wrong OTP code) carries only the identifier.
    await raw.loginAttempt.deleteMany({
      where: { OR: [{ userId: createdUserId }, { identifier: { contains: tail } }] },
    });
    await raw.otpChallenge.deleteMany({ where: { destination: { contains: tail } } });
    await raw.user.delete({ where: { id: createdUserId } });
  }
  await app.close();
}

console.log(`\n${failures === 0 ? "✓" : "✗"} ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);

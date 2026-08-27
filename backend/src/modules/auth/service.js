/**
 * service.js — the authentication rules, and only the rules.
 *
 * Every function here returns one of two things and never a status code:
 *
 *  - `{ session, user }` (or a small payload) on success, which the controller
 *    wraps in `ok()`;
 *  - `{ refusal: "errors.…" }`, which the controller returns as **HTTP 200**
 *    with `{ success: false, error: { key } }`.
 *
 * That split is `shared/errors/envelope.js`'s and it is the reason a wrong
 * password does not appear in the error log. The exceptions the module *does*
 * throw — an unusable refresh credential, a missing CSRF header — are
 * `AppError`s, because they are not answers to a question anybody meant to ask.
 *
 * ## What is deliberately not here
 *
 * **Authorization.** `permissions` on the read model is `[]` and the access
 * token's claim is `[]`, in every path. Resolving `role grants ∪ direct grants −
 * denials` is module 3's whole job (BACKEND-REQUIREMENTS §3), the tables it reads
 * are seeded and this module writes the `user_role_assignments` row it will read,
 * but nothing here decides what an account may do. `request.user.roles` carries
 * the account's role because authorization will need an identity to work from —
 * that is the line STEP 17 draws and this file stays on the near side of it.
 */
import env from "../../config/env.js";
import { unauthenticated } from "../../shared/errors/app-error.js";
import { toApiEnum } from "../../shared/utils/enums.js";
import { ID_PREFIXES } from "../../shared/constants/id-prefixes.js";
import { newId } from "../../shared/utils/ids.js";
import { AUTH_ERRORS, attemptReason } from "./errors.js";
import { hashPassword, passwordProblem, verifyOrDummy, verifyPassword } from "./utils/password.js";
import { digestsEqual, hashToken, mintOtpCode, mintToken } from "./utils/tokens.js";
import { isE164, isEmail, normalizeEmail, normalizeDestination, normalizePhone } from "./utils/normalize.js";

const DAY_MS = 86_400_000;

/**
 * The frontend's OTP purposes, mapped to the schema's.
 *
 * Two of the four are spelled differently on each side — `lib/graphql/
 * auth.operations.ts` sends `verify-phone` and `reset-password`, while
 * `OtpPurpose` stores `phone-verify` and `password-reset`. Both spellings are
 * accepted so neither side has to change, and the schema's own values are
 * accepted too so a direct API client is not forced to learn the client's
 * vocabulary.
 */
const OTP_PURPOSES = Object.freeze({
  login: "login",
  register: "register",
  "verify-phone": "phone-verify",
  "phone-verify": "phone-verify",
  "reset-password": "password-reset",
  "password-reset": "password-reset",
  "two-factor": "two-factor",
});

/** The purposes that end in a signed-in session. */
const SIGN_IN_PURPOSES = new Set(["login", "register", "phone-verify"]);

/**
 * A `User` row → `types/user.ts::User`, field for field.
 *
 * Built by naming each field rather than spreading the row: a spread would ship
 * `status`, `blockReason` and `blockedById` to a customer's browser the moment
 * the `select` widened, and the read model the components consume has not
 * changed since Phase C.
 */
export function toUserReadModel(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? null,
    avatar: row.avatar ?? "",
    role: toApiEnum("UserRoleSlug", row.primaryRole),
    /** Module 3. See the header. */
    permissions: [],
    countryCode: row.countryCode,
    currency: row.currency,
    locale: row.locale,
    isVerified: Boolean(row.isVerified),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

/**
 * May this account sign in, and if not, what does the form say?
 *
 * `active` and `pending` both may. `pending` is an *administrative* state, not
 * "has not confirmed their email" — the schema tracks that separately in
 * `isVerified` / `emailVerifiedAt` / `phoneVerifiedAt`, registration creates an
 * account with `isVerified: false`, and the frontend has no gate that would let a
 * customer verify from a signed-out screen. Refusing `pending` here would create
 * accounts nobody could ever get into.
 */
export function accountRefusal(user) {
  if (!user || user.deletedAt) return AUTH_ERRORS.invalidCredentials;
  const status = toApiEnum("UserStatus", user.status);
  if (status === "suspended" || status === "banned") return AUTH_ERRORS.accountSuspended;
  return null;
}

export function createService({ app, repo }) {
  const log = app.log;

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  /**
   * The access token, and the exact moment it stops working.
   *
   * `accessTokenExpiresAt` is read back out of the token rather than recomputed
   * from `JWT_ACCESS_TTL`: the client renews 60 seconds before this timestamp
   * (`lib/graphql/session.ts`), so a value that disagreed with the token's own
   * `exp` by even a little would show up as intermittent 401s nobody can
   * reproduce. Decoding is exact and needs no duration parser.
   */
  function issueAccessToken({ user, sessionId, epoch }) {
    const token = app.signAccessToken({
      sub: user.id,
      sessionId,
      roles: [toApiEnum("UserRoleSlug", user.primaryRole)],
      permissions: [],
      epoch,
    });
    const { exp } = app.jwt.decode(token);
    return { accessToken: token, accessTokenExpiresAt: new Date(exp * 1000) };
  }

  /** Open a session, mint its first refresh token, and hand back what the client needs. */
  async function startSession({ user, rememberMe, ip, userAgent, device, epoch }) {
    const deviceId = device?.installId
      ? (await repo.upsertDevice({ userId: user.id, ...device, locale: user.locale })).id
      : null;

    const days = rememberMe ? env.authSessionRememberTtlDays : env.authSessionTtlDays;
    const expiresAt = new Date(Date.now() + days * DAY_MS);
    const refreshToken = mintToken();

    const session = await repo.createSession({
      userId: user.id,
      deviceId,
      rememberMe,
      ip,
      userAgent,
      expiresAt,
      tokenHash: hashToken(refreshToken),
      // The chain's links expire with the session: a link that outlived it would
      // be a credential revocation could not reason about.
      tokenExpiresAt: expiresAt,
    });

    const access = issueAccessToken({ user, sessionId: session.id, epoch });

    return {
      refreshToken,
      expiresAt,
      payload: {
        accessToken: access.accessToken,
        accessTokenExpiresAt: access.accessTokenExpiresAt.toISOString(),
        sessionId: session.id,
        user: toUserReadModel(user),
      },
    };
  }

  /**
   * Record an attempt without making the response wait for it, or fail with it.
   *
   * The log is evidence, not part of the transaction: a customer who typed the
   * right password should not get a 500 because an append-only table was
   * momentarily unwritable.
   */
  function logAttempt(entry) {
    repo.logAttempt(entry).catch((error) => log.warn({ err: error }, "could not record login attempt"));
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  async function register(input, context) {
    const email = normalizeEmail(input.email);
    if (!isEmail(email)) return { refusal: AUTH_ERRORS.emailInvalid };

    const weak = passwordProblem(input.password);
    if (weak) return { refusal: AUTH_ERRORS[weak] };

    const country = await repo.findCountry(input.countryCode ?? env.authDefaultCountry);
    if (!country) {
      // A configured default that is not in `countries` is our misconfiguration,
      // not the caller's input — and the FK would reject the insert anyway.
      throw new Error(`AUTH_DEFAULT_COUNTRY "${env.authDefaultCountry}" is not a seeded country`);
    }

    const phone = input.phone ? normalizePhone(input.phone, country.dialCode) : "";
    if (input.phone && !isE164(phone)) return { refusal: AUTH_ERRORS.phoneInvalid };

    const clash = await repo.findConflicting(email, phone || null);
    if (clash) {
      return { refusal: clash.email === email ? AUTH_ERRORS.emailTaken : AUTH_ERRORS.phoneTaken };
    }

    const role = input.role ?? "customer";
    const roleRow = await repo.findRoleBySlug(role);
    if (!roleRow) log.warn({ role }, "no Role row for the registered slug — the assignment is skipped");

    let user;
    try {
      user = await repo.createAccount({
        id: newId(ID_PREFIXES.user),
        name: input.name.trim(),
        email,
        phone: phone || null,
        passwordHash: await hashPassword(input.password),
        role,
        countryCode: country.code,
        currency: country.currencyCode,
        locale: input.locale ?? country.defaultLocale,
        timezone: country.timezone,
        marketingOptIn: input.marketingOptIn,
        roleId: roleRow?.id ?? null,
      });
    } catch (error) {
      // Two requests for the same address, or an address held by a soft-deleted
      // row the pre-check through `$unfiltered()` should have caught. Either way
      // the form wants `errors.emailTaken`, not a 409 it has no branch for.
      if (error?.code === "P2002") {
        const target = String(error.meta?.target ?? "");
        logAttempt({ identifier: email, method: "register", success: false, reason: attemptReason(AUTH_ERRORS.emailTaken), ...context });
        return { refusal: target.includes("phone") ? AUTH_ERRORS.phoneTaken : AUTH_ERRORS.emailTaken };
      }
      throw error;
    }

    logAttempt({ identifier: email, userId: user.id, method: "register", success: true, ...context });
    await repo.markLogin(user.id);

    return startSession({
      user,
      rememberMe: Boolean(input.rememberMe),
      device: input.device,
      epoch: 0,
      ...context,
    });
  }

  // ---------------------------------------------------------------------------
  // Password sign-in
  // ---------------------------------------------------------------------------

  async function login(input, context) {
    const email = normalizeEmail(input.email);
    const user = await repo.findByEmailWithCredential(email);

    const refuse = (key, userId) => {
      logAttempt({ identifier: email, userId, method: "password", success: false, reason: attemptReason(key), ...context });
      return { refusal: key };
    };

    if (!user) {
      // Burn the same Argon2 time the real path would, then give the same answer
      // as a wrong password. Message *and* latency have to match, or the pair is
      // an enumeration oracle with extra steps.
      await verifyOrDummy(null, input.password);
      return refuse(AUTH_ERRORS.invalidCredentials);
    }

    const blocked = accountRefusal(user);
    if (blocked) return refuse(blocked, user.id);

    const credential = user.credential;
    if (!credential) return refuse(AUTH_ERRORS.noPassword, user.id);

    if (credential.lockedUntil && credential.lockedUntil > new Date()) {
      return refuse(AUTH_ERRORS.accountLocked, user.id);
    }

    if (!(await verifyPassword(credential.passwordHash, input.password))) {
      const after = await repo.recordCredentialFailure(user.id, {
        threshold: env.authLockoutThreshold,
        lockMinutes: env.authLockoutMinutes,
      });
      // Say "locked" on the failure that caused it, so the next screen is not a
      // customer typing the right password into a lock they were not told about.
      return refuse(after?.lockedUntil ? AUTH_ERRORS.accountLocked : AUTH_ERRORS.invalidCredentials, user.id);
    }

    await repo.clearCredentialFailures(user.id);
    await repo.markLogin(user.id);
    logAttempt({ identifier: email, userId: user.id, method: "password", success: true, ...context });

    return startSession({
      user,
      rememberMe: Boolean(input.rememberMe),
      device: input.device,
      epoch: credential.tokenEpoch,
      ...context,
    });
  }

  // ---------------------------------------------------------------------------
  // One-time codes
  // ---------------------------------------------------------------------------

  /**
   * Issue a code.
   *
   * **Always succeeds for a well-formed destination**, whether or not an account
   * holds it, and the challenge row is written either way. An endpoint that
   * answered "no account with that number" would be a phone-number oracle, and
   * `services/auth.requestOtp` is written against exactly this promise.
   *
   * There is no SMS or email provider in this backend, so the code is logged and
   * — only when `AUTH_ECHO_SECRETS` is on, which the environment refuses in
   * production — returned in the payload. That is what makes the flow drivable
   * end to end today; the provider is module 20's.
   */
  async function requestOtp(input, context) {
    const channel = input.channel ?? "sms";
    const purpose = OTP_PURPOSES[input.purpose ?? "login"];
    const country = await repo.findCountry(env.authDefaultCountry);
    const destination = normalizeDestination(input.destination, channel, country?.dialCode);

    if (channel === "email" ? !isEmail(destination) : !isE164(destination)) {
      return { refusal: channel === "email" ? AUTH_ERRORS.emailInvalid : AUTH_ERRORS.phoneInvalid };
    }

    const latest = await repo.findLatestOtp(destination, purpose);
    if (latest && Date.now() - latest.createdAt.getTime() < env.authOtpResendSeconds * 1000) {
      return { refusal: AUTH_ERRORS.otpTooSoon };
    }

    const account = channel === "email" ? await repo.findByEmailWithCredential(destination) : await repo.findByPhone(destination);
    const code = mintOtpCode();

    const challenge = await repo.createOtp({
      userId: account?.id ?? null,
      purpose,
      channel,
      destination,
      codeHash: hashToken(code),
      maxAttempts: env.authOtpMaxAttempts,
      expiresAt: new Date(Date.now() + env.authOtpTtlSeconds * 1000),
      ip: context.ip,
    });

    if (!env.isProduction) log.info({ destination, purpose, code }, "OTP issued (no provider configured)");

    return {
      payload: {
        destination: challenge.destination,
        expiresAt: challenge.expiresAt.toISOString(),
        resendAfterSeconds: env.authOtpResendSeconds,
        ...(env.authEchoSecrets ? { code } : {}),
      },
    };
  }

  /**
   * Spend a code, and sign in if that is what the code was for.
   *
   * `services/verification.confirmVerification` calls the same endpoint for a
   * customer who is *already* signed in and throws the session away — which is
   * correct on its side and costs nothing here, because the session it discards
   * is its own.
   */
  async function verifyOtp(input, context) {
    const channel = input.channel ?? "sms";
    const purpose = OTP_PURPOSES[input.purpose ?? "login"];
    const country = await repo.findCountry(env.authDefaultCountry);
    const destination = normalizeDestination(input.destination, channel, country?.dialCode);

    const refuse = (key, userId) => {
      logAttempt({ identifier: destination, userId, method: "otp", success: false, reason: attemptReason(key), ...context });
      return { refusal: key };
    };

    const challenge = await repo.findLatestOtp(destination, purpose);
    if (!challenge) return refuse(AUTH_ERRORS.otpNotRequested);
    if (challenge.consumedAt) return refuse(AUTH_ERRORS.invalidOtp);
    if (challenge.expiresAt <= new Date()) return refuse(AUTH_ERRORS.otpExpired);
    if (challenge.attempts >= challenge.maxAttempts) return refuse(AUTH_ERRORS.otpAttemptsExhausted);

    if (!digestsEqual(challenge.codeHash, hashToken(String(input.code).trim()))) {
      const { attempts } = await repo.incrementOtpAttempts(challenge.id);
      return refuse(attempts >= challenge.maxAttempts ? AUTH_ERRORS.otpAttemptsExhausted : AUTH_ERRORS.invalidOtp);
    }

    // Atomic: a code presented twice in parallel is consumed once.
    if (!(await repo.consumeOtp(challenge.id))) return refuse(AUTH_ERRORS.invalidOtp);

    if (!SIGN_IN_PURPOSES.has(purpose)) {
      logAttempt({ identifier: destination, userId: challenge.userId, method: "otp", success: true, ...context });
      return { payload: { destination, verified: true } };
    }

    const user = channel === "email" ? await repo.findByEmailWithCredential(destination) : await repo.findByPhone(destination);
    // Here — and only here — "no such account" is safe to say: the caller has
    // already proved they hold the destination by producing its code.
    if (!user) return refuse(AUTH_ERRORS.accountNotFound);

    const blocked = accountRefusal(user);
    if (blocked) return refuse(blocked, user.id);

    const verified = channel === "sms" ? await repo.markPhoneVerified(user.id) : user;
    const credential = await repo.findCredential(user.id);

    await repo.markLogin(user.id);
    logAttempt({ identifier: destination, userId: user.id, method: "otp", success: true, ...context });

    return startSession({
      user: verified,
      rememberMe: Boolean(input.rememberMe),
      device: input.device,
      epoch: credential?.tokenEpoch ?? 0,
      ...context,
    });
  }

  // ---------------------------------------------------------------------------
  // Password reset
  // ---------------------------------------------------------------------------

  /**
   * Start a reset. Succeeds for every well-formed address, known or not — the
   * promise `services/auth.requestPasswordReset` is written against, and the
   * reason its comment says "always returns ok — no account enumeration".
   */
  async function requestPasswordReset(input, context) {
    const email = normalizeEmail(input.email);
    if (!isEmail(email)) return { refusal: AUTH_ERRORS.emailInvalid };

    const user = await repo.findByEmailWithCredential(email);
    const payload = { email };

    if (!user || user.deletedAt || accountRefusal(user)) return { payload };

    const token = mintToken();
    await repo.createPasswordReset({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + env.authResetTtlMinutes * 60_000),
      ip: context.ip,
    });

    if (!env.isProduction) log.info({ email, token }, "password reset issued (no mailer configured)");
    if (env.authEchoSecrets) payload.token = token;

    return { payload };
  }

  /**
   * Finish a reset.
   *
   * Unknown, spent and expired tokens all answer `errors.resetTokenInvalid`:
   * three answers would tell somebody holding a stolen token which of the three
   * it is, and none of the three is actionable by the person who asked.
   *
   * Success revokes every session (`password-change`) and bumps
   * `credentials.tokenEpoch`, which is what kills the access tokens too —
   * a reset that left the thief signed in for another fifteen minutes would
   * defeat the point of resetting.
   */
  async function resetPassword(input, context) {
    const weak = passwordProblem(input.password);
    if (weak) return { refusal: AUTH_ERRORS[weak] };

    const reset = await repo.findPasswordReset(hashToken(String(input.token)));
    if (!reset || reset.consumedAt || reset.expiresAt <= new Date()) {
      return { refusal: AUTH_ERRORS.resetTokenInvalid };
    }

    const user = await repo.findById(reset.userId);
    const blocked = accountRefusal(user);
    if (blocked) return { refusal: blocked === AUTH_ERRORS.invalidCredentials ? AUTH_ERRORS.resetTokenInvalid : blocked };

    const credential = await repo.findCredential(reset.userId);
    if (credential && (await verifyPassword(credential.passwordHash, input.password))) {
      return { refusal: AUTH_ERRORS.samePassword };
    }

    if (!(await repo.consumePasswordReset(reset.id))) return { refusal: AUTH_ERRORS.resetTokenInvalid };

    const revoked = await repo.changePassword({
      userId: reset.userId,
      passwordHash: await hashPassword(input.password),
      revokeReason: "password-change",
    });

    logAttempt({ identifier: user.email, userId: user.id, method: "reset", success: true, ...context });
    log.info({ userId: user.id, revoked }, "password reset — every session revoked");

    return { payload: null };
  }

  // ---------------------------------------------------------------------------
  // Refresh — rotation with reuse detection
  // ---------------------------------------------------------------------------

  /**
   * Spend one refresh token for the next one.
   *
   * Every failure is a **401**, not a refusal, and that is what the client is
   * written against: `lib/graphql/session.ts` treats `response.status === 401` as
   * "the chain is spent, reused or revoked" and drops its half of the session.
   * A 200 with `success: false` would leave a signed-out browser showing
   * signed-in chrome.
   *
   * ## Reuse
   *
   * A token that has already been rotated is presented only in two situations: a
   * client raced itself, or somebody replayed a stolen one. There is no way to
   * tell them apart from here, and the safe reading of the ambiguity is theft —
   * so the whole session dies with `rotation-reuse`, exactly as
   * `identity.prisma::RefreshToken` describes. The client single-flights its
   * refreshes (`session.ts`) precisely so the benign case does not arise.
   */
  async function refresh({ token, ip, userAgent }) {
    const dead = (message) => unauthenticated(message);

    const row = await repo.findRefreshToken(hashToken(String(token ?? "")));
    if (!row) throw dead("Unknown refresh token");

    if (row.usedAt || row.revokedAt) {
      await repo.revokeSession(row.sessionId, "rotation-reuse");
      log.warn({ sessionId: row.sessionId, userId: row.session.userId }, "refresh token reuse — session revoked");
      throw dead("Refresh token already used");
    }

    const now = new Date();
    if (row.expiresAt <= now) throw dead("Refresh token expired");

    const { session } = row;
    if (session.revokedAt) throw dead("Session revoked");
    if (session.expiresAt <= now) {
      await repo.revokeSession(session.id, "expired");
      throw dead("Session expired");
    }

    const user = await repo.findByIdWithEpoch(session.userId);
    if (accountRefusal(user)) {
      await repo.revokeSession(session.id, "admin");
      throw dead("Account is not able to sign in");
    }

    const nextToken = mintToken();
    const rotated = await repo.rotateRefreshToken({
      tokenId: row.id,
      sessionId: session.id,
      tokenHash: hashToken(nextToken),
      // Never past the session's own end — "remember me" extends the session,
      // and a chain that could outlive it would extend it silently and forever.
      tokenExpiresAt: session.expiresAt,
      ip,
    });

    // Lost the race with a concurrent refresh: by the time we got here the row
    // was already spent, which is the reuse case above.
    if (!rotated) {
      await repo.revokeSession(session.id, "rotation-reuse");
      throw dead("Refresh token already used");
    }

    const access = issueAccessToken({
      user,
      sessionId: session.id,
      epoch: user.credential?.tokenEpoch ?? 0,
    });

    return {
      refreshToken: nextToken,
      expiresAt: session.expiresAt,
      payload: {
        accessToken: access.accessToken,
        accessTokenExpiresAt: access.accessTokenExpiresAt.toISOString(),
        sessionId: session.id,
        user: toUserReadModel(user),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------

  /**
   * End a session. Idempotent, and never an error.
   *
   * Signing out twice, or signing out with a credential that already expired, is
   * not a failure — the caller asked to be signed out and they are. The cookies
   * are cleared by the controller in every case, including the one where there
   * was nothing on the server to revoke.
   */
  async function logout({ token, sessionId, userId, allDevices }) {
    let session = null;

    if (token) {
      const row = await repo.findRefreshToken(hashToken(String(token)));
      if (row) session = { id: row.sessionId, userId: row.session.userId };
    }
    if (!session && sessionId) {
      const row = await repo.findSession(sessionId);
      if (row) session = { id: row.id, userId: row.userId };
    }
    if (!session) return { revoked: 0 };

    // A bearer token may not end somebody else's session.
    if (userId && session.userId !== userId) return { revoked: 0 };

    let revoked = await repo.revokeSession(session.id, "logout");
    if (allDevices) revoked += await repo.revokeAllSessions(session.userId, "logout", session.id);

    return { revoked };
  }

  return {
    register,
    login,
    requestOtp,
    verifyOtp,
    requestPasswordReset,
    resetPassword,
    refresh,
    logout,
    toUserReadModel,
    accountRefusal,
  };
}

export default createService;

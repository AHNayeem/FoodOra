/**
 * schemas.js — the wire contract, as JSON Schema.
 *
 * Fastify's own validation, per F1 §7: Ajv compiles each of these once at boot,
 * so validation costs nothing per request, and the same declaration is what
 * serialises the response. Two consequences worth stating, because both bite:
 *
 *  - `removeAdditional: "all"` (set in `app.js`) means **a body field that is not
 *    declared here never reaches the handler**. That is the safety property —
 *    attacker-controlled keys cannot be smuggled into a Prisma call — and it is
 *    also the failure mode: a field you forgot to declare is silently gone.
 *  - The `response` schema *filters* the body on the way out. A field missing
 *    from `userSchema` below is a field the frontend will never see, however
 *    carefully the service built it. That cuts the right way here: the response
 *    schema is a second, independent guarantee that no password hash, status or
 *    block reason can leave, even if a `select` widens by accident.
 *
 * The shapes are the frontend's, not new ones. `authSessionSchema` is
 * `lib/graphql/auth.operations.ts::AuthSessionData`; `userSchema` is
 * `types/user.ts::User` and selects exactly the fields `USER_FIELDS` does.
 */
import env from "../../config/env.js";

/** `types/user.ts::User`. Fourteen fields, no fifteenth. */
export const userSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    email: { type: "string" },
    phone: { type: "string", nullable: true },
    avatar: { type: "string" },
    role: { type: "string" },
    permissions: { type: "array", items: { type: "string" } },
    countryCode: { type: "string" },
    currency: { type: "string" },
    locale: { type: "string" },
    isVerified: { type: "boolean" },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    deletedAt: { type: "string", nullable: true },
  },
};

/** `AuthSession` — what a sign-in returns. The refresh token is *not* in it. */
export const authSessionSchema = {
  type: "object",
  properties: {
    accessToken: { type: "string" },
    accessTokenExpiresAt: { type: "string" },
    sessionId: { type: "string" },
    user: userSchema,
  },
};

/** The refusal half of the envelope: an i18n key and, when it has one, a field. */
const refusalSchema = {
  type: "object",
  properties: { key: { type: "string" }, path: { type: "string" } },
};

/**
 * One 200 schema for both outcomes.
 *
 * A refusal is HTTP 200 with `success: false` (F1 §5), so the success and the
 * refusal share a status code and therefore share a response schema. Declaring
 * them separately is not possible; declaring `data` as merely "an object" would
 * throw away the field filtering that is half the point.
 */
export const envelope = (data) => ({
  type: "object",
  properties: {
    success: { type: "boolean" },
    data: { ...data, nullable: true },
    error: refusalSchema,
  },
});

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

const email = { type: "string", minLength: 3, maxLength: 191 };
const password = { type: "string", minLength: env.authPasswordMinLength, maxLength: 200 };
const phone = { type: "string", minLength: 6, maxLength: 24 };

/**
 * `DeviceInput` — every field optional, exactly as the client declares it.
 *
 * A session with no device is the normal case: the web client sends nothing
 * unless it has generated an install id, and requiring one would mean no browser
 * could sign in.
 */
const device = {
  type: "object",
  properties: {
    installId: { type: "string", minLength: 1, maxLength: 120 },
    platform: { type: "string", enum: ["web", "ios", "android"] },
    name: { type: "string", maxLength: 120 },
    model: { type: "string", maxLength: 120 },
    appVersion: { type: "string", maxLength: 24 },
    pushToken: { type: "string", maxLength: 400 },
  },
};

export const registerBody = {
  type: "object",
  required: ["name", "email", "password"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 120 },
    email,
    phone,
    password,
    /**
     * The three the sign-up screen offers (`services/auth.ts::RegisterInput`).
     *
     * A closed list and not the full `UserRoleSlug`: self-registration must never
     * be able to mint `super-admin`. The other eleven roles are granted by an
     * operator, which is module 3's surface, not this one's.
     */
    role: { type: "string", enum: ["customer", "restaurant-owner", "delivery-rider"], default: "customer" },
    marketingOptIn: { type: "boolean", default: false },
    rememberMe: { type: "boolean", default: false },
    countryCode: { type: "string", minLength: 2, maxLength: 2 },
    locale: { type: "string", minLength: 2, maxLength: 8 },
    device,
  },
};

export const loginBody = {
  type: "object",
  required: ["email", "password"],
  properties: {
    email,
    // Not `password` above: an existing account's password predates whatever the
    // current minimum is, and a length rule on sign-in turns a policy change into
    // a lockout. Length is checked where a password is *set*.
    password: { type: "string", minLength: 1, maxLength: 200 },
    rememberMe: { type: "boolean", default: false },
    device,
  },
};

const otpPurpose = {
  type: "string",
  // Both spellings of the two that differ between the client and the schema.
  enum: ["login", "register", "verify-phone", "phone-verify", "reset-password", "password-reset", "two-factor"],
  default: "login",
};

/** `sms` and `email` — the two `OtpChannel` has. The client's union has no third at runtime. */
const otpChannel = { type: "string", enum: ["sms", "email"], default: "sms" };

export const requestOtpBody = {
  type: "object",
  required: ["destination"],
  properties: {
    destination: { type: "string", minLength: 3, maxLength: 191 },
    channel: otpChannel,
    purpose: otpPurpose,
  },
};

export const verifyOtpBody = {
  type: "object",
  required: ["destination", "code"],
  properties: {
    destination: { type: "string", minLength: 3, maxLength: 191 },
    code: { type: "string", minLength: 4, maxLength: 10 },
    channel: otpChannel,
    purpose: otpPurpose,
    rememberMe: { type: "boolean", default: false },
    device,
  },
};

export const forgotPasswordBody = {
  type: "object",
  required: ["email"],
  properties: { email },
};

export const resetPasswordBody = {
  type: "object",
  required: ["token", "password"],
  properties: { token: { type: "string", minLength: 20, maxLength: 200 }, password },
};

/**
 * Refresh takes a body only for non-browser clients.
 *
 * The browser sends nothing: the token is in an `HttpOnly` cookie it cannot
 * read. A CLI or a test has no cookie jar worth maintaining, so it may post the
 * token instead — and because it has no ambient cookie, it is not subject to the
 * CSRF check either. See `utils/cookies.js`.
 */
export const refreshBody = {
  // `["object", "null"]` and not `"object"`: `session.ts` posts to this route
  // with no body at all, which reaches Ajv as `null` and fails a plain object
  // schema with "must be object" — a 400 on the one call every page load makes.
  type: ["object", "null"],
  properties: { refreshToken: { type: "string", minLength: 20, maxLength: 200 } },
};

export const logoutBody = {
  /** Same as `refreshBody`: `revokeSession()` sends no body. */
  type: ["object", "null"],
  properties: { allDevices: { type: "boolean", default: false } },
};

// ---------------------------------------------------------------------------
// Route schemas
// ---------------------------------------------------------------------------

const otpChallengeSchema = {
  type: "object",
  properties: {
    destination: { type: "string" },
    expiresAt: { type: "string" },
    resendAfterSeconds: { type: "integer" },
    verified: { type: "boolean" },
    /** Present only when `AUTH_ECHO_SECRETS` is on, which production refuses. */
    code: { type: "string" },
  },
};

/**
 * `verifyOtp` answers with one of two shapes and therefore declares both.
 *
 * A code for `login`, `register` or `phone-verify` ends in a session; a code for
 * anything else is only checked, and `services/verification.confirmVerification`
 * wants exactly that — it throws a session away when it gets one. Serialisation
 * emits the keys that are present, so one schema carries both without an
 * `anyOf` the serialiser would have to branch on.
 */
const verifyOtpResultSchema = {
  type: "object",
  properties: {
    ...authSessionSchema.properties,
    destination: { type: "string" },
    verified: { type: "boolean" },
  },
};

const forgotSchema = {
  type: "object",
  properties: { email: { type: "string" }, token: { type: "string" } },
};

const errors = Object.freeze({
  400: { $ref: "error#" },
  401: { $ref: "error#" },
  429: { $ref: "error#" },
  500: { $ref: "error#" },
  503: { $ref: "error#" },
});

export const ROUTE_SCHEMAS = Object.freeze({
  register: { body: registerBody, response: { 200: envelope(authSessionSchema), ...errors } },
  login: { body: loginBody, response: { 200: envelope(authSessionSchema), ...errors } },
  requestOtp: { body: requestOtpBody, response: { 200: envelope(otpChallengeSchema), ...errors } },
  verifyOtp: { body: verifyOtpBody, response: { 200: envelope(verifyOtpResultSchema), ...errors } },
  forgotPassword: { body: forgotPasswordBody, response: { 200: envelope(forgotSchema), ...errors } },
  resetPassword: { body: resetPasswordBody, response: { 200: envelope({ type: "object" }), ...errors } },
  refresh: { body: refreshBody, response: { 200: envelope(authSessionSchema), ...errors } },
  logout: { body: logoutBody, response: { 200: envelope({ type: "object", properties: { revoked: { type: "integer" } } }), ...errors } },
  me: { response: { 200: envelope(userSchema), ...errors } },
});

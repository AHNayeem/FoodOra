/**
 * env.js — the process environment, read once, validated once.
 *
 * Nothing else in the backend touches `process.env`. Two reasons, and the second
 * is the one that bites: a typo in a variable name read at the call site is a
 * silent `undefined` that surfaces as a runtime error hours later, whereas a
 * missing variable read here refuses to start. A server that will not boot is a
 * better failure than one that boots without a JWT secret.
 *
 * `.env` is loaded from the backend package root and never overrides a variable
 * the shell already set — CI and a container pass real values in, and a stale
 * developer file must not win over them.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

dotenv.config({ path: resolve(PACKAGE_ROOT, ".env"), override: false });

/** Read `version` from our own package.json — reported by `/health`. */
function readVersion() {
  try {
    return JSON.parse(readFileSync(resolve(PACKAGE_ROOT, "package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
}

class EnvError extends Error {
  constructor(problems) {
    super(
      `Invalid environment:\n${problems.map((p) => `  - ${p}`).join("\n")}\n\n` +
        "See .env.example for the full list.",
    );
    this.name = "EnvError";
    this.problems = problems;
  }
}

const problems = [];

function raw(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function str(name, { fallback, required = false, oneOf } = {}) {
  const value = raw(name, fallback);
  if (value === undefined) {
    if (required) problems.push(`${name} is required`);
    return undefined;
  }
  if (oneOf && !oneOf.includes(value)) {
    problems.push(`${name} must be one of ${oneOf.join(", ")} (got "${value}")`);
  }
  return value;
}

function int(name, { fallback, min, max } = {}) {
  const value = raw(name, fallback);
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    problems.push(`${name} must be an integer (got "${value}")`);
    return fallback;
  }
  if (min !== undefined && parsed < min) problems.push(`${name} must be >= ${min}`);
  if (max !== undefined && parsed > max) problems.push(`${name} must be <= ${max}`);
  return parsed;
}

function bool(name, { fallback } = {}) {
  const value = String(raw(name, fallback)).toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  problems.push(`${name} must be a boolean (got "${value}")`);
  return false;
}

/** Comma-separated list, trimmed, empties dropped. */
function list(name, { fallback = "" } = {}) {
  return String(raw(name, fallback))
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const nodeEnv = str("NODE_ENV", { fallback: "development", oneOf: ["development", "test", "production"] });
const isProduction = nodeEnv === "production";
const isTest = nodeEnv === "test";

const jwtSecret = str("JWT_SECRET", { required: isProduction, fallback: isProduction ? undefined : "dev-only-insecure-secret-change-me" });
if (jwtSecret && jwtSecret.length < 32 && isProduction) {
  problems.push("JWT_SECRET must be at least 32 characters in production");
}

const databaseUrl = str("DATABASE_URL", { required: true });

const env = Object.freeze({
  nodeEnv,
  isProduction,
  isTest,
  isDevelopment: nodeEnv === "development",
  version: readVersion(),

  host: str("HOST", { fallback: "0.0.0.0" }),
  port: int("PORT", { fallback: 4000, min: 0, max: 65535 }),
  logLevel: str("LOG_LEVEL", {
    fallback: isTest ? "silent" : "info",
    oneOf: ["fatal", "error", "warn", "info", "debug", "trace", "silent"],
  }),
  /** Pretty logs are a terminal convenience; production emits newline-delimited JSON. */
  logPretty: bool("LOG_PRETTY", { fallback: String(nodeEnv === "development") }),
  trustProxy: bool("TRUST_PROXY", { fallback: "false" }),
  bodyLimitBytes: int("BODY_LIMIT_BYTES", { fallback: 1_048_576, min: 1024 }),
  /** How long in-flight requests get to finish after SIGTERM before the process exits anyway. */
  shutdownTimeoutMs: int("SHUTDOWN_TIMEOUT_MS", { fallback: 10_000, min: 0 }),

  databaseUrl,
  /**
   * The connection that bypasses a pooler.
   *
   * The datasource declares `directUrl`, so `prisma validate`, `migrate deploy`
   * and `migrate status` all refuse to run without it — even though the running
   * API never uses it. It defaults to `DATABASE_URL`, which is correct whenever
   * there is no pooler in front of PostgreSQL, and must be set separately when
   * there is: a migration through PgBouncer in transaction mode fails on the
   * advisory lock it takes.
   */
  databaseDirectUrl: str("DATABASE_DIRECT_URL", { fallback: databaseUrl }),
  /** Readiness must not wait on a hung pool longer than a load balancer will wait on us. */
  databaseHealthTimeoutMs: int("DATABASE_HEALTH_TIMEOUT_MS", { fallback: 2_000, min: 100 }),

  /**
   * `*` is accepted and means "reflect the request origin". Credentials are on,
   * so the wildcard header itself is never sent — the origin is echoed instead.
   */
  corsOrigins: list("CORS_ORIGINS", { fallback: "http://localhost:3000" }),
  corsCredentials: bool("CORS_CREDENTIALS", { fallback: "true" }),

  jwtSecret,
  jwtIssuer: str("JWT_ISSUER", { fallback: "foodora" }),
  jwtAudience: str("JWT_AUDIENCE", { fallback: "foodora-api" }),
  jwtAccessTtl: str("JWT_ACCESS_TTL", { fallback: "15m" }),
  jwtRefreshTtl: str("JWT_REFRESH_TTL", { fallback: "30d" }),

  /**
   * Where the refresh cookie is scoped.
   *
   * Derived rather than configured separately: the cookie must reach the two
   * routes that spend it and nothing else, and those routes are the auth module
   * mounted under the versioned prefix. A hand-set path that disagreed with the
   * mount would produce a browser that never sends the cookie and a refresh
   * endpoint that always answers "no session" — the hardest possible way to find
   * out two strings differ.
   */
  authCookiePath: `${str("API_PREFIX", { fallback: "/api/v1" })}/auth`,
  /** `Secure` on the refresh cookie. Off in development, where there is no TLS. */
  authCookieSecure: bool("AUTH_COOKIE_SECURE", { fallback: String(isProduction) }),
  authCookieSameSite: str("AUTH_COOKIE_SAMESITE", { fallback: "lax", oneOf: ["lax", "strict", "none"] }),
  /** Unset for a same-origin deployment; set when the API and the app differ in host. */
  authCookieDomain: str("AUTH_COOKIE_DOMAIN"),

  /**
   * Argon2id parameters. OWASP's second recommended profile (m=19456, t=2, p=1),
   * which is the lowest-memory one they still consider adequate and the one that
   * fits a container with a modest memory limit.
   */
  authArgonMemoryKib: int("AUTH_ARGON_MEMORY_KIB", { fallback: 19_456, min: 8_192 }),
  authArgonTimeCost: int("AUTH_ARGON_TIME_COST", { fallback: 2, min: 1 }),
  authArgonParallelism: int("AUTH_ARGON_PARALLELISM", { fallback: 1, min: 1 }),
  /** `errors.passwordShort` in the three locale files says "at least 8". */
  authPasswordMinLength: int("AUTH_PASSWORD_MIN_LENGTH", { fallback: 8, min: 8 }),

  /** Consecutive failures before the credential locks, and for how long. */
  authLockoutThreshold: int("AUTH_LOCKOUT_THRESHOLD", { fallback: 5, min: 1 }),
  authLockoutMinutes: int("AUTH_LOCKOUT_MINUTES", { fallback: 15, min: 1 }),

  /**
   * Session lifetime. `JWT_REFRESH_TTL` governs `signRefreshToken` only — the
   * refresh credential this backend actually issues is opaque, hashed into
   * `refresh_tokens.tokenHash`, and expires on these.
   */
  authSessionTtlDays: int("AUTH_SESSION_TTL_DAYS", { fallback: 7, min: 1 }),
  authSessionRememberTtlDays: int("AUTH_SESSION_REMEMBER_TTL_DAYS", { fallback: 30, min: 1 }),

  authOtpTtlSeconds: int("AUTH_OTP_TTL_SECONDS", { fallback: 300, min: 30 }),
  authOtpMaxAttempts: int("AUTH_OTP_MAX_ATTEMPTS", { fallback: 5, min: 1 }),
  authOtpResendSeconds: int("AUTH_OTP_RESEND_SECONDS", { fallback: 60, min: 0 }),
  authResetTtlMinutes: int("AUTH_RESET_TTL_MINUTES", { fallback: 30, min: 1 }),

  /**
   * Return the one-time code / reset token in the response body.
   *
   * There is no SMS or email provider yet, so without this the two flows cannot
   * be driven end to end at all. It is off by default and **refused in
   * production** below, because an OTP endpoint that echoes its own code is not
   * an OTP endpoint.
   */
  authEchoSecrets: bool("AUTH_ECHO_SECRETS", { fallback: "false" }),

  /** The country a self-registered account is created in; must exist in `countries`. */
  authDefaultCountry: str("AUTH_DEFAULT_COUNTRY", { fallback: "BD" }),

  /** The tight, per-route ceiling the credential endpoints get on top of the global one. */
  authRateMax: int("AUTH_RATE_MAX", { fallback: 10, min: 1 }),
  authRateWindowMs: int("AUTH_RATE_WINDOW_MS", { fallback: 60_000, min: 1_000 }),

  rateLimitEnabled: bool("RATE_LIMIT_ENABLED", { fallback: String(!isTest) }),
  rateLimitMax: int("RATE_LIMIT_MAX", { fallback: 300, min: 1 }),
  rateLimitWindowMs: int("RATE_LIMIT_WINDOW_MS", { fallback: 60_000, min: 1000 }),

  apiPrefix: str("API_PREFIX", { fallback: "/api/v1" }),
});

if (env.authEchoSecrets && isProduction) {
  problems.push("AUTH_ECHO_SECRETS cannot be enabled in production — it returns OTP codes and reset tokens in the response body");
}

if (problems.length > 0) throw new EnvError(problems);

export default env;

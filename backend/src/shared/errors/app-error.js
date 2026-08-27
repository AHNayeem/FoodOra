/**
 * app-error.js — the one way a route says "this failed".
 *
 * Every failure that leaves the API is an `AppError` by the time the error
 * handler sees it, so the wire shape is decided in one place rather than at each
 * `throw`. A route throws `notFound("vendor")`, not a status code and a string.
 *
 * The distinction that matters, and the reason this file is not the whole error
 * story: **an `AppError` is an exception, not a refusal.** `lib/graphql/result.ts`
 * documents the split the frontend is already written against —
 *
 *  - an *expected refusal* (wrong password, a spent code, an ineligible coupon)
 *    is data: HTTP 200 with `{ success: false, error: { key } }`, built by
 *    `refuse()` in `shared/errors/envelope.js`;
 *  - an *exception* (no token, forbidden, rate limited, the database is down) is
 *    an `AppError`, and carries a code from the closed set.
 *
 * Throwing where a refusal belongs is the mistake to watch for: it turns a
 * business answer into a 4xx the client has to special-case, and it logs noise
 * for something that was never wrong.
 */
import { ERROR_CODES } from "../constants/error-codes.js";

export class AppError extends Error {
  /**
   * @param {keyof typeof ERROR_CODES} code
   * @param {string} message  Operator-facing. Never rendered to an end user —
   *   the client translates `key`.
   * @param {{ details?: unknown, key?: string, cause?: unknown, expose?: boolean }} [options]
   */
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    const meta = ERROR_CODES[code];
    if (!meta) throw new Error(`Unknown error code "${code}" — add it to ERROR_CODES first.`);

    this.name = "AppError";
    this.code = code;
    this.statusCode = meta.status;
    this.key = options.key ?? meta.key;
    this.details = options.details;
    /** 5xx messages are swallowed by the handler; 4xx messages are safe to send. */
    this.expose = options.expose ?? meta.status < 500;
    this.isAppError = true;
  }
}

export const badRequest = (message = "Invalid input", options) =>
  new AppError("BAD_USER_INPUT", message, options);

export const unauthenticated = (message = "Authentication required", options) =>
  new AppError("UNAUTHENTICATED", message, options);

export const forbidden = (message = "Not permitted", options) =>
  new AppError("FORBIDDEN", message, options);

export const notFound = (what = "Resource", options) =>
  new AppError("NOT_FOUND", `${what} not found`, options);

/**
 * Optimistic-locking loss and unique collisions. `main.prisma` §4: a write
 * guarded by `version` that matches zero rows is a conflict, not a not-found —
 * the row is there, somebody else changed it first.
 */
export const conflict = (message = "The record changed while you were editing it", options) =>
  new AppError("CONFLICT", message, options);

export const tooManyRequests = (message = "Too many requests", options) =>
  new AppError("TOO_MANY_REQUESTS", message, options);

export const serviceUnavailable = (message = "Service unavailable", options) =>
  new AppError("SERVICE_UNAVAILABLE", message, options);

export const internal = (message = "Internal server error", options) =>
  new AppError("INTERNAL_ERROR", message, options);

export const isAppError = (error) => Boolean(error && error.isAppError === true);

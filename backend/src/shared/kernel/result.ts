/**
 * `Result<T>` is the server-side twin of `frontend/services/http.ts`:
 *
 * ```ts
 * type Result<T> = { data: T; error: null } | { data: null; error: string }
 * ```
 *
 * The frontend already renders `error` as an i18n key, never as prose, and the
 * GraphQL payload types are the same shape (D5 §Payload types). Keeping the two
 * aligned is what lets a service function swap its body from a mock read to a
 * network call without the component above it changing.
 *
 * An **expected** refusal — bad credentials, an ineligible coupon, a table
 * taken while the form was open — is a `Result` failure, not an exception. Only
 * genuinely exceptional conditions throw.
 */
export interface ResultError {
  /** i18n key, e.g. `"errors.invalidCredentials"`, `"coupons.reason.minOrder"`. */
  key: string;
  /** Field path for a form error, e.g. `"input.phone"`. */
  path?: string;
  /** ICU parameters the message needs, e.g. `{ min: 250 }`. */
  params?: Record<string, unknown>;
}

export type Result<T> =
  | { readonly ok: true; readonly data: T; readonly error: null }
  | { readonly ok: false; readonly data: null; readonly error: ResultError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data, error: null };
}

export function fail<T = never>(
  key: string,
  options: { path?: string; params?: Record<string, unknown> } = {},
): Result<T> {
  return { ok: false, data: null, error: { key, ...options } };
}

export function isOk<T>(result: Result<T>): result is Extract<Result<T>, { ok: true }> {
  return result.ok;
}

/** Narrow a result or throw — for call sites where a failure is a bug, not a case. */
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`Attempted to unwrap a failed Result: ${result.error.key}`);
  }
  return result.data;
}

export function mapResult<T, U>(result: Result<T>, fn: (value: T) => U): Result<U> {
  return result.ok ? ok(fn(result.data)) : result;
}

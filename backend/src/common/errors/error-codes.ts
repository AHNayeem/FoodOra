/**
 * The closed set of `extensions.code` values the API can return (D5 §Errors).
 *
 * These are contract. The frontend branches on them — refresh-and-retry on
 * `UNAUTHENTICATED`, route to 404 on `NOT_FOUND`, prompt to reload on
 * `CONFLICT` — so adding one is a schema change and renaming one is a breaking
 * change.
 */
export const ErrorCode = {
  /** No credentials, or an expired access token. The client refreshes and retries once. */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** Authenticated, but not allowed. */
  FORBIDDEN: 'FORBIDDEN',
  /**
   * Missing, or invisible to this actor. Row scoping returns this rather than
   * FORBIDDEN on purpose: a 403 on someone else's order confirms it exists.
   */
  NOT_FOUND: 'NOT_FOUND',
  /** Optimistic-lock failure; carries `currentVersion`. */
  CONFLICT: 'CONFLICT',
  /** Schema validation failed; carries `issues[]` shaped for react-hook-form. */
  BAD_USER_INPUT: 'BAD_USER_INPUT',
  /** Carries `retryAfter` in seconds. */
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  /** A dependency is unreachable. Distinguished from a bug so retries are sane. */
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  /** Anything unhandled. The client sees a generic message plus a `requestId`. */
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** HTTP status for the REST surfaces (webhooks, health, uploads). */
export const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BAD_USER_INPUT: 400,
  TOO_MANY_REQUESTS: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_SERVER_ERROR: 500,
};

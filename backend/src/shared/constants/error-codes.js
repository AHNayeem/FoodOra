/**
 * error-codes.js — the closed set of failure codes the API may emit.
 *
 * Closed, and matched to the frontend rather than invented here. `lib/graphql/
 * result.ts::BY_CODE` already turns six of these into i18n keys, and
 * `RENDERABLE` in the same file is the whitelist of keys a screen can show.
 * Emitting a code outside this set means the frontend renders "something went
 * wrong" for a failure it could have explained, so the set grows only when the
 * frontend learns a new key at the same time.
 *
 * `key` is the frontend's i18n key; `status` is the HTTP status that carries it.
 */
export const ERROR_CODES = Object.freeze({
  BAD_USER_INPUT: { status: 400, key: "errors.invalidInput" },
  UNAUTHENTICATED: { status: 401, key: "errors.unauthenticated" },
  FORBIDDEN: { status: 403, key: "errors.forbidden" },
  NOT_FOUND: { status: 404, key: "errors.notFound" },
  METHOD_NOT_ALLOWED: { status: 405, key: "errors.generic" },
  /**
   * Optimistic-locking loss and unique-constraint collisions both land here.
   * There is no renderable key for it yet: a conflict is retried or reported
   * generically, and inventing `errors.conflict` here without the three locale
   * files would put an untranslated string on a screen.
   */
  CONFLICT: { status: 409, key: "errors.generic" },
  PAYLOAD_TOO_LARGE: { status: 413, key: "errors.invalidInput" },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, key: "errors.invalidInput" },
  UNPROCESSABLE_ENTITY: { status: 422, key: "errors.invalidInput" },
  TOO_MANY_REQUESTS: { status: 429, key: "errors.tooManyRequests" },
  INTERNAL_ERROR: { status: 500, key: "errors.generic" },
  SERVICE_UNAVAILABLE: { status: 503, key: "errors.serviceUnavailable" },
});

/** Reverse lookup used by the error handler when only a status is known. */
export const CODE_BY_STATUS = Object.freeze(
  Object.fromEntries(Object.entries(ERROR_CODES).map(([code, meta]) => [meta.status, code])),
);

export function codeForStatus(status) {
  if (CODE_BY_STATUS[status]) return CODE_BY_STATUS[status];
  return status >= 500 ? "INTERNAL_ERROR" : "BAD_USER_INPUT";
}

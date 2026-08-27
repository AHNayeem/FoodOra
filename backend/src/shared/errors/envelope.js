/**
 * envelope.js — the shape of every response body.
 *
 * Not invented here. `frontend/services/http.ts` has returned `Result<T>` since
 * the prototype phase and `frontend/lib/graphql/result.ts` documents the two
 * failure shapes the client already unwraps, so the contract below is those two
 * files written as JSON. Changing it means changing a file in every service.
 *
 *  success           200  { "success": true, "data": … }
 *  expected refusal  200  { "success": false, "error": { "key": "errors.…", "path": … } }
 *  exception         4xx  { "success": false, "error": { "code": …, "key": …, "message": …,
 *                                                        "details": …, "requestId": … } }
 *
 * **The refusal is the one worth understanding.** A wrong password, a spent OTP
 * and an ineligible coupon are answers, not faults: the request was well formed,
 * the server understood it, and the answer is no. `fromPayload` in the frontend
 * unwraps exactly this at HTTP 200, and returning a 400 instead would put a
 * business outcome into the client's exception path, log it as an error, and
 * make every form special-case a status code.
 *
 * `key` is always an i18n key from `messages/*.json`, never prose: the API does
 * not know whether the person reading it chose `en`, `bn` or `ar`.
 */

/** A successful response. `data` may be any JSON value, including `null`. */
export const ok = (data) => ({ success: true, data });

/**
 * A list response. The envelope matches `Paginated<T>` in `services/http.ts`
 * field for field, so a paginated service body stays a one-line map.
 */
export const okPage = ({ items, total, page, pageSize }) => ({
  success: true,
  data: {
    items,
    total,
    page,
    pageSize,
    hasMore: (page - 1) * pageSize + items.length < total,
  },
});

/**
 * An expected refusal — HTTP **200**, `success: false`.
 *
 * @param {string} key  i18n key, e.g. `"errors.invalidOtp"`. It must exist in
 *   all three locale files *and* in `RENDERABLE` in `lib/graphql/result.ts`, or
 *   the screen degrades to `errors.generic`.
 * @param {string} [path]  The form field it belongs to, when it belongs to one.
 */
export const refuse = (key, path) => ({
  success: false,
  error: path ? { key, path } : { key },
});

/** An exception — the body the error handler sends beside a 4xx or 5xx. */
export const fail = ({ code, key, message, details, requestId }) => ({
  success: false,
  error: {
    code,
    key,
    message,
    ...(details === undefined ? {} : { details }),
    ...(requestId === undefined ? {} : { requestId }),
  },
});

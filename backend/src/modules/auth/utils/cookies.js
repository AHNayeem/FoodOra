/**
 * cookies.js — the two cookies, and the CSRF rule that guards them.
 *
 * The refresh credential is the only long-lived secret in the system, so it is
 * the one thing that never touches JavaScript:
 *
 *  - **`foodora_rt`** — `HttpOnly`, `Secure` in production, `SameSite=Lax`, and
 *    scoped by `Path` to the auth mount. The path is what stops the browser
 *    attaching a refresh token to every catalog request, where an XSS on an
 *    unrelated route could ride it.
 *  - **`csrf`** — deliberately *readable* by script, at `Path=/`. It is not a
 *    secret; it is the other half of a double-submit pair. `frontend/lib/graphql/
 *    cookies.ts` already names this cookie `csrf` and the header `x-csrf-token`,
 *    so both names are copied from the client rather than chosen here.
 *
 * ## Why double-submit at all, given `SameSite=Lax`
 *
 * `Lax` already blocks a cross-site `POST`, so on a current browser the CSRF
 * check is redundant. It is here for the two cases where `Lax` is not enough:
 * a deployment that has to relax `SameSite` to `none` because the app and the
 * API sit on different registrable domains, and a browser that treats an absent
 * `SameSite` as `None`. A defence that costs one header comparison is worth
 * keeping for those.
 *
 * The check is only applied when the refresh token *came from the cookie*. A
 * non-browser client that posts the token in the body has no cookie to forge and
 * no ambient authority to abuse, which is the entire premise of CSRF.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import env from "../../../config/env.js";
import { unauthenticated } from "../../../shared/errors/app-error.js";

export const REFRESH_COOKIE = "foodora_rt";
/** Shared verbatim with `frontend/lib/graphql/cookies.ts`. */
export const CSRF_COOKIE = "csrf";
export const CSRF_HEADER = "x-csrf-token";

const baseOptions = () => ({
  secure: env.authCookieSecure,
  sameSite: env.authCookieSameSite,
  ...(env.authCookieDomain ? { domain: env.authCookieDomain } : {}),
});

export const newCsrfToken = () => randomBytes(24).toString("base64url");

/**
 * Attach both cookies to a reply.
 *
 * `maxAge` is the session's remaining life in seconds, so the browser drops the
 * cookie at the same moment the row expires. A cookie that outlives its row is a
 * refresh that fails for no visible reason; a cookie that dies first is a session
 * the customer loses early.
 */
export function setSessionCookies(reply, { refreshToken, csrfToken, expiresAt }) {
  const maxAge = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions(),
    httpOnly: true,
    path: env.authCookiePath,
    maxAge,
  });

  reply.setCookie(CSRF_COOKIE, csrfToken, {
    ...baseOptions(),
    // Readable: the client has to echo it into a header, so it cannot be HttpOnly.
    httpOnly: false,
    path: "/",
    maxAge,
  });
}

/** Expire both, with the same attributes they were set with or the browser keeps them. */
export function clearSessionCookies(reply) {
  reply.clearCookie(REFRESH_COOKIE, { ...baseOptions(), httpOnly: true, path: env.authCookiePath });
  reply.clearCookie(CSRF_COOKIE, { ...baseOptions(), httpOnly: false, path: "/" });
}

export const readRefreshCookie = (request) => request.cookies?.[REFRESH_COOKIE] ?? null;

/**
 * Double-submit: the header must equal the cookie.
 *
 * Throws `UNAUTHENTICATED` rather than returning a refusal, because a missing or
 * mismatched CSRF header is not a business answer — it is a malformed request
 * from something that is not our client.
 */
export function assertCsrf(request) {
  const cookie = request.cookies?.[CSRF_COOKIE];
  const header = request.headers[CSRF_HEADER];

  if (!cookie || typeof header !== "string" || header.length !== cookie.length) {
    throw unauthenticated("Missing or mismatched CSRF token");
  }
  if (!timingSafeEqual(Buffer.from(cookie, "utf8"), Buffer.from(header, "utf8"))) {
    throw unauthenticated("Missing or mismatched CSRF token");
  }
}

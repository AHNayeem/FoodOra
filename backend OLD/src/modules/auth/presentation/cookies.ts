import type { FastifyReply, FastifyRequest } from 'fastify';

import type { JwtConfig } from '../../../config';

/**
 * The refresh cookie, hand-rolled.
 *
 * `@fastify/cookie` would do this, and is not worth a dependency plus a plugin
 * registration in `main.ts` for two cookies whose attributes are the security
 * property being asserted. Every flag below is a decision:
 *
 * - **`HttpOnly`** — JavaScript cannot read it, so an XSS gets the access token in
 *   memory (15 minutes) and not the refresh chain (30 days).
 * - **`Path=/auth`** — the browser never sends it to `/graphql`. That is what makes
 *   the GraphQL endpoint non-cookie-authenticated, and therefore not CSRF-able,
 *   without any per-mutation token.
 * - **`SameSite=Lax`, not `Strict`** — a link from an email lands signed in. `Strict`
 *   would drop the cookie on that navigation, and the endpoints it *is* sent to are
 *   POST-only and double-submit protected anyway.
 * - **`Secure`** everywhere except plain-HTTP localhost, where setting it would mean
 *   no cookie at all and no working sign-in for a developer.
 * - **No `Domain`** on localhost: browsers reject `Domain=localhost`, and a
 *   host-only cookie is the narrower choice regardless.
 */

export const REFRESH_COOKIE = 'rt';

/**
 * The double-submit half of the CSRF defence: readable by JavaScript on purpose, so
 * the client can echo it in a header. An attacker's page can *cause* a request to
 * `/auth/refresh` with the cookie attached, but cannot read the cookie to set the
 * header — which is exactly the asymmetry being exploited.
 */
export const CSRF_COOKIE = 'csrf';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * The CSRF cookie is served at `/`, not at `AUTH_COOKIE_PATH`.
 *
 * `document.cookie` only exposes cookies whose path is a prefix of the current
 * page's path, so a token scoped to `/auth` is invisible to a web app sitting at
 * `/login` — the one credential the client is *supposed* to read would be the one
 * it cannot. Found in V1 Unit 0, when the frontend first tried to refresh.
 *
 * Widening it costs nothing, because path is not what protects this cookie: it is
 * deliberately script-readable, and the asymmetry the defence rests on is that a
 * cross-origin page cannot read *any* of our cookies. The refresh token keeps its
 * narrow path, which is where the security property actually lives.
 */
const CSRF_COOKIE_PATH = '/';

export interface CookieOptions {
  domain: string;
  path: string;
  secure: boolean;
}

export function cookieOptionsFrom(config: JwtConfig, isProduction: boolean): CookieOptions {
  const isLocalhost = config.cookieDomain === 'localhost' || config.cookieDomain === '';
  return {
    domain: isLocalhost ? '' : config.cookieDomain,
    path: config.cookiePath,
    secure: isProduction || !isLocalhost,
  };
}

function serialise(
  name: string,
  value: string,
  options: CookieOptions & { maxAgeSeconds: number; httpOnly: boolean },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAgeSeconds}`,
    'SameSite=Lax',
  ];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.domain) parts.push(`Domain=${options.domain}`);
  return parts.join('; ');
}

/**
 * Sets both cookies in one `Set-Cookie` header value.
 *
 * Fastify's `reply.header` replaces rather than appends, so writing them in two calls
 * would silently drop the first — the kind of bug that looks like "CSRF validation is
 * broken" and is actually "there is no CSRF cookie".
 */
export function setAuthCookies(
  reply: FastifyReply,
  refreshToken: string,
  csrfToken: string,
  expiresAt: Date,
  options: CookieOptions,
): void {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000));
  reply.header('set-cookie', [
    serialise(REFRESH_COOKIE, refreshToken, { ...options, maxAgeSeconds, httpOnly: true }),
    serialise(CSRF_COOKIE, csrfToken, {
      ...options,
      path: CSRF_COOKIE_PATH,
      maxAgeSeconds,
      httpOnly: false,
    }),
  ]);
}

/** Same name, same path, `Max-Age=0`. A cookie cleared on a different path is not cleared. */
export function clearAuthCookies(reply: FastifyReply, options: CookieOptions): void {
  reply.header('set-cookie', [
    serialise(REFRESH_COOKIE, '', { ...options, maxAgeSeconds: 0, httpOnly: true }),
    serialise(CSRF_COOKIE, '', {
      ...options,
      path: CSRF_COOKIE_PATH,
      maxAgeSeconds: 0,
      httpOnly: false,
    }),
  ]);
}

export function readCookie(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;

  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index < 0) continue;
    if (pair.slice(0, index).trim() !== name) continue;
    return decodeURIComponent(pair.slice(index + 1).trim());
  }
  return undefined;
}

/**
 * session.ts — the access token, and the only code that knows how to get one.
 *
 * The API's contract (backend D6 §Cookies):
 *
 * - the **access token** comes back in the `login` / `register` / `verifyOtp`
 *   payload, lasts ~15 minutes, and travels as `Authorization: Bearer`. It is
 *   meant to live in memory, so it lives in a module variable here and is never
 *   written to `localStorage`;
 * - the **refresh token** never touches JavaScript. It is an `httpOnly` cookie
 *   scoped to `/auth`, which is why refreshing is a `fetch` to a REST route and
 *   not a GraphQL mutation — the browser would not send the cookie to `/graphql`;
 * - `POST /auth/refresh` is double-submit protected: the `csrf` cookie's value has
 *   to be echoed in `x-csrf-token`.
 *
 * A page reload therefore starts with a persisted `user` in the auth store and no
 * token at all. `bootstrap()` fixes that by spending the refresh cookie once on
 * mount, which is exactly what that endpoint exists for.
 */
import { AUTH_REST_URL } from "@/config/backend";
import { CSRF_COOKIE, CSRF_HEADER } from "./cookies";

export interface Session {
  accessToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  sessionId: string;
  /**
   * The account as the server last described it.
   *
   * `unknown` on purpose: this module knows about tokens, not about the user read
   * model. `services/auth.ts` owns that shape and is the only thing that narrows
   * it — which keeps `types/user.ts` out of the transport layer.
   */
  user: unknown;
}

/** What `/auth/refresh` sends back — shaped like the GraphQL `AuthSession`. */
interface RefreshResponse {
  user: unknown;
  accessToken: string;
  accessTokenExpiresAt: string;
  sessionId: string;
}

let session: Session | null = null;

/**
 * Renew this far before expiry rather than after a failed request.
 *
 * 60s covers a slow round trip plus clock skew between the browser and the API.
 * The `UNAUTHENTICATED` retry in the Apollo link is the backstop for when it does
 * not, not the primary mechanism.
 */
const RENEW_MARGIN_MS = 60_000;

/** Single-flight: ten queries firing at once must produce one refresh, not ten. */
let inFlight: Promise<Session | null> | null = null;

type Listener = () => void;
const lostListeners = new Set<Listener>();

export function currentSession(): Session | null {
  return session;
}

export function setSession(next: {
  accessToken: string;
  accessTokenExpiresAt: string | Date;
  sessionId: string;
  user: unknown;
}): Session {
  session = {
    accessToken: next.accessToken,
    expiresAt: new Date(next.accessTokenExpiresAt).getTime(),
    sessionId: next.sessionId,
    user: next.user,
  };
  return session;
}

export function clearSession(): void {
  session = null;
  inFlight = null;
}

/**
 * Called when the server has decided this client is not signed in — a refusal from
 * `/auth/refresh`, or an `UNAUTHENTICATED` that survived a retry. The auth store
 * subscribes so the UI drops to its logged-out chrome instead of showing a
 * signed-in header whose every query fails.
 */
export function onSessionLost(listener: Listener): () => void {
  lostListeners.add(listener);
  return () => lostListeners.delete(listener);
}

export function reportSessionLost(): void {
  clearSession();
  for (const listener of lostListeners) listener();
}

/** The `csrf` cookie, which the API deliberately serves script-readable at `/`. */
function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  for (const pair of document.cookie.split(";")) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    if (pair.slice(0, index).trim() !== CSRF_COOKIE) continue;
    return decodeURIComponent(pair.slice(index + 1).trim());
  }
  return null;
}

/**
 * Spend the refresh cookie for a new access token.
 *
 * Returns `null` for every failure, including "there was no cookie" — a signed-out
 * visitor hitting the site for the first time takes this path on boot and it is not
 * an error. Only an *explicit* refusal of a cookie we had reports the session lost.
 */
async function requestRefresh(): Promise<Session | null> {
  const csrf = readCsrfCookie();
  if (!csrf) return null;

  try {
    const response = await fetch(`${AUTH_REST_URL}/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { [CSRF_HEADER]: csrf },
    });

    if (!response.ok) {
      // 401 means the chain is spent, reused or revoked. The cookie has already
      // been cleared by the server; drop our half of the state to match.
      if (response.status === 401) reportSessionLost();
      return null;
    }

    const body = (await response.json()) as RefreshResponse;
    return setSession(body);
  } catch {
    // Network failure, CORS, API down. Not a signed-out state — leave whatever
    // token we have alone so an intermittent outage does not sign anyone out.
    return null;
  }
}

/** A valid access token, refreshing first if the current one is near expiry. */
export async function ensureAccessToken(): Promise<string | null> {
  if (session && session.expiresAt - Date.now() > RENEW_MARGIN_MS) {
    return session.accessToken;
  }
  return (await refresh())?.accessToken ?? null;
}

/** Force a refresh, collapsing concurrent callers onto one request. */
export async function refresh(): Promise<Session | null> {
  inFlight ??= requestRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Turn a persisted user back into a live session on page load.
 *
 * Idempotent and safe to call when signed out: with no `csrf` cookie it is a
 * no-op that costs nothing.
 */
export async function bootstrap(): Promise<Session | null> {
  if (session) return session;
  return refresh();
}

/** Sign out server-side using only the cookie — works even with an expired token. */
export async function revokeSession(): Promise<void> {
  const csrf = readCsrfCookie();
  clearSession();
  if (!csrf) return;

  try {
    await fetch(`${AUTH_REST_URL}/logout`, {
      method: "POST",
      credentials: "include",
      headers: { [CSRF_HEADER]: csrf },
    });
  } catch {
    // Best effort. The local session is already gone, which is the part the user
    // asked for; the server-side revocation retries itself on the next sign-in.
  }
}

/**
 * backend.ts — where the API is, and which slices of the app read from it.
 *
 * The V1 cutover replaces the mock layer one unit at a time, and the frontend has
 * to keep working after every one of them. `LIVE` is how: each service checks its
 * own flag and takes the mock path when it is off, so a half-migrated app is a
 * working app rather than a broken one. Every flag defaults to **off**, which
 * means `bun run dev` with no environment at all behaves exactly as the Phase C
 * prototype did.
 *
 * These are read at build time by the bundler, so each one has to be a literal
 * `process.env.NEXT_PUBLIC_*` member access — a dynamic lookup would not be
 * inlined and would read `undefined` in the browser.
 *
 * The whole file is deleted at the end of V1, when there is no mock path left to
 * fall back to.
 */

const truthy = (raw: string | undefined): boolean => raw === "1" || raw === "true";

/** Origin of the NestJS API. GraphQL and the two cookie routes both hang off it. */
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

export const GRAPHQL_URL = `${API_URL}/graphql`;

/**
 * `POST /auth/refresh` and `POST /auth/logout` are REST, not GraphQL, and that is
 * forced rather than chosen: the refresh cookie is scoped to `/auth`, so the
 * browser never sends it to `/graphql`.
 */
export const AUTH_REST_URL = `${API_URL}/auth`;

/**
 * One flag per **backend slice**, not one per release.
 *
 * The granularity is the point. A single `NEXT_PUBLIC_BACKEND=1` would mean the first
 * slice with a problem takes every other slice down with it, and the only way to
 * bisect "the app broke" would be to turn the whole backend off. Independent flags
 * make each cutover reversible on its own: catalog can serve from Postgres while cart
 * and orders still run on the mock layer, which is exactly the state the middle of V1
 * lives in.
 *
 * Flip one as its unit lands; delete the lot at the end of V1, when there is no mock
 * path left to fall back to.
 */
export const LIVE = {
  /** Unit 0 — sign-in, registration, OTP, password reset, `me`. */
  auth: truthy(process.env.NEXT_PUBLIC_BACKEND_AUTH),

  /**
   * Unit 1 — cuisines, categories, the vendor directory, restaurant detail and menus.
   *
   * Independent of `auth` on purpose: the catalog is public, so it needs no session,
   * and a catalog that only works once somebody has signed in would be the wrong shape
   * of dependency between the two.
   */
  catalog: truthy(process.env.NEXT_PUBLIC_BACKEND_CATALOG),

  /**
   * Unit 2 — the server-side basket: add, update, remove, clear.
   *
   * Independent of `auth`, and that is load-bearing rather than tidy: a basket predates a
   * customer, so an anonymous visitor's cart persists against a `guestKey` this browser
   * generates (`lib/cart-key.ts`). Checkout is what will require an account.
   */
  cart: truthy(process.env.NEXT_PUBLIC_BACKEND_CART),

  /**
   * Unit 3 — checkout: pricing the basket server-side and placing the order. Tracking and
   * the kitchen board follow in Unit 5.
   *
   * **This one is not independent: it requires `cart`.** The server prices the *server's*
   * basket, so an order placed while the cart lived only in Zustand would be priced from an
   * empty one. `services/orders.ts` therefore takes the live path only when both flags are
   * on, which is the one place in this file where a flag has a prerequisite — worth the
   * exception, because the alternative is a checkout that fails with "your basket is empty"
   * in front of a full basket.
   *
   * It also requires a signed-in customer, which is a property of the operation rather than
   * of the flag: `orders.userId` is the only owner column there is.
   */
  orders: truthy(process.env.NEXT_PUBLIC_BACKEND_ORDERS),

  /** Unit 6 — rider assignment, the delivery job, the handover OTP. Not implemented yet. */
  delivery: truthy(process.env.NEXT_PUBLIC_BACKEND_DELIVERY),

  /** Unit 7 — the notification feed and its preferences. Not implemented yet. */
  notifications: truthy(process.env.NEXT_PUBLIC_BACKEND_NOTIFICATIONS),
} as const;

/**
 * How long a single GraphQL operation may take before it is abandoned.
 *
 * A request with no deadline is not "patient", it is a page that never renders. Next
 * streams a Server Component's HTML, so the shell — header, footer — flushes immediately
 * and the segment that is waiting on the API holds the rest open indefinitely: no error,
 * no spinner, no timeout, just a page that is permanently half-drawn. A deadline converts
 * that into a failure the app can actually respond to.
 *
 * Five seconds is chosen against the alternative rather than against a latency target. The
 * API's own budget is `REQUEST_TIMEOUT_MS=30000`, but nobody waits thirty seconds for a
 * restaurant list — by then the visitor has left, and the request is only still open to be
 * billed for.
 */
export const BACKEND_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_BACKEND_TIMEOUT_MS ?? 5_000,
);

/**
 * Whether a failed live read falls back to the Phase C mock layer.
 *
 * On by default, and it is a genuine trade rather than a free win:
 *
 * **For:** the mock layer is a complete, coherent catalogue that ships in the bundle. When
 * the API is unreachable, serving it means a visitor sees a working restaurant list instead
 * of an error page — which for a *read-only browse* surface is unambiguously better, and
 * during a client demo is the difference between a hiccup and a dead site.
 *
 * **Against:** it hides breakage. A misconfigured `NEXT_PUBLIC_API_URL` looks like a
 * working app, so the failure surfaces later and somewhere less obvious. Two things pay for
 * that: every fallback logs `console.error` with the operation name, and the fallback only
 * ever applies to catalog *reads*. Cart mutations never fall back — silently writing a
 * basket to `localStorage` while the customer believes it is saved server-side is exactly
 * the failure this cannot be allowed to cause.
 *
 * Set `NEXT_PUBLIC_BACKEND_FALLBACK=0` in CI, or whenever the point is to find out that the
 * live path is broken.
 */
export const BACKEND_FALLBACK =
  process.env.NEXT_PUBLIC_BACKEND_FALLBACK === undefined
    ? true
    : truthy(process.env.NEXT_PUBLIC_BACKEND_FALLBACK);

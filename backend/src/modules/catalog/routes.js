/**
 * routes.js — the seven endpoints, and what each one requires.
 *
 * Mounted by `routes/v1/index.js` at `${API_PREFIX}/catalog`, so every path below
 * reads `/api/v1/catalog/…` from outside.
 *
 * | Method | Path | Auth | Authorization |
 * | --- | --- | --- | --- |
 * | GET | `/cuisines` | — | — |
 * | GET | `/categories` | — | — |
 * | GET | `/vendors` | optional | `restaurants.view` for `?includeHidden=true` |
 * | GET | `/vendors/featured` | — | — |
 * | GET | `/vendors/trending` | — | — |
 * | GET | `/vendors/:slug` | optional | membership **or** `restaurants.view` for a non-public storefront |
 * | GET | `/search/suggestions` | — | — |
 *
 * ## Optional, not absent
 *
 * Discovery is public — `config/backend.ts` says so where it explains why
 * `LIVE.catalog` is independent of `LIVE.auth`: "the catalog is public, so it
 * needs no session, and a catalog that only works once somebody has signed in
 * would be the wrong shape". But *who* is asking still changes the answer for one
 * case, a merchant previewing a storefront that has not opened, so the two routes
 * that can widen run `optionalUser` first and the rest do not run it at all.
 *
 * ## `featured` and `trending` are static routes before `/:slug`
 *
 * Fastify's router prefers a static segment over a parametric one, deterministically,
 * so `/vendors/featured` reaches the rail and `/vendors/bella-napoli` reaches the
 * storefront. The cost is that those two words are reserved: a vendor whose slug
 * is literally `featured` would be unreachable by URL. It is in M4 §"Known
 * limitations" rather than defended — no vendor is called that, and the
 * alternative shapes (`?rail=`, a second prefix) each cost more than the sentence.
 *
 * ## No tighter rate limit
 *
 * Unlike the credential routes, which get `AUTH_RATE_MAX` because a password is
 * worth guessing at, these are public reads of public data behind the global
 * 300/minute backstop. A tighter per-address ceiling on the directory would fire
 * on an ordinary customer scrolling a results page.
 */
import { ROUTE_SCHEMAS } from "./schemas.js";

export default async function catalogRoutes(fastify, { controller, optionalUser }) {
  fastify.get("/cuisines", { schema: ROUTE_SCHEMAS.cuisines }, controller.cuisines);
  fastify.get("/categories", { schema: ROUTE_SCHEMAS.categories }, controller.categories);

  fastify.get(
    "/vendors",
    { schema: ROUTE_SCHEMAS.vendors, preHandler: optionalUser },
    controller.vendors,
  );

  // Before `/vendors/:slug` — see the header.
  fastify.get("/vendors/featured", { schema: ROUTE_SCHEMAS.featured }, controller.featured);
  fastify.get("/vendors/trending", { schema: ROUTE_SCHEMAS.trending }, controller.trending);

  fastify.get(
    "/vendors/:slug",
    { schema: ROUTE_SCHEMAS.vendorBySlug, preHandler: optionalUser },
    controller.vendorBySlug,
  );

  fastify.get("/search/suggestions", { schema: ROUTE_SCHEMAS.suggestions }, controller.suggestions);
}

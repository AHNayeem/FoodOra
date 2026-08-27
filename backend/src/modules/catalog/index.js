/**
 * index.js — module 4, assembled.
 *
 * One `register` line in `routes/v1/index.js` mounts everything below. What this
 * file wires:
 *
 *  - the repository over `fastify.prisma`, the service over the repository, the
 *    controller over the service and the app;
 *  - `optionalUser`, the module's own hook — see below;
 *  - the routes, at `/catalog` under the versioned prefix.
 *
 * ## Not `fastify-plugin`-wrapped, unlike modules 2 and 3
 *
 * Those two are `fp`-wrapped because they *decorate*: `requireUser`,
 * `requirePermission` and the rest have to be visible to every module registered
 * after them. This module decorates nothing and needs nothing to see inside it,
 * so it takes the encapsulation Fastify gives a plain plugin — which is what
 * makes `{ prefix: "/catalog" }` work here and what makes the hook below apply to
 * these routes and no others.
 *
 * ## `optionalUser` — `requireUser` with the refusal swallowed
 *
 * The catalog is public, and two of its routes answer *more* to a merchant or an
 * operator. That needs an identity when there is one and no failure when there is
 * not, which is neither of the guards this backend already has:
 *
 *  - `fastify.requireUser` (module 2) is right about the account but **throws**,
 *    so a signed-out customer could not browse;
 *  - `fastify.optionalAuth` (F1) does not throw but is **claims-only** — it
 *    populates `request.user` from the JWT without re-reading the account, so a
 *    suspended merchant would keep their elevated view of their own storefront
 *    for the fifteen minutes the token stays signed. `modules/auth/index.js` is
 *    explicit that closing exactly that window is why `requireUser` exists.
 *
 * So this is `requireUser`, with the exception turned into anonymity. The
 * consequences are worth stating plainly, because "swallow the error" is usually
 * the wrong instinct:
 *
 *  - an expired, revoked or forged token, a suspended account, a deleted account
 *    → `request.account` stays null → **the public catalogue, at 200**. That is
 *    the right answer for a browse surface: a customer whose token expired
 *    mid-scroll should see restaurants, not an error page;
 *  - nothing is *granted* by the swallow. Every widening below depends on
 *    `request.account`, which only a successful `requireUser` sets;
 *  - the failure is logged at debug, not silently dropped, so "why am I not
 *    seeing my own pending storefront" is answerable.
 */
import env from "../../config/env.js";
import createRepository from "./repository.js";
import createService, { VIEW_ALL_PERMISSION } from "./service.js";
import createController from "./controller.js";
import catalogRoutes from "./routes.js";

/** Where the endpoints live, under the versioned prefix — `/api/v1/catalog`. */
export const CATALOG_PREFIX = "/catalog";

/**
 * The platform permission that sees every storefront, whatever its status.
 *
 * `restaurants.view` — "See restaurant accounts and their applications", which
 * the seeder grants to partner operations, support, moderation, finance and the
 * super-admin. It is checked through `fastify.mayAuthorize`, so a role granted or
 * revoked in the database takes effect without a new token.
 */
export { VIEW_ALL_PERMISSION as CATALOG_VIEW_ALL_PERMISSION } from "./service.js";

export default async function catalogModule(fastify) {
  if (!fastify.prisma) {
    fastify.log.warn("catalog module skipped — this app was built without the Prisma plugin");
    return;
  }
  if (typeof fastify.requireUser !== "function" || typeof fastify.mayAuthorize !== "function") {
    // A configuration error, not a runtime one: this module must be registered
    // after modules 2 and 3, and half of it would silently answer "public only"
    // otherwise. Fail at boot instead.
    throw new Error(
      "catalog module requires modules 2 and 3 — register it after `authModule` and `authzModule`.",
    );
  }

  const repo = createRepository(fastify.prisma);
  const service = createService({ repo, scanLimit: env.catalogScanLimit, log: fastify.log });
  const controller = createController({
    app: fastify,
    service,
    permission: VIEW_ALL_PERMISSION,
  });

  /** See the header. Authentication when it is offered, anonymity when it is not. */
  async function optionalUser(request) {
    if (!request.headers.authorization) return;
    try {
      await fastify.requireUser(request);
    } catch (error) {
      request.account = null;
      request.log.debug({ err: error }, "catalog: bearer token not usable — answering as anonymous");
    }
  }

  await fastify.register(catalogRoutes, { controller, optionalUser });
}

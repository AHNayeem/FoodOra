/**
 * v1/index.js — the versioned API surface.
 *
 * Empty of domain routes, and that is the deliverable: the foundation phase
 * establishes where modules mount, not what they do. Each module from
 * BACKEND-REQUIREMENTS §3 lands here as one `fastify.register(module, { prefix })`
 * line and nothing else in this file changes.
 *
 * ## Why a prefix and not a header
 *
 * `/api/v1` is in the path because that is what the frontend is already built
 * against — `config/backend.ts` composes `API_URL` with a path — and because a
 * version in the path is visible in a log line, a browser address bar and a curl
 * command. A version negotiated through `Accept` is more correct and less
 * usable, and nothing here needs the correctness.
 *
 * ## What v2 would mean
 *
 * A new folder beside this one, mounted at `/api/v2`, sharing everything in
 * `shared/` and `plugins/`. The two run side by side until the frontend has
 * moved, which is the only reason to version a path at all.
 */
import healthRoutes from "../../health/routes.js";
import authModule from "../../modules/auth/index.js";
import authzModule from "../../modules/authz/index.js";
import catalogModule, { CATALOG_PREFIX } from "../../modules/catalog/index.js";
import cartModule, { CART_PREFIX } from "../../modules/cart/index.js";
import menuModule, { MENU_PREFIX } from "../../modules/menu/index.js";

export default async function v1Routes(fastify) {
  // Same handlers as the unprefixed pair — a client that only knows the
  // versioned base path can still ask whether the service is up.
  await fastify.register(healthRoutes);

  // ---------------------------------------------------------------------------
  // Modules mount here, in the order of BACKEND-REQUIREMENTS §3.
  // ---------------------------------------------------------------------------

  /**
   * Module 2 — auth & sessions, at `/api/v1/auth`.
   *
   * No `prefix` here, and that is not an omission: the module is
   * `fastify-plugin`-wrapped so that `requireUser` reaches the modules that come
   * after it, and `fp` skips the encapsulation a prefix option would attach to.
   * It applies its own `/auth` internally. See `modules/auth/index.js`.
   */
  await fastify.register(authModule);

  /**
   * Module 3 — RBAC / PBAC, at `/api/v1/_authz`.
   *
   * After module 2 and for the same two reasons module 2 is `fp`-wrapped: it
   * needs `requireUser`, which the auth module decorates, and the guards it
   * decorates in turn — `requirePermission`, `requireVendorAccess` — have to
   * reach every module registered below this line. It applies its own prefix,
   * and mounts nothing at all in production.
   */
  await fastify.register(authzModule);

  /**
   * Module 4 — catalog & discovery, at `/api/v1/catalog`.
   *
   * The first module that takes a `prefix` option, and the difference from the two
   * above is worth a line: this one decorates nothing, so it does not need `fp`,
   * and a plain plugin is the one Fastify will actually attach a prefix to. It
   * *consumes* what the two above decorate — `requireUser` for the optional
   * identity, `mayAuthorize` and `authz.vendorAccess` for who may see a storefront
   * that has not opened — and refuses to start if either is missing, so the order
   * of these three lines is load-bearing rather than tidy.
   */
  await fastify.register(catalogModule, { prefix: CATALOG_PREFIX });

  /**
   * Module 5 — menu & inventory, at `/api/v1/menu`.
   *
   * After module 4 because it is module 4's dependant in two senses: the build
   * order in BACKEND-REQUIREMENTS §3 puts it there, and it imports `hours.js` to
   * read a breakfast menu's window in the branch's own timezone. It consumes
   * module 3's `requireVendorAccess` on every write and refuses to start without
   * it, so the order of these four lines is load-bearing rather than tidy.
   *
   * Its three public reads — the customer's menu, one dish, and whether a set of
   * modifiers is orderable — take no session at all, for the reason module 4's
   * directory does not: a menu that only worked once somebody had signed in would
   * be the wrong shape for a food platform.
   */
  await fastify.register(menuModule, { prefix: MENU_PREFIX });

  /**
   * Module 6 — cart, at `/api/v1/cart`.
   *
   * After module 5 because it reads module 5's rules rather than restating them:
   * `availability.js::deriveItemAvailability` decides whether a dish may go in a
   * basket and `options.js::checkSelection` decides whether the modifiers on it
   * are orderable, which is what M5 §15 said this module should call. It also
   * reads module 4's `PUBLIC_STATUSES`, so a storefront the directory hides
   * cannot end up in a basket.
   *
   * It needs module 2 for `requireUser` and refuses to start without it, and it
   * needs module 3 for **nothing at all** — a basket is a customer-resource
   * boundary, not a permission, so there is no guard on any of its six routes and
   * every statement it issues is scoped by its owner instead.
   */
  await fastify.register(cartModule, { prefix: CART_PREFIX });
}

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

export default async function v1Routes(fastify) {
  // Same handlers as the unprefixed pair — a client that only knows the
  // versioned base path can still ask whether the service is up.
  await fastify.register(healthRoutes);

  // ---------------------------------------------------------------------------
  // Modules mount here, in the order of BACKEND-REQUIREMENTS §3.
  //
  //   await fastify.register(catalogRoutes, { prefix: "/catalog" });
  //   …
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
}

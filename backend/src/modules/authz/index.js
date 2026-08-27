/**
 * index.js — module 3, assembled.
 *
 * One `register` line in `routes/v1/index.js`, immediately after module 2,
 * mounts everything below. What this file wires:
 *
 *  - the repository over `fastify.prisma`, the service over the repository;
 *  - the **permission and role catalogue**, read once at boot, so that a
 *    requirement naming a permission this database does not have is a startup
 *    failure rather than a route that refuses everyone forever;
 *  - `request.auth` and the guards every later module declares its requirements
 *    with;
 *  - the verification routes, outside production. See `routes.js`.
 *
 * ## Why it is `fastify-plugin`-wrapped, like module 2
 *
 * For the same reason and with the same consequence: `requirePermission` has to
 * be visible to the modules that come after it, `fp` sets `skip-override` so the
 * decorators land on the versioned route table beside module 2's rather than in
 * a context of their own, and a `prefix` option passed to an `fp` plugin
 * silently does nothing — so the routes apply their own prefix inside.
 *
 * ## The guards
 *
 * ```js
 * fastify.get("/orders", { preHandler: fastify.requirePermission("orders.view") }, handler)
 *
 * fastify.get("/vendors/:vendorId/menu", {
 *   preHandler: fastify.requireAuthorization({
 *     vendor: (request) => request.params.vendorId,
 *     staffRole: ["owner", "manager"],
 *   }),
 * }, handler)
 * ```
 *
 * Each guard **authenticates first if nobody else has**: it calls
 * `fastify.requireUser` when `request.account` is not already set. Two reasons,
 * and the second is why it is not left to the route:
 *
 *  - a route that declares an authorization requirement plainly needs an
 *    identity, so making every such route write `[requireUser, requirePermission]`
 *    is ceremony with exactly one useful outcome and one bad one;
 *  - forgetting the pair would produce a route that answers **401 to everybody,
 *    for ever**, including the super-admin — a failure that looks like a broken
 *    token and is diagnosed nowhere near the route that caused it.
 *
 * Writing `preHandler: [fastify.requireUser, fastify.requirePermission("…")]`
 * still works and costs nothing extra: the guard sees `request.account` already
 * populated and does not re-read it.
 *
 * ## `authenticate` and `authorize` from F1 are not this
 *
 * `plugins/auth.js` has a claims-based `fastify.authorize(...)` that reads
 * `request.user.permissions` — the JWT claim, which M2 mints empty and this
 * module deliberately does not fill (STEP 13). It is left exactly as it is: it
 * is fail-closed, one foundation test covers it, and removing a decorator this
 * phase does not own would be a change for its own sake. **New routes use the
 * guards below**, and `docs/backend/M3-rbac-pbac.md` §"Two `authorize`s" says so
 * where somebody choosing between them will read it.
 */
import fp from "fastify-plugin";
import env from "../../config/env.js";
import { forbidden, notFound, unauthenticated } from "../../shared/errors/app-error.js";
import createRepository from "./repository.js";
import createService from "./service.js";
import { evaluate, normalise } from "./policy.js";
import authzRoutes, { AUTHZ_PREFIX } from "./routes.js";

async function authzModule(fastify) {
  if (!fastify.prisma) {
    fastify.log.warn("authorization module skipped — this app was built without the Prisma plugin");
    return;
  }

  const repo = createRepository(fastify.prisma);
  const authz = createService({ repo, ttlMs: env.authzCacheTtlMs, log: fastify.log });

  /**
   * The vocabularies, as this database actually holds them.
   *
   * Read once. They change when somebody adds a `Permission` row, which is a
   * seeder run and a deploy, not a request — and re-reading them per request to
   * catch a case that cannot happen between two restarts would be the "per-request
   * database explosion" STEP 12 names.
   */
  const catalogue = await repo.listCatalogue();
  if (catalogue.permissions.length === 0) {
    fastify.log.warn(
      "no permissions in the database — authorization requirements will not be validated. Run `npm run seed:reference`.",
    );
  } else {
    fastify.log.info(
      { permissions: catalogue.permissions.length, roles: catalogue.roles.length },
      "authorization catalogue loaded",
    );
  }

  authz.catalogue = Object.freeze({
    permissions: Object.freeze([...catalogue.permissions]),
    roles: Object.freeze([...catalogue.roles]),
  });

  fastify.decorate("authz", authz);

  /** Set by `resolveAuth`; declared so Fastify keeps the request object monomorphic. */
  fastify.decorateRequest("auth", null);

  /**
   * The account's authorization context, resolved once per request.
   *
   * A handler that has been through a guard can read `request.auth` directly. A
   * handler that has not — an optional-auth route deciding what to render —
   * awaits this.
   */
  fastify.decorate("resolveAuth", async function resolveAuth(request) {
    if (request.auth) return request.auth;
    if (!request.account?.id) throw unauthenticated("Authentication required");
    request.auth = await authz.resolve(request.account.id);
    return request.auth;
  });

  /**
   * Ask the question without throwing. Returns the verdict from `policy.js`.
   *
   * For a handler that has to *report* whether something is allowed rather than
   * be stopped by it — `GET /_authz/check` does exactly that.
   */
  fastify.decorate("mayAuthorize", async function mayAuthorize(request, requirement) {
    const normalised = normalise(requirement, catalogue);
    return evaluate({ authz, account: request.account, requirement: normalised, request });
  });

  /**
   * The general guard. Everything below it is sugar over this.
   *
   * The requirement is normalised **here**, at route-registration time, so a
   * misspelt permission throws while the server is starting rather than when the
   * first person is refused by it.
   */
  fastify.decorate("requireAuthorization", function requireAuthorization(requirement) {
    const normalised = normalise(requirement, catalogue);

    return async function authorizationHook(request) {
      // See the header: authenticate if nobody has, so that a route cannot be
      // silently un-authenticated and permanently 401.
      if (!request.account) await fastify.requireUser(request);

      const verdict = await evaluate({ authz, account: request.account, requirement: normalised, request });

      if (verdict.allowed) {
        request.auth = await authz.resolve(request.account.id);
        return;
      }

      // The reason is for us. The client gets the status and what the route
      // wanted — never the caller's resolved set. STEP 11.
      request.log.debug(
        { userId: request.account?.id ?? null, reason: verdict.reason, route: request.routeOptions?.url },
        "authorization refused",
      );

      if (verdict.status === 401) throw unauthenticated("Authentication required");
      if (verdict.status === 404) throw notFound("Resource");
      throw forbidden("Not permitted", { details: { required: verdict.required } });
    };
  });

  /** All of them, platform scope. `preHandler: fastify.requirePermission("payouts.manage")`. */
  fastify.decorate("requirePermission", (...permissions) =>
    fastify.requireAuthorization({ permissions: permissions.flat() }),
  );

  /** Any one of them — for a surface two different desks reach. */
  fastify.decorate("requireAnyPermission", (...permissions) =>
    fastify.requireAuthorization({ anyPermission: permissions.flat() }),
  );

  /** Any one of these roles. Prefer a permission: a role is a bundle, and bundles change. */
  fastify.decorate("requireRole", (...roles) => fastify.requireAuthorization({ roles: roles.flat() }));

  /**
   * Membership of the vendor named by a route parameter.
   *
   * `fastify.requireVendorAccess()` reads `request.params.vendorId`;
   * `fastify.requireVendorAccess("id", { staffRole: ["owner"] })` reads
   * `request.params.id` and narrows to the owner.
   */
  fastify.decorate("requireVendorAccess", (param = "vendorId", extra = {}) =>
    fastify.requireAuthorization({ vendor: (request) => request.params?.[param] ?? null, ...extra }),
  );

  if (env.authzVerifyRoutes) {
    await fastify.register(authzRoutes, { prefix: AUTHZ_PREFIX });
  }
}

export default fp(authzModule, { name: "authz-module", dependencies: ["prisma", "auth", "auth-module"] });

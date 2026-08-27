/**
 * routes.js — the verification surface, and nothing that looks like a product.
 *
 * STEP 14 asks for a way to drive authenticated identity → role resolution →
 * permission resolution → authorization → denial end to end, and STEP 19 forbids
 * implementing any business module to do it with. So these are probes: each one
 * exists to be *refused*, and none of them reads or writes a domain row.
 *
 * They are mounted at `/api/v1/_authz`, the underscore marking them as internal
 * in the same way a private field does, and they are **absent in production** —
 * `AUTHZ_VERIFY_ROUTES` defaults to `!isProduction`, so the deployed API does not
 * carry an endpoint whose whole purpose is to describe the caller's rights.
 *
 * ## What each one is for
 *
 * | Route | Proves |
 * |---|---|
 * | `GET /context` | role and permission resolution, from the database |
 * | `GET /context/:vendorId` | the same, in a vendor's scope, with the membership |
 * | `GET /check` | the non-throwing form — the verdict as data |
 * | `GET /probe/orders-view` | a single permission, granted or refused |
 * | `GET /probe/payouts-manage` | a permission the support desk does *not* hold |
 * | `GET /probe/orders-and-refunds` | ALL-of, the default for two permissions |
 * | `GET /probe/support-or-orders` | ANY-of, asked for by name |
 * | `GET /probe/super-admin` | a role requirement |
 * | `GET /probe/vendor/:vendorId` | membership alone — the merchant shape |
 * | `GET /probe/vendor/:vendorId/orders` | permission AND scope, together |
 * | `GET /probe/vendor/:vendorId/manage` | a staff-role requirement |
 * | `GET /probe/self/:userId` | own resource, or the platform right to see it |
 * | `GET /probe/hidden/:vendorId` | a refusal that hides the resource — 404, not 403 |
 *
 * Every permission named here is one of the twenty in `permissions`, and the
 * module refuses to start if that stops being true — see `policy.js::normalise`.
 */
import { ok } from "../../shared/errors/envelope.js";
import { badRequest } from "../../shared/errors/app-error.js";

/** Under the caller's prefix — `/api/v1/_authz`. */
export const AUTHZ_PREFIX = "/_authz";

/**
 * What a probe answers with when it was *not* refused.
 *
 * The body is not the point — the status code is. `via` names which shape of
 * requirement let the caller through, which is what makes a passing assertion
 * in the test suite say *why* it passed.
 */
const passed = (via) => ok({ allowed: true, via });

export default async function authzRoutes(fastify) {
  const { authz } = fastify;

  // ---------------------------------------------------------------------------
  // Resolution — what the database says this account holds
  // ---------------------------------------------------------------------------

  /**
   * The caller's own authorization context.
   *
   * Only ever the caller's own: there is no `:userId` form, because an endpoint
   * that reports somebody else's rights is an endpoint that maps the platform's
   * staff for whoever asks.
   */
  fastify.get("/context", { preHandler: fastify.requireUser }, async (request) => {
    const auth = await fastify.resolveAuth(request);
    return ok({
      userId: auth.userId,
      status: auth.status,
      roles: auth.rolesIn(null).map((role) => ({ slug: role.slug, name: role.name, rank: role.rank })),
      vendorRoles: auth.roles
        .filter((role) => role.vendorId !== null)
        .map((role) => ({ slug: role.slug, vendorId: role.vendorId })),
      permissions: auth.permissions,
      rank: auth.rankIn(null),
    });
  });

  /**
   * The same, inside one vendor.
   *
   * Reports membership and the effective set *there* — the platform set, plus
   * that vendor's grants, minus that vendor's denials. Nothing about the vendor
   * itself is returned, so a caller cannot use it to discover vendors.
   */
  fastify.get("/context/:vendorId", { preHandler: fastify.requireUser }, async (request) => {
    const { vendorId } = request.params;
    const auth = await fastify.resolveAuth(request);
    const access = await authz.vendorAccess(request.account.id, vendorId);
    return ok({
      vendorId,
      access: { allowed: access.allowed, via: access.via, staffRole: access.staffRole, branchId: access.branchId },
      roles: auth.rolesIn(vendorId).map((role) => role.slug),
      permissions: auth.permissionsIn(vendorId),
    });
  });

  /**
   * The verdict as data rather than as a status code.
   *
   * `?permission=orders.view&vendorId=ven_…`. This is the shape a future
   * endpoint would use to tell a screen which buttons to draw — and the reason
   * `lib/rbac.ts` staying in the frontend is not a security problem, because the
   * server is answering the same question here from the database.
   */
  fastify.get("/check", { preHandler: fastify.requireUser }, async (request) => {
    const { permission, vendorId } = request.query ?? {};
    if (!permission) throw badRequest("A permission is required");
    if (!authz.catalogue.permissions.includes(permission)) {
      throw badRequest(`"${permission}" is not a permission in this database`);
    }

    const verdict = await fastify.mayAuthorize(request, {
      permission,
      ...(vendorId ? { vendor: vendorId } : {}),
    });
    return ok({ permission, vendorId: vendorId ?? null, allowed: verdict.allowed, via: verdict.via ?? null });
  });

  // ---------------------------------------------------------------------------
  // Probes — routes that exist to be refused
  // ---------------------------------------------------------------------------

  fastify.get(
    "/probe/orders-view",
    { preHandler: fastify.requirePermission("orders.view") },
    async () => passed("permission"),
  );

  fastify.get(
    "/probe/payouts-manage",
    { preHandler: fastify.requirePermission("payouts.manage") },
    async () => passed("permission"),
  );

  /** Two permissions means *both* — see `policy.js`. */
  fastify.get(
    "/probe/orders-and-refunds",
    { preHandler: fastify.requirePermission("orders.view", "refunds.manage") },
    async () => passed("all-permissions"),
  );

  fastify.get(
    "/probe/support-or-orders",
    { preHandler: fastify.requireAnyPermission("support.view", "orders.view") },
    async () => passed("any-permission"),
  );

  fastify.get(
    "/probe/super-admin",
    { preHandler: fastify.requireRole("super-admin") },
    async () => passed("role"),
  );

  // -- Resource scope ---------------------------------------------------------

  /** Membership alone: owner, active staff, or a vendor-scoped assignment. */
  fastify.get(
    "/probe/vendor/:vendorId",
    { preHandler: fastify.requireVendorAccess() },
    async (request) => ok({ allowed: true, via: "member", vendorId: request.params.vendorId }),
  );

  /**
   * The pair STEP 10 is about: the permission **and** the resource.
   *
   * A restaurant owner fails it — `restaurant-owner` grants no platform rights,
   * by design. A support agent passes it for any vendor, because `orders.view`
   * held platform-wide is not scoped. That asymmetry is the product's, not an
   * accident of this implementation.
   */
  fastify.get(
    "/probe/vendor/:vendorId/orders",
    {
      preHandler: fastify.requireAuthorization({
        permission: "orders.view",
        vendor: (request) => request.params.vendorId,
      }),
    },
    async (request) => ok({ allowed: true, vendorId: request.params.vendorId }),
  );

  /** Narrowed to the people who run the place. The owner satisfies every staff role. */
  fastify.get(
    "/probe/vendor/:vendorId/manage",
    { preHandler: fastify.requireVendorAccess("vendorId", { staffRole: ["owner", "manager"] }) },
    async (request) => ok({ allowed: true, vendorId: request.params.vendorId }),
  );

  /**
   * Your own record, or the platform right to look at somebody else's.
   *
   * The self short-circuit is what makes this work for a customer, who holds no
   * platform permission at all.
   */
  fastify.get(
    "/probe/self/:userId",
    {
      preHandler: fastify.requireAuthorization({
        self: (request) => request.params.userId,
        permission: "customers.view",
      }),
    },
    async (request) => ok({ allowed: true, userId: request.params.userId }),
  );

  /**
   * A refusal that does not admit the resource exists.
   *
   * 404 rather than 403, for the case STEP 11 names: where "forbidden" would
   * itself be the leak, because it confirms the id is real.
   */
  fastify.get(
    "/probe/hidden/:vendorId",
    { preHandler: fastify.requireVendorAccess("vendorId", { hide: true }) },
    async (request) => ok({ allowed: true, vendorId: request.params.vendorId }),
  );
}

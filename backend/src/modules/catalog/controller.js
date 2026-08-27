/**
 * controller.js — HTTP, and the viewer's rights read once.
 *
 * The same division `modules/auth/controller.js` keeps: read the request into a
 * plain input object, call the service, wrap the answer in the envelope. No
 * handler here decides who may see a storefront — `service.js` does, from the
 * `viewer` this file builds.
 *
 * ## Why the viewer is built here and not in the service
 *
 * `viewer` is the whole of what authorization contributes to this module, and it
 * is deliberately three plain values rather than a `request`:
 *
 *     { userId, canSeeAll, canAccessVendor(vendorId) }
 *
 * The service is then testable without a Fastify request, and — more importantly —
 * it cannot accidentally reach for a *claim*. `canSeeAll` comes from
 * `fastify.mayAuthorize`, which resolves the permission set from the database
 * (module 3), not from the JWT's `permissions` array, which M2 mints empty and
 * M3 deliberately leaves empty. A service handed a request could read
 * `request.user.permissions`, find `[]`, and be wrong in the safe direction today
 * and the unsafe direction the day somebody fills the claim in.
 *
 * `canAccessVendor` is a function rather than a resolved list because the answer
 * is only needed for the one vendor a detail request names, and asking
 * `authz.vendorAccess` per vendor in a listing would be one query per card.
 */
import { ok, okPage } from "../../shared/errors/envelope.js";
import { toPoint } from "./geo.js";

/** Nobody signed in: the public catalogue, and no way to widen it. */
const ANONYMOUS = Object.freeze({
  userId: null,
  canSeeAll: false,
  canAccessVendor: async () => false,
});

/** `?lat=&lng=`, or null. Both or neither — see `schemas.js`. */
const originOf = (request) => toPoint(request.query?.lat, request.query?.lng);

export function createController({ app, service, permission = "restaurants.view" }) {
  /**
   * Who is asking, and what that entitles them to see.
   *
   * `request.account` is set by the module's `optionalUser` hook, which is
   * `requireUser` with the failure swallowed — see `index.js`. So a caller with
   * no token, an expired token or a suspended account is `ANONYMOUS` here, and
   * the *only* thing that widens visibility is an account this server has just
   * re-read from the database.
   */
  async function viewerFor(request) {
    if (!request.account?.id) return ANONYMOUS;

    const verdict = await app.mayAuthorize(request, { permission });
    return {
      userId: request.account.id,
      canSeeAll: verdict.allowed,
      canAccessVendor: async (vendorId) => {
        const access = await app.authz.vendorAccess(request.account.id, vendorId);
        return access.allowed;
      },
    };
  }

  return {
    cuisines: async () => ok(await service.cuisines()),

    categories: async () => ok(await service.categories()),

    /**
     * `Paginated<Vendor>` — `okPage` derives `hasMore` from the three numbers, so
     * the envelope matches `services/http.ts` field for field.
     */
    vendors: async (request) => {
      const page = await service.listVendors(request.query, { viewer: await viewerFor(request) });
      return okPage({ items: page.items, total: page.total, page: page.page, pageSize: page.pageSize });
    },

    featured: async (request) =>
      ok(await service.rail("featured", { limit: request.query.limit, origin: originOf(request) })),

    trending: async (request) =>
      ok(await service.rail("trending", { limit: request.query.limit, origin: originOf(request) })),

    vendorBySlug: async (request) =>
      ok(
        await service.vendorBySlug(request.params.slug, {
          viewer: await viewerFor(request),
          origin: originOf(request),
        }),
      ),

    suggestions: async (request) =>
      ok(await service.suggestions(request.query.q, { limit: request.query.limit })),
  };
}

export default createController;

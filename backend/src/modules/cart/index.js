/**
 * index.js — module 6, assembled.
 *
 * One `register` line in `routes/v1/index.js` mounts everything below: the
 * repository over `fastify.prisma`, the service over the repository, an id minter
 * and the three configured limits, the controller over the service, and the
 * routes at `/cart` under the versioned prefix.
 *
 * ## Not `fastify-plugin`-wrapped, like modules 4 and 5
 *
 * Modules 2 and 3 are `fp`-wrapped because they *decorate*, and their decorators
 * have to reach everything registered after them. This module decorates nothing
 * and needs nothing to see inside it, so it takes the encapsulation Fastify gives
 * a plain plugin — which is what makes `{ prefix: "/cart" }` work and what keeps
 * the `optionalUser` hook on these six routes and no others.
 *
 * ## It refuses to start without module 2
 *
 * `requireUser` is module 2's, and without it every request would fall through to
 * the guest path — so a signed-in customer would be handed whatever basket their
 * browser's key pointed at, silently, at 200. That is a configuration error, not
 * a runtime one, so it fails at boot where somebody is looking.
 *
 * ## `optionalUser`, again — and why it is copied rather than shared
 *
 * The same nine lines as `modules/catalog/index.js`, for the same reason: F1's
 * `optionalAuth` is claims-only and would keep a suspended account's identity
 * alive for the fifteen minutes its token stays signed, while module 2's
 * `requireUser` throws and would lock a signed-out visitor out of their own
 * basket. This is `requireUser` with the exception turned into anonymity.
 *
 * Copied rather than promoted to a shared decorator on purpose. The two modules
 * make the *same* mechanical choice for *different* reasons — the catalog widens
 * a public read for a merchant, the cart picks between two owners — and a shared
 * helper would make the next module's author reach for it without deciding which
 * of those two situations they are in. Nine lines is a cheaper price than that.
 * Module 7 makes it three, and three is when it becomes a decorator.
 */
import env from "../../config/env.js";
import createRepository from "./repository.js";
import createService from "./service.js";
import createController from "./controller.js";
import cartRoutes from "./routes.js";
import { ID_PREFIXES } from "../../shared/constants/id-prefixes.js";
import { newId } from "../../shared/utils/ids.js";

/** Where the endpoints live, under the versioned prefix — `/api/v1/cart`. */
export const CART_PREFIX = "/cart";

/** `mint("cart")` → `cart_01J8…`. Refuses a name the registry does not carry. */
export function mint(kind) {
  const prefix = ID_PREFIXES[kind];
  if (!prefix) {
    throw new Error(`"${kind}" has no id prefix — add it to shared/constants/id-prefixes.js.`);
  }
  return newId(prefix);
}

export default async function cartModule(fastify) {
  if (!fastify.prisma) {
    fastify.log.warn("cart module skipped — this app was built without the Prisma plugin");
    return;
  }
  if (typeof fastify.requireUser !== "function") {
    throw new Error("cart module requires module 2 — register it after `authModule`.");
  }

  const repo = createRepository(fastify.prisma);
  const service = createService({
    repo,
    newId: mint,
    limits: {
      maxLines: env.cartMaxLines,
      maxLineQuantity: env.cartMaxLineQuantity,
      ttlHours: env.cartTtlHours,
    },
    log: fastify.log,
  });
  const controller = createController({ service });

  /** See the header. Authentication when it is offered, anonymity when it is not. */
  async function optionalUser(request) {
    if (!request.headers.authorization) return;
    try {
      await fastify.requireUser(request);
    } catch (error) {
      request.account = null;
      request.log.debug({ err: error }, "cart: bearer token not usable — falling back to the guest key");
    }
  }

  await fastify.register(cartRoutes, { controller, optionalUser });
}

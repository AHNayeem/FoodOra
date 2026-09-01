/**
 * index.js — module 5, assembled.
 *
 * One `register` line in `routes/v1/index.js` mounts everything below. What this
 * file wires: the repository over `fastify.prisma`, the service over the
 * repository and an id minter, the controller over the service and the app, and
 * the routes at `/menu` under the versioned prefix.
 *
 * ## Not `fastify-plugin`-wrapped, like module 4 and unlike modules 2 and 3
 *
 * Those two are `fp`-wrapped because they *decorate*, and their decorators have to
 * be visible to everything registered after them. This module decorates nothing
 * and needs nothing to see inside it, so it takes the encapsulation Fastify gives
 * a plain plugin — which is what makes `{ prefix: "/menu" }` work here.
 *
 * ## It refuses to start without modules 2, 3 and 4
 *
 * `requireVendorAccess` is module 3's and `hours.js` is module 4's, and half of
 * this module would silently answer "public only" if the first were missing. That
 * is a configuration error, not a runtime one, so it fails at boot where somebody
 * is looking — the same check, for the same reason, as `modules/catalog/index.js`.
 *
 * ## Why the id minter is injected rather than imported
 *
 * `service.js` mints seven kinds of id and `newId` refuses an unregistered prefix
 * by design. Passing a minter that closes over `ID_PREFIXES` keeps the service
 * testable without the registry and keeps the registry the single list of what
 * this backend writes: a prefix that is not in `shared/constants/id-prefixes.js`
 * throws at the first call rather than producing rows nobody can find later.
 */
import createRepository from "./repository.js";
import createService from "./service.js";
import createController from "./controller.js";
import menuRoutes from "./routes.js";
import { ID_PREFIXES } from "../../shared/constants/id-prefixes.js";
import { newId } from "../../shared/utils/ids.js";

/** Where the endpoints live, under the versioned prefix — `/api/v1/menu`. */
export const MENU_PREFIX = "/menu";

/** `mint("foodItem")` → `food_01J8…`. Refuses a name the registry does not carry. */
export function mint(kind) {
  const prefix = ID_PREFIXES[kind];
  if (!prefix) {
    throw new Error(`"${kind}" has no id prefix — add it to shared/constants/id-prefixes.js.`);
  }
  return newId(prefix);
}

export default async function menuModule(fastify) {
  if (!fastify.prisma) {
    fastify.log.warn("menu module skipped — this app was built without the Prisma plugin");
    return;
  }
  if (typeof fastify.requireVendorAccess !== "function" || !fastify.authz) {
    throw new Error(
      "menu module requires modules 2 and 3 — register it after `authModule` and `authzModule`.",
    );
  }

  const repo = createRepository(fastify.prisma);
  const service = createService({ repo, newId: mint, log: fastify.log });
  const controller = createController({ app: fastify, service });

  await fastify.register(menuRoutes, { controller });
}

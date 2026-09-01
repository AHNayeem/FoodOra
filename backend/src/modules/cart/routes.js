/**
 * routes.js — the six endpoints, and what each one requires.
 *
 * Mounted by `routes/v1/index.js` at `${API_PREFIX}/cart`, so every path below
 * reads `/api/v1/cart/…` from outside.
 *
 * | Method | Path | Owner |
 * | --- | --- | --- |
 * | GET | `/` | session **or** `X-Cart-Key` |
 * | POST | `/items` | session **or** `X-Cart-Key` |
 * | PATCH | `/items/:lineId` | session **or** `X-Cart-Key` |
 * | DELETE | `/items/:lineId` | session **or** `X-Cart-Key` |
 * | DELETE | `/` | session **or** `X-Cart-Key` |
 * | POST | `/validate` | session **or** `X-Cart-Key` |
 *
 * ## Six operations, not CRUD
 *
 * §5 of the brief asks for meaningful cart operations rather than generic CRUD,
 * and the list above is what the shipped client actually does:
 * `stores/cart.ts::add`, `setQuantity`, `removeLine` and `clear`, plus the read
 * that `hydrateFromServer` makes on mount, plus the pre-checkout check module 7
 * needs. There is no `POST /carts` and no cart id in any path — a customer has
 * one basket and the server knows which, so an id in the path would be a second
 * way to name a thing that can only be named one way, and the first place an
 * ownership check gets forgotten.
 *
 * ## Nothing here is guarded, and everything here is scoped
 *
 * There is no `preHandler` on any route, which looks like a hole and is the
 * opposite. A basket predates a customer: the prototype lets an anonymous visitor
 * fill one and asks who they are at checkout, so a guard that demanded a session
 * would break the product's first screen. What stands in its place is stronger
 * than a guard, because it cannot be forgotten per route — **every statement this
 * module issues is scoped by the owner clause**, so there is no query that could
 * return another customer's row for a check to have to catch.
 *
 * A request that identifies nobody is refused by `service.js::ownerOf` with
 * `UNAUTHENTICATED`, before any row is read.
 *
 * ## No new permissions
 *
 * §13: a cart is a customer-resource boundary, not a permission. Module 3's
 * vocabulary gains nothing here, and `requireVendorAccess` appears nowhere —
 * vendor staff have no route into a customer's basket at all, which is a stronger
 * statement than a rule that says they may not use one.
 */
import { ROUTE_SCHEMAS } from "./schemas.js";

export default async function cartRoutes(fastify, { controller, optionalUser }) {
  /** Identity when it is offered, anonymity when it is not — see `index.js`. */
  fastify.addHook("preHandler", optionalUser);

  fastify.get("/", { schema: ROUTE_SCHEMAS.getCart }, controller.getCart);

  fastify.post("/items", { schema: ROUTE_SCHEMAS.addItem }, controller.addItem);

  /**
   * `PATCH`, not `PUT`: the body sets one field of a line that already exists, and
   * a `PUT` would promise that a client could create a line by naming an id it
   * computed — which is exactly the client-supplied-key shape §8 rules out.
   */
  fastify.patch("/items/:lineId", { schema: ROUTE_SCHEMAS.updateQuantity }, controller.updateQuantity);

  fastify.delete("/items/:lineId", { schema: ROUTE_SCHEMAS.removeItem }, controller.removeItem);

  fastify.delete("/", { schema: ROUTE_SCHEMAS.clearCart }, controller.clearCart);

  /**
   * `POST` for a read, because it is the one route whose answer must never be
   * cached: a validation is a statement about the menu *now*, and a 200 a browser
   * or a CDN kept for thirty seconds is a customer told their basket is fine after
   * the dish sold out.
   */
  fastify.post("/validate", { schema: ROUTE_SCHEMAS.validateCart }, controller.validateCart);
}

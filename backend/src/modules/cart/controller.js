/**
 * controller.js — HTTP, and the owner resolved once.
 *
 * The same division modules 2, 4 and 5 keep: read the request into plain values,
 * call the service, wrap the answer in the envelope. No handler here decides who
 * owns a basket — it reads the two facts that could identify one and hands them
 * down, and `service.js::ownerOf` applies the precedence in one place.
 *
 * ## Why the guest key is a header
 *
 * `lib/cart-key.ts` keeps the key in `localStorage` **and argues against a
 * cookie**: a cookie would be sent to every route, including the ones with no
 * business knowing it. So it cannot arrive automatically, and it has to arrive on
 * `GET` and `DELETE` as well as on the two routes with a body — which leaves a
 * header as the only shape that is the same on all six. `X-Cart-Key`, allow-listed
 * in `plugins/cors.js` so a browser preflight passes.
 *
 * It is read **only** as a fallback: `service.js` ignores it entirely whenever
 * `request.account` is set, so a signed-in customer cannot be handed somebody
 * else's basket by a header they did not notice.
 */
import { ok, refuse } from "../../shared/errors/envelope.js";
import { GUEST_KEY_HEADER } from "./schemas.js";

/** `{ refusal }` → 200 refusal; anything else → 200 success. Module 2's shape. */
const envelope = (result) =>
  result?.refusal ? refuse(result.refusal, result.path) : ok(result?.payload ?? null);

export function createController({ service }) {
  /**
   * The two facts that could identify a basket.
   *
   * `request.account` is set by the module's `optionalUser` hook — a real account
   * re-read from the database, not a JWT claim — and is null for a signed-out
   * visitor and for anybody whose token has expired, been revoked or belongs to a
   * suspended account. The precedence between the two is the service's.
   */
  const identityOf = (request) => ({
    userId: request.account?.id ?? null,
    guestKey: request.headers[GUEST_KEY_HEADER] ?? null,
  });

  return {
    getCart: async (request) => ok(await service.getCart(identityOf(request))),

    addItem: async (request) =>
      envelope(
        await service.addItem(identityOf(request), {
          foodId: request.body.foodId,
          optionIds: request.body.optionIds ?? [],
          quantity: request.body.quantity ?? 1,
          note: request.body.note,
          replaceExisting: request.body.replaceExisting === true,
        }),
      ),

    updateQuantity: async (request) =>
      envelope(await service.updateQuantity(identityOf(request), request.params.lineId, request.body.quantity)),

    removeItem: async (request) => envelope(await service.removeItem(identityOf(request), request.params.lineId)),

    clearCart: async (request) => envelope(await service.clearCart(identityOf(request))),

    validateCart: async (request) => ok(await service.validateCart(identityOf(request))),
  };
}

export default createController;

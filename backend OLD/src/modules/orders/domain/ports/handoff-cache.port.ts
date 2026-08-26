export const HANDOFF_CACHE = Symbol('HANDOFF_CACHE');

/**
 * Where the plaintext hand-off code lives between placement and the doorstep.
 *
 * Redis, with a TTL, because Postgres holds only the hash — and because the code has to
 * survive the placement response. The customer's tracker is a different request from the
 * one that created the order, and a code the customer cannot see again is a code they
 * cannot read out.
 *
 * The TTL is the design, not a cache optimisation. It bounds how long a live code exists
 * in readable form anywhere, which is the property the hash-only column was chosen for; a
 * code that outlived its delivery by a month would give that property back.
 *
 * A miss is not an error. `frontend/types/order.ts::OrderLifecycle.otp` becomes an empty
 * string, the tracker shows no code, and the rider's verify call still works because that
 * path compares against the hash. Losing Redis costs a display, not a delivery.
 */
export interface HandoffCachePort {
  remember(orderId: string, code: string, ttlSeconds: number): Promise<void>;
  recall(orderId: string): Promise<string | null>;
  forget(orderId: string): Promise<void>;
}

import { LIVE } from "@/config/backend";
import { getCartKey } from "@/lib/cart-key";
import {
  ADD_TO_CART,
  CLEAR_CART,
  MY_CART,
  REMOVE_CART_ITEM,
  UPDATE_CART_ITEM,
  type CartPayloadWire,
  type CartWire,
} from "@/lib/graphql/cart.operations";
import { execute } from "@/lib/graphql/execute";
import type { CartLine, CartVendor } from "@/types";

/**
 * cart.ts — the server-side basket, as `stores/cart.ts` sees it.
 *
 * ## Why this is a mirror and not a source of truth
 *
 * The prototype's cart is a Zustand store with synchronous actions: `add()` returns
 * `{ conflict }` immediately, the drawer opens on the same tick, the header badge updates
 * before the click finishes. Six components depend on that, and V1's governing constraint is
 * that none of them changes.
 *
 * So the store stays authoritative for what the user sees, and every mutation is *echoed*
 * here. The division is deliberate rather than a compromise:
 *
 * - the client owns **responsiveness** — no spinner on a quantity stepper;
 * - the server owns **truth** — real prices from real rows, validated options, one vendor
 *   per basket, and a basket that survives a new device or a cleared tab.
 *
 * Reconciliation happens on the next *read* (`fetchCart`, on mount), not on the click. That
 * is the trade: for a few seconds after a failed mirror, the local cart can be ahead of the
 * server. For a basket that is acceptable, and it is the same bargain every optimistic UI
 * makes. It stops being acceptable at checkout, which is why checkout must price the
 * *server's* cart and not the store's — and why `syncFailed` is exported rather than
 * swallowed.
 *
 * ## Why nothing here falls back to a local answer
 *
 * `services/catalog.ts` degrades to the mock layer when the API is unreachable, because
 * serving a slightly stale restaurant list beats an error page. Writes get the opposite
 * treatment. A mutation that "succeeded" locally while failing server-side produces a
 * customer who believes their basket is saved and discovers otherwise at checkout — so a
 * failed mirror returns `null` and says so in the console, and the store keeps its local
 * state without pretending it was persisted.
 */

/** What the store needs back: the two fields it holds, plus the id for later units. */
export interface ServerCart {
  id: string;
  vendor: CartVendor;
  lines: CartLine[];
  /** The server's own arithmetic, for comparison against `lib/cart.ts`. */
  subtotal: number;
  deliveryFee: number;
  count: number;
}

/** A refusal the server anticipates — an i18n key, never prose. */
export interface CartRefusal {
  key: string;
  params?: Record<string, unknown> | null;
}

export type CartSyncResult =
  | { status: "ok"; cart: ServerCart | null }
  /** The server said no, for a reason the UI could render. */
  | { status: "refused"; refusal: CartRefusal }
  /** The request never landed. The local cart is now ahead of the server. */
  | { status: "unavailable" };

/** True when the server cart is in play at all. */
export const cartSyncEnabled = (): boolean => LIVE.cart;

function toServerCart(wire: CartWire): ServerCart {
  return {
    id: wire.id,
    vendor: wire.vendor,
    lines: wire.lines,
    subtotal: wire.subtotal,
    deliveryFee: wire.deliveryFee,
    count: wire.count,
  };
}

function fromPayload(payload: CartPayloadWire): CartSyncResult {
  if (!payload.success) {
    return {
      status: "refused",
      refusal: { key: payload.error?.key ?? "errors.unexpected", params: payload.error?.params },
    };
  }
  return { status: "ok", cart: payload.data ? toServerCart(payload.data) : null };
}

/**
 * Every operation goes through here.
 *
 * `unavailable` rather than a thrown error, because every caller is a store action that
 * cannot be `await`ed by its component — an exception would become an unhandled rejection
 * and, in development, an error overlay over a working cart.
 */
async function mirror(operation: string, run: () => Promise<CartSyncResult>): Promise<CartSyncResult> {
  if (!LIVE.cart) return { status: "unavailable" };

  try {
    return await run();
  } catch (error) {
    console.error(
      `[cart] ${operation} did not reach the API — the local basket is ahead of the server:`,
      error instanceof Error ? error.message : error,
    );
    return { status: "unavailable" };
  }
}

/**
 * The guest key, or `undefined` when signed in.
 *
 * Sent unconditionally: the server ignores it whenever the request carries an authenticated
 * actor, and deciding here would mean this module had to know about the auth store — and
 * would get it wrong in the window between a token expiring and the refresh landing. One
 * side has to own the precedence, and the side holding the session is the right one.
 */
function guestKey(): string | undefined {
  return getCartKey() ?? undefined;
}

export async function fetchCart(): Promise<CartSyncResult> {
  return mirror("myCart", async () => {
    const { myCart } = await execute(MY_CART, { guestKey: guestKey() });
    return { status: "ok", cart: myCart ? toServerCart(myCart) : null };
  });
}

/**
 * Add a configured dish.
 *
 * `optionIds` only — no names and no prices. The server reads those from the stored rows,
 * which is what makes a basket built against a ten-minute-old page price correctly.
 */
export async function addItem(input: {
  foodId: string;
  optionIds: string[];
  quantity: number;
  /** Set only after the customer has answered the "start a new cart?" prompt. */
  replaceExisting: boolean;
}): Promise<CartSyncResult> {
  return mirror("addToCart", async () => {
    const { addToCart } = await execute(ADD_TO_CART, {
      input: {
        foodId: input.foodId,
        optionIds: input.optionIds,
        quantity: input.quantity,
        replaceExisting: input.replaceExisting,
        guestKey: guestKey(),
      },
    });
    return fromPayload(addToCart);
  });
}

export async function updateItemQuantity(
  lineId: string,
  quantity: number,
): Promise<CartSyncResult> {
  return mirror("updateCartItem", async () => {
    const { updateCartItem } = await execute(UPDATE_CART_ITEM, {
      input: { lineId, quantity, guestKey: guestKey() },
    });
    return fromPayload(updateCartItem);
  });
}

export async function removeItem(lineId: string): Promise<CartSyncResult> {
  return mirror("removeCartItem", async () => {
    const { removeCartItem } = await execute(REMOVE_CART_ITEM, {
      input: { lineId, guestKey: guestKey() },
    });
    return fromPayload(removeCartItem);
  });
}

export async function clearCart(): Promise<CartSyncResult> {
  return mirror("clearCart", async () => {
    const { clearCart: result } = await execute(CLEAR_CART, { guestKey: guestKey() });
    if (!result.success) {
      return {
        status: "refused",
        refusal: { key: result.error?.key ?? "errors.unexpected" },
      };
    }
    return { status: "ok", cart: null };
  });
}

/**
 * The anonymous cart key.
 *
 * ## Why this exists
 *
 * A basket predates a customer. The prototype lets an anonymous visitor browse, configure a
 * dish and fill a cart, and only asks who they are at checkout — so the server-side cart
 * needs a way to own a basket that has no user id behind it. This is that: an opaque
 * high-entropy string, generated once per browser, kept beside the persisted cart, and sent
 * with every cart operation while the visitor is signed out.
 *
 * ## The trust model, stated plainly
 *
 * Possession of the key *is* the claim to the basket, exactly as with any anonymous session
 * cookie. Someone who obtains a key can read and modify that cart. That is acceptable for a
 * basket — the contents are not secret and there is nothing to spend — and it would not be
 * acceptable for an order, which is why checkout will require a real account. 128 bits of
 * `crypto.getRandomValues` is what makes it unguessable; the server additionally refuses
 * anything shorter than 16 characters.
 *
 * ## Why localStorage rather than a cookie
 *
 * Because it lives next to the thing it identifies. `stores/cart.ts` persists the cart to
 * `localStorage` under `foodora-cart`, so a browser that has one has the other, and a
 * visitor who clears site data loses both together — which is the behaviour to want. A
 * cookie would additionally be sent on every request to every route, including the ones
 * that have no business knowing it.
 */

const STORAGE_KEY = "foodora-cart-key";

/** url-safe, no padding — the alphabet the server's `guestKey` schema accepts. */
function generate(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The key for this browser, minting one on first use.
 *
 * Returns `null` on the server rather than generating one, and that distinction matters: a
 * key minted during SSR would belong to a render rather than to a browser, so every request
 * would invent a new basket. Cart operations only ever run from client components, so the
 * null case means "not applicable" rather than "failed".
 */
export function getCartKey(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const created = generate();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // Private browsing, or storage disabled. The cart still works locally — Zustand's
    // `persist` degrades the same way — it simply cannot be mirrored to the server, and a
    // thrown `SecurityError` here would take the whole add-to-cart click down with it.
    return null;
  }
}

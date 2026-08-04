import { gql, type TypedDocumentNode } from "@apollo/client";

import type { CartLine, CartVendor } from "@/types";

/**
 * The cart documents.
 *
 * Every selection set is exactly `types/cart.ts` — `CartVendor` and `CartLine`, field for
 * field — so what comes back *is* what `stores/cart.ts` already holds and the components
 * already render. The wire types below are declared in terms of those interfaces rather
 * than restated, so drift is a compile error at the assignment rather than a runtime
 * surprise.
 *
 * The cart adds three derived fields the frontend does not model: `subtotal`, `deliveryFee`
 * and `count`. `lib/cart.ts` computes all three locally and will keep doing so — the store
 * is authoritative for what the user sees. They are selected anyway because they are how
 * the two implementations get compared: if the server's subtotal ever disagrees with the
 * client's, that is worth knowing at the point of the mutation rather than at checkout.
 *
 * Hand-written `TypedDocumentNode`s, as in `auth.operations.ts` and `catalog.operations.ts`:
 * an untyped `DocumentNode` types `data` as `{}` under Apollo v4.
 */

const CART_FIELDS = gql`
  fragment CartFields on Cart {
    id
    vendor {
      id
      slug
      name
      currency
      countryCode
      deliveryFee
      minOrder
      freeDeliveryOver
    }
    lines {
      id
      foodId
      name
      image
      basePrice
      unitPrice
      quantity
      options {
        groupId
        optionId
        name
        priceDelta
      }
    }
    subtotal
    deliveryFee
    count
    updatedAt
  }
`;

/**
 * The server's cart.
 *
 * `vendor` is non-null here while `stores/cart.ts` types it `CartVendor | null`, and the
 * two agree: the server represents "no basket" as a null *cart*, not as a cart with no
 * vendor. An empty cart pinned to a restaurant would silently block the next add from
 * anywhere else, which is the bug that shape prevents.
 */
export interface CartWire {
  id: string;
  vendor: CartVendor;
  lines: CartLine[];
  subtotal: number;
  deliveryFee: number;
  count: number;
  updatedAt: string;
}

/** The payload envelope every cart mutation returns (D5 §Payload types). */
export interface CartPayloadWire {
  success: boolean;
  error: { key: string; path?: string | null; params?: Record<string, unknown> | null } | null;
  data: CartWire | null;
}

export const MY_CART: TypedDocumentNode<
  { myCart: CartWire | null },
  { guestKey?: string | null }
> = gql`
  ${CART_FIELDS}
  query MyCart($guestKey: String) {
    myCart(guestKey: $guestKey) {
      ...CartFields
    }
  }
`;

export const ADD_TO_CART: TypedDocumentNode<
  { addToCart: CartPayloadWire },
  {
    input: {
      foodId: string;
      optionIds?: string[];
      quantity: number;
      replaceExisting: boolean;
      guestKey?: string | null;
    };
  }
> = gql`
  ${CART_FIELDS}
  mutation AddToCart($input: AddToCartInput!) {
    addToCart(input: $input) {
      success
      error {
        key
        path
        params
      }
      data {
        ...CartFields
      }
    }
  }
`;

export const UPDATE_CART_ITEM: TypedDocumentNode<
  { updateCartItem: CartPayloadWire },
  { input: { lineId: string; quantity: number; guestKey?: string | null } }
> = gql`
  ${CART_FIELDS}
  mutation UpdateCartItem($input: UpdateCartItemInput!) {
    updateCartItem(input: $input) {
      success
      error {
        key
        path
        params
      }
      data {
        ...CartFields
      }
    }
  }
`;

export const REMOVE_CART_ITEM: TypedDocumentNode<
  { removeCartItem: CartPayloadWire },
  { input: { lineId: string; guestKey?: string | null } }
> = gql`
  ${CART_FIELDS}
  mutation RemoveCartItem($input: RemoveCartItemInput!) {
    removeCartItem(input: $input) {
      success
      error {
        key
        path
        params
      }
      data {
        ...CartFields
      }
    }
  }
`;

export const CLEAR_CART: TypedDocumentNode<
  { clearCart: { success: boolean; error: { key: string } | null } },
  { guestKey?: string | null }
> = gql`
  mutation ClearCart($guestKey: String) {
    clearCart(guestKey: $guestKey) {
      success
      error {
        key
      }
    }
  }
`;

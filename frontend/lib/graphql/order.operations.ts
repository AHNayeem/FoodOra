import { gql, type TypedDocumentNode } from "@apollo/client";

import type {
  CartLine,
  CartVendor,
  DeliveryAddress,
  FulfillmentType,
  OrderActor,
  OrderPricing,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/types";

/**
 * The checkout documents.
 *
 * ## What is *not* in the variables
 *
 * No `subtotal`, `deliveryFee`, `discount`, `tax`, `taxRate`, `tip`, `total` or
 * `unitPrice`. The server computes every one of them, and this file is where that becomes
 * visible: `PlaceOrderVariables` below is the complete list of what the client is permitted
 * to say about an order, and the only two entries with any monetary consequence are
 * `tipPercent` (a fraction) and `couponCode` (an identifier).
 *
 * `services/orders.ts::placeOrder` still *accepts* a whole `OrderPricing`, because V1 may
 * not change that interface — and it sends `pricing.couponCode` and nothing else from it.
 * Reading this file is the quickest way to confirm that.
 *
 * ## Why the tip is a fraction
 *
 * Because that is what the customer chose: `lib/checkout.ts::TIP_PRESETS` is a list of
 * fractions and the summary renders money from one. It also survives the case this whole
 * unit exists for — if the server's subtotal differs from the page's (a repriced menu, a
 * basket edited on another device), ten percent is still ten percent, where a stale ৳42 is a
 * number nobody meant.
 *
 * Selection sets are exactly `types/order.ts`, field for field, so what comes back *is*
 * what `stores/orders.ts` already holds and the confirmation screen already renders. Hand-
 * written `TypedDocumentNode`s, as everywhere else here: an untyped `DocumentNode` types
 * `data` as `{}` under Apollo v4.
 */

const ORDER_FIELDS = gql`
  fragment OrderFields on Order {
    id
    orderNumber
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
    fulfillment
    address {
      label
      recipient
      phone
      line1
      line2
      area
      city
      countryCode
      instructions
    }
    scheduledFor
    contact {
      name
      phone
    }
    notes
    payment {
      method
      status
      cardLast4
    }
    pricing {
      currency
      subtotal
      deliveryFee
      discount
      couponCode
      tax
      taxLabel
      taxRate
      tip
      total
    }
    status
    placedAt
    estimatedDeliveryAt
    lifecycle {
      events {
        id
        status
        at
        actor
        note
      }
      prepMinutes
      promisedReadyAt
      delayMinutes
      rejectionReason
      cancelReason
      cancelledBy
      failureReason
      assignedAt
      rejectedRiderIds
      otp
      otpAttempts
      otpVerifiedAt
      refund
      refundAmount
      rating
    }
    createdAt
    updatedAt
    deletedAt
  }
`;

/**
 * The server's order.
 *
 * Dates arrive as ISO strings — `types/order.ts` types them `ISODate`, which is what they
 * already are in the mock layer, so no conversion is needed anywhere. `lifecycle.rider` and
 * `lifecycle.assignment` are absent from the selection because the server has nothing to put
 * in them until the delivery unit exists; `services/orders.ts` fills both with `null`, which
 * is exactly what `createLifecycle` did.
 */
/**
 * One lifecycle event as the **schema** returns it.
 *
 * `note: String` — the encoded string the domain retired in Phase 18 (G45). It is
 * still what `backend/schema.gql` publishes, so it is still what the selection set
 * asks for and what this type has to say; translating it into
 * `OrderEventDetail` is the mapper's job (`services/orders.toOrder`), which is
 * where every other wire/domain difference is already handled.
 *
 * Spelling it out here rather than reusing the domain `OrderEvent` is the point:
 * the two shapes really are different now, and a wire type that borrowed the
 * domain's would have claimed a field the query does not fetch.
 */
export interface OrderEventWire {
  id: string;
  status: OrderStatus;
  at: string;
  actor: OrderActor;
  note: string | null;
}

export interface OrderWire {
  id: string;
  orderNumber: string;
  vendor: CartVendor;
  lines: CartLine[];
  fulfillment: FulfillmentType;
  address: DeliveryAddress | null;
  scheduledFor: string | null;
  contact: { name: string; phone: string };
  notes: string | null;
  payment: { method: PaymentMethod; status: PaymentStatus; cardLast4: string | null };
  pricing: OrderPricing;
  status: OrderStatus;
  placedAt: string;
  estimatedDeliveryAt: string;
  lifecycle: {
    events: OrderEventWire[];
    prepMinutes: number | null;
    promisedReadyAt: string | null;
    delayMinutes: number;
    rejectionReason: string | null;
    cancelReason: string | null;
    cancelledBy: string | null;
    failureReason: string | null;
    assignedAt: string | null;
    rejectedRiderIds: string[];
    otp: string;
    otpAttempts: number;
    otpVerifiedAt: string | null;
    refund: string;
    refundAmount: number;
    rating: number | null;
  };
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** What a coupon is worth, as the server priced it. */
export interface AppliedCouponWire {
  id: string;
  code: string;
  title: string;
  kind: string;
  discount: number;
  freeDelivery: boolean;
  deliveryWaived: number;
  cashback: number;
}

export interface CheckoutSummaryWire {
  cartId: string;
  vendor: CartVendor;
  lines: CartLine[];
  fulfillment: FulfillmentType;
  pricing: OrderPricing;
  count: number;
  eligible: boolean;
  blockedReason: string | null;
  amountToMinOrder: number;
  coupon: AppliedCouponWire | null;
  couponRefusal: string | null;
}

interface PayloadWire<T> {
  success: boolean;
  error: { key: string; path?: string | null; params?: Record<string, unknown> | null } | null;
  data: T | null;
}

export type OrderPayloadWire = PayloadWire<OrderWire>;
export type CheckoutSummaryPayloadWire = PayloadWire<CheckoutSummaryWire>;

/** The complete set of what a client may say about an order's money: a fraction and a code. */
export interface PlaceOrderVariables {
  input: {
    fulfillment: FulfillmentType;
    tipPercent: number;
    couponCode?: string | null;
    address?: DeliveryAddress | null;
    scheduledFor?: string | null;
    contactName: string;
    contactPhone: string;
    notes?: string | null;
    paymentMethod: PaymentMethod;
    cardLast4?: string | null;
    guestKey?: string | null;
  };
}

export const CHECKOUT_SUMMARY: TypedDocumentNode<
  { checkoutSummary: CheckoutSummaryPayloadWire },
  {
    input: {
      fulfillment: FulfillmentType;
      tipPercent: number;
      couponCode?: string | null;
      guestKey?: string | null;
    };
  }
> = gql`
  query CheckoutSummary($input: CheckoutSummaryInput!) {
    checkoutSummary(input: $input) {
      success
      error {
        key
        path
        params
      }
      data {
        cartId
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
        fulfillment
        pricing {
          currency
          subtotal
          deliveryFee
          discount
          couponCode
          tax
          taxLabel
          taxRate
          tip
          total
        }
        count
        eligible
        blockedReason
        amountToMinOrder
        coupon {
          id
          code
          title
          kind
          discount
          freeDelivery
          deliveryWaived
          cashback
        }
        couponRefusal
      }
    }
  }
`;

export const PLACE_ORDER: TypedDocumentNode<
  { placeOrder: OrderPayloadWire },
  PlaceOrderVariables
> = gql`
  ${ORDER_FIELDS}
  mutation PlaceOrder($input: PlaceOrderInput!) {
    placeOrder(input: $input) {
      success
      error {
        key
        path
        params
      }
      data {
        ...OrderFields
      }
    }
  }
`;

export const ORDER_BY_ID: TypedDocumentNode<{ order: OrderWire | null }, { id: string }> = gql`
  ${ORDER_FIELDS}
  query OrderById($id: String!) {
    order(id: $id) {
      ...OrderFields
    }
  }
`;

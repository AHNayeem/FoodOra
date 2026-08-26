import type { CartLineRecord } from '../../../cart/domain';
import type {
  CouponRecord,
  DeliveryAddressRecord,
  OrderPricingRecord,
  PlacedOrder,
  TaxRuleRecord,
} from '../models';
import type { FulfillmentType, PaymentMethod, PaymentStatus } from '../../../../shared/enums';

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

/** Everything the row needs that is not derivable from the cart. */
export interface NewOrder {
  /**
   * Never null, and that is a schema fact rather than a policy I chose: `orders` has a
   * nullable `userId` and **no `guestKey` column**, so a guest order would be an order
   * with no owner at all — unreachable by `myOrders`, unattributable in support, and
   * impossible to refund to anybody. `config/backend.ts` said it first: "Checkout is what
   * will require an account."
   */
  userId: string;
  vendorId: string;
  branchId: string | null;
  vendorSnapshot: unknown;
  address: DeliveryAddressRecord | null;
  fulfillment: FulfillmentType;
  scheduledFor: Date | null;
  contact: { name: string; phone: string };
  notes: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  cardLast4: string | null;
  pricing: OrderPricingRecord;
  couponId: string | null;
  lines: readonly CartLineRecord[];
  placedAt: Date;
  estimatedDeliveryAt: Date;
  /** SHA-256 of the hand-off code. The plaintext is never written to Postgres. */
  otpHash: string;
}

/**
 * Storage for orders, plus the three reads checkout needs from tables it does not own.
 *
 * Those three are here rather than behind their own ports because none of them is a
 * *capability* another module would want — they are lookups this module performs while
 * pricing, and a `TaxRulePort` with one implementation and one caller would be ceremony.
 * The line the repository does not cross is writing them: checkout reads `tax_rules`,
 * `coupons` and `orders`, and writes only the last.
 */
export interface OrderRepositoryPort {
  /**
   * Writes the order, its items, their options and the first lifecycle event.
   *
   * One method rather than four, because the four are never useful apart. An order with
   * no items is not a partial order, it is a corrupt one, and a caller able to write the
   * header alone is a caller able to create it.
   *
   * Must be called inside a transaction — the caller also empties the cart, and the two
   * are one act.
   */
  createOrder(order: NewOrder): Promise<PlacedOrder>;

  /**
   * One order, if it belongs to this account.
   *
   * Ownership is a filter rather than a separate check that returns a different error: an
   * endpoint answering "not found" for a stranger's order and "forbidden" for a real one
   * is an oracle for which order numbers exist.
   */
  findOrderById(orderId: string, userId: string): Promise<PlacedOrder | null>;

  /**
   * The most specific live tax rule for a jurisdiction, or null when none is configured.
   *
   * Scope narrows vendor → city → country, and `null` is a real answer rather than an
   * error: a country with no rule loaded charges no tax, which is what the frontend did
   * for any country missing from its table.
   */
  resolveTaxRule(input: {
    countryCode: string;
    city: string | null;
    vendorId: string;
    at: Date;
  }): Promise<TaxRuleRecord | null>;

  /** A coupon by canonicalised code, with its vendor and category scope resolved. */
  findCouponByCode(code: string): Promise<CouponRecord | null>;

  /**
   * How many times this coupon has been spent — by this customer, and in total.
   *
   * Counted from **orders**, not from `coupon_redemptions`. That is forced rather than
   * preferred: a `coupon_redemptions` row has a composite foreign key onto
   * `coupon_claims`, so writing one means owning the claim lifecycle, which is the
   * promotions unit's job and not checkout's. Meanwhile `orders.couponId` is a column this
   * module *does* write, so it is the honest source for "has this been used".
   *
   * Counting orders also decides a question the counter column leaves open: a cancelled or
   * rejected order does not consume a coupon. Nobody was fed and nobody was charged, so
   * the ticket goes back in the wallet — which is what a customer would expect and the
   * opposite of what an incrementing counter would have done.
   */
  countCouponUse(couponId: string, userId: string): Promise<{ byUser: number; total: number }>;

  /** Has this account ever placed an order? Drives `firstOrderOnly`. */
  hasPlacedOrder(userId: string): Promise<boolean>;
}

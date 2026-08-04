/**
 * Checkout's expected refusals, as i18n keys.
 *
 * Same dividing line as the cart's: a thing a customer can cause by clicking is a
 * `UserError` at HTTP 200; a malformed argument is a validation error; a database that
 * is down is an exception. What changes at checkout is the *cost* of getting it wrong,
 * because this is the operation that creates a financial document — so several of these
 * exist to refuse rather than to guess.
 *
 * The coupon refusals are separate, under `coupons.reason.*`, because they are already a
 * vocabulary the frontend renders (`components/checkout/coupon-field.tsx` reads
 * `tc('reason.' + key)`), and because a coupon that does not apply is not a failed
 * checkout — the order can still be placed without it.
 */
export const CheckoutError = {
  /** No live basket for this owner. Nothing to price, nothing to order. */
  cartEmpty: 'checkout.errors.cartEmpty',
  /**
   * The vendor was suspended, delisted or lost its primary branch while the basket sat.
   *
   * Refused rather than priced with zeroes: an order against a storefront the platform
   * no longer lists is one nobody will cook.
   */
  vendorUnavailable: 'checkout.errors.vendorUnavailable',
  /**
   * The restaurant is closed *now* and the order is not scheduled.
   *
   * Deliberately not enforced when the basket was built — Unit 2 lets a customer fill a
   * basket at a closed kitchen, because that is normal and the shipped UI allows it.
   * Checkout is where `isOpen` finally means something.
   */
  vendorClosed: 'checkout.errors.vendorClosed',
  /** Subtotal below the vendor's minimum order, on delivery. */
  belowMinimum: 'checkout.errors.belowMinimum',
  /** Delivery chosen with no address. */
  addressRequired: 'checkout.errors.addressRequired',
  /** Contact name or phone missing — the restaurant has to be able to call. */
  contactRequired: 'checkout.errors.contactRequired',
  /** A scheduled time in the past, or further out than the platform accepts. */
  scheduleInvalid: 'checkout.errors.scheduleInvalid',
  /** Tip outside 0…`CHECKOUT_MAX_TIP_PERCENT`. */
  tipInvalid: 'checkout.errors.tipInvalid',
  /** A tender the checkout screen does not offer (`mfs`, `netbanking`). */
  paymentUnsupported: 'checkout.errors.paymentUnsupported',
  /**
   * A coupon code was sent and the server would not honour it.
   *
   * This one is a *refusal of the order*, not just of the discount, and that is the
   * deliberate choice. Placing the order anyway would charge the customer more than the
   * screen showed them — quietly, at the exact moment they committed. Better to fail
   * the click and let the UI re-price.
   */
  couponRejected: 'checkout.errors.couponRejected',
  /** The order was written but could not be read back. Should be unreachable. */
  orderNotFound: 'checkout.errors.orderNotFound',
} as const;

export type CheckoutErrorKey = (typeof CheckoutError)[keyof typeof CheckoutError];

/**
 * Why a coupon did not apply. `coupons.reason.*`, matching the keys
 * `frontend/lib/coupons.ts` already produces, so the existing coupon field renders a
 * server refusal with no new translations.
 */
export const CouponRefusal = {
  unknownCode: 'coupons.reason.unknownCode',
  used: 'coupons.reason.used',
  notStarted: 'coupons.reason.notStarted',
  expired: 'coupons.reason.expired',
  currency: 'coupons.reason.currency',
  vendorOnly: 'coupons.reason.vendorOnly',
  categoryOnly: 'coupons.reason.categoryOnly',
  firstOrderOnly: 'coupons.reason.firstOrderOnly',
  minOrder: 'coupons.reason.minOrder',
  deliveryOnly: 'coupons.reason.deliveryOnly',
  needsTwoItems: 'coupons.reason.needsTwoItems',
  noSaving: 'coupons.reason.noSaving',
  /** The platform-wide cap is spent. No frontend equivalent — the mock has no cap. */
  exhausted: 'coupons.reason.exhausted',
} as const;

export type CouponRefusalKey = (typeof CouponRefusal)[keyof typeof CouponRefusal];

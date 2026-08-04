export {
  CheckoutError,
  type CheckoutErrorKey,
  CouponRefusal,
  type CouponRefusalKey,
} from './checkout-errors';
export type {
  CheckoutChoices,
  CheckoutQuote,
  CouponOutcome,
  CouponRecord,
  DeliveryAddressRecord,
  OrderEventRecord,
  OrderLifecycleRecord,
  OrderPaymentRecord,
  OrderPricingRecord,
  PlaceOrderRequest,
  PlacedOrder,
  TaxRuleRecord,
} from './models';
export {
  type CouponContext,
  type CouponEvaluation,
  couponSavings,
  evaluateCoupon,
  normaliseCode,
} from './policies/coupon';
export { formatOrderNumber, ORDER_NUMBER_SCOPE } from './policies/order-number';
export {
  amountToMinOrder,
  computePricing,
  isValidTipPercent,
  type PricingInput,
} from './policies/pricing';
export { HANDOFF_CACHE, type HandoffCachePort } from './ports/handoff-cache.port';
export { HANDOFF_CODE, type HandoffCodePort } from './ports/handoff-code.port';
export {
  type NewOrder,
  ORDER_REPOSITORY,
  type OrderRepositoryPort,
} from './ports/order.repository.port';

import { registerAs } from '@nestjs/config';

import { loadEnvironment } from './environment';

/**
 * Checkout's bounds and the two numbers it has to invent.
 *
 * The tip cap is the only one of these that is a *policy*: a tip is the one amount at
 * checkout the server cannot derive from stored rows, because generosity is not a fact
 * about the menu. So it is accepted as a fraction of the subtotal and clamped — not to
 * stop a customer being generous, but so a client bug cannot turn a ৳400 dinner into a
 * ৳40,000 charge and a support case.
 *
 * `defaultEtaMinutes` is a placeholder by design and not laziness. Nobody knows when
 * this order will arrive until the kitchen accepts it and commits to a preparation
 * time; `frontend/services/orders.ts` promises forty minutes for the same reason, and
 * `estimatedDeliveryAt` is overwritten the moment the restaurant answers.
 */
export const checkoutConfig = registerAs('checkout', () => {
  const env = loadEnvironment();
  return {
    /** Ceiling on the tip, as a fraction of the subtotal. */
    maxTipPercent: env.CHECKOUT_MAX_TIP_PERCENT,
    /** Provisional hand-off estimate, minutes from placement. */
    defaultEtaMinutes: env.CHECKOUT_DEFAULT_ETA_MINUTES,
    /** Digits in the delivery hand-off code. Four, because a doorstep is not a bank. */
    otpDigits: env.CHECKOUT_OTP_DIGITS,
    /**
     * How long the plaintext hand-off code stays readable in Redis.
     *
     * Postgres holds only its SHA-256 (`orders.otpHash`), so this TTL is the window in
     * which the customer's own tracker can be shown the code again after placement.
     * Longer than any real delivery, shorter than forever.
     */
    otpTtlHours: env.CHECKOUT_OTP_TTL_HOURS,
  } as const;
});

export type CheckoutConfig = ReturnType<typeof checkoutConfig>;

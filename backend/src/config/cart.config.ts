import { registerAs } from '@nestjs/config';

import { loadEnvironment } from './environment';

/**
 * The cart's bounds.
 *
 * These are not anti-abuse rate limits — `@RateLimit()` does that — they are
 * statements about what a food-delivery basket *is*. Fifty distinct configurations
 * and twenty units of each is already an implausible dinner; a request beyond it is
 * either a script or a customer who wants the catering flow, and both are better
 * served by a refusal that names the limit than by a 300-line cart that fails at
 * checkout for a reason nobody can see.
 */
export const cartConfig = registerAs('cart', () => {
  const env = loadEnvironment();
  return {
    maxLines: env.CART_MAX_LINES,
    maxLineQuantity: env.CART_MAX_LINE_QUANTITY,
    ttlHours: env.CART_TTL_HOURS,
  } as const;
});

export type CartConfig = ReturnType<typeof cartConfig>;

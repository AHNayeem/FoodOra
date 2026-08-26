import { registerAs } from '@nestjs/config';

import { loadEnvironment } from './environment';

/**
 * Provider **enablement** lives in the `payment_providers` table, not here
 * (D7) — turning bKash on for Bangladesh is an operational decision, not a
 * redeploy. This namespace holds only the secret VALUES those rows reference.
 */
export const paymentConfig = registerAs('payment', () => {
  const env = loadEnvironment();
  return {
    stripe: { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET },
    sslcommerz: {
      storeId: env.SSLCOMMERZ_STORE_ID,
      storePassword: env.SSLCOMMERZ_STORE_PASSWORD,
      sandbox: env.SSLCOMMERZ_SANDBOX,
    },
    bkash: {
      appKey: env.BKASH_APP_KEY,
      appSecret: env.BKASH_APP_SECRET,
      username: env.BKASH_USERNAME,
      password: env.BKASH_PASSWORD,
    },
    nagad: {
      merchantId: env.NAGAD_MERCHANT_ID,
      privateKey: env.NAGAD_PRIVATE_KEY,
      publicKey: env.NAGAD_PUBLIC_KEY,
    },
    rocket: { merchantId: env.ROCKET_MERCHANT_ID, apiKey: env.ROCKET_API_KEY },
    paypal: { clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET },
  } as const;
});

export type PaymentConfig = ReturnType<typeof paymentConfig>;

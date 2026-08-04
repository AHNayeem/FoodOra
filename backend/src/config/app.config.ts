import { registerAs } from '@nestjs/config';

import { loadEnvironment } from './environment';

export const appConfig = registerAs('app', () => {
  const env = loadEnvironment();
  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
    isTest: env.NODE_ENV === 'test',
    name: 'foodora-api',
    version: process.env.npm_package_version ?? '0.1.0',
    host: env.HOST,
    port: env.PORT,
    appUrl: env.APP_URL,
    webUrl: env.WEB_URL,
    /** Comma-separated in the environment, an allowlist in code. */
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
    /**
     * The platform fallbacks for a request that carries no actor and no
     * region hint. `RequestContext` resolves the real ones per request
     * (D1 §Multi-country); nothing downstream may assume Bangladesh.
     */
    defaults: {
      countryCode: env.DEFAULT_COUNTRY,
      currency: env.DEFAULT_CURRENCY,
      locale: env.DEFAULT_LOCALE,
      timezone: env.DEFAULT_TIMEZONE,
    },
  } as const;
});

export type AppConfig = ReturnType<typeof appConfig>;

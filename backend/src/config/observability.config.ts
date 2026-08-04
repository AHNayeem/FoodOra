import { registerAs } from '@nestjs/config';

import { loadEnvironment } from './environment';

export const observabilityConfig = registerAs('observability', () => {
  const env = loadEnvironment();
  return {
    logLevel: env.LOG_LEVEL,
    /** Human-readable logs locally; JSON everywhere a log shipper reads them. */
    prettyLogs: env.LOG_PRETTY && env.NODE_ENV !== 'production',
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT || null,
    serviceName: env.OTEL_SERVICE_NAME,
    sentryDsn: env.SENTRY_DSN || null,
    metricsEnabled: env.METRICS_ENABLED,
    maps: { provider: env.MAPS_PROVIDER, apiKey: env.MAPS_API_KEY },
    ai: {
      provider: env.AI_PROVIDER,
      apiKey: env.AI_API_KEY,
      model: env.AI_MODEL,
      monthlyBudgetUsd: env.AI_MONTHLY_BUDGET_USD,
    },
  } as const;
});

export type ObservabilityConfig = ReturnType<typeof observabilityConfig>;

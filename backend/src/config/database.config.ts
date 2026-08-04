import { registerAs } from '@nestjs/config';

import { loadEnvironment } from './environment';

export const databaseConfig = registerAs('database', () => {
  const env = loadEnvironment();
  return {
    url: env.DATABASE_URL,
    /** Migrations need session-level state, so they bypass PgBouncer (D10). */
    directUrl: env.DATABASE_DIRECT_URL || env.DATABASE_URL,
    /** Empty until a replica exists; reads only route here behind an explicit marker. */
    replicaUrl: env.DATABASE_REPLICA_URL || null,
    logQueries: env.DATABASE_LOG_QUERIES,
    /** A query slower than this is logged at `warn` with its duration. */
    slowQueryMs: env.DATABASE_SLOW_QUERY_MS,
    connectRetries: env.DATABASE_CONNECT_RETRIES,
    connectRetryDelayMs: env.DATABASE_CONNECT_RETRY_MS,
  } as const;
});

export type DatabaseConfig = ReturnType<typeof databaseConfig>;

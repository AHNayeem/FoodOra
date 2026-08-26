import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import Redis, { type RedisOptions } from 'ioredis';

import { redisConfig, type RedisConfig } from '../../config';
import { RATE_LIMITER } from '../../shared/contracts';
import { CacheService } from './cache.service';
import { RateLimiterService } from './rate-limiter.service';
import { REDIS_CACHE, REDIS_PUBSUB, REDIS_QUEUE } from './redis.constants';

const logger = new Logger('Redis');

/**
 * Node's happy-eyeballs resolver hands back an `AggregateError` whose own
 * `message` is empty — logging it verbatim produces a warning that says
 * nothing. Reach into the first cause, which is the one with `ECONNREFUSED` on
 * it.
 */
function describe(error: Error): string {
  if (error instanceof AggregateError && error.errors.length) {
    const [first] = error.errors as Error[];
    return first?.message || error.name;
  }
  return error.message || error.name;
}

function createClient(url: string, name: string, options: RedisOptions = {}): Redis {
  // A Redis that is down retries every second forever. Logging each attempt
  // buries everything else in the file; log the first failure, then at most one
  // line a minute until it recovers.
  let lastLoggedAt = 0;
  const LOG_INTERVAL_MS = 60_000;

  const client = new Redis(url, {
    // Connect in the background: like Postgres, a Redis that is briefly away
    // must not crash-loop the pod. The readiness probe reports it instead.
    lazyConnect: false,
    enableReadyCheck: true,
    maxRetriesPerRequest: options.maxRetriesPerRequest ?? 3,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
    connectionName: `foodora-${name}`,
    ...options,
  });

  client.on('error', (error: Error) => {
    const now = Date.now();
    if (now - lastLoggedAt < LOG_INTERVAL_MS) return;
    lastLoggedAt = now;
    logger.warn(`[${name}] ${describe(error)}`);
  });
  client.on('ready', () => {
    lastLoggedAt = 0;
    logger.log(`[${name}] connected`);
  });
  return client;
}

/**
 * Connections only. The cache *policy* — what is cached, under which key, with
 * which tags — lives in `CacheService` and in each module's key registry, so a
 * module can be reasoned about without reading this file.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CACHE,
      inject: [redisConfig.KEY],
      useFactory: (config: RedisConfig) =>
        createClient(config.cacheUrl, 'cache', { keyPrefix: config.keyPrefix }),
    },
    {
      provide: REDIS_QUEUE,
      inject: [redisConfig.KEY],
      useFactory: (config: RedisConfig) =>
        // BullMQ requires blocking commands to wait indefinitely; capping
        // retries here makes workers throw mid-job instead of reconnecting.
        createClient(config.queueUrl, 'queue', { maxRetriesPerRequest: null }),
    },
    {
      provide: REDIS_PUBSUB,
      inject: [redisConfig.KEY],
      useFactory: (config: RedisConfig) => createClient(config.pubsubUrl, 'pubsub'),
    },
    CacheService,
    RateLimiterService,
    // Published under the contract token so a guard in `common/` and a service
    // in `application/` can both depend on the capability without either
    // importing `infrastructure/`.
    { provide: RATE_LIMITER, useExisting: RateLimiterService },
  ],
  exports: [REDIS_CACHE, REDIS_QUEUE, REDIS_PUBSUB, CacheService, RATE_LIMITER],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS_CACHE) private readonly cache: Redis,
    @Inject(REDIS_QUEUE) private readonly queue: Redis,
    @Inject(REDIS_PUBSUB) private readonly pubsub: Redis,
  ) {}

  /** `quit` drains in-flight commands; `disconnect` would drop them. */
  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.cache.quit(), this.queue.quit(), this.pubsub.quit()]);
  }
}

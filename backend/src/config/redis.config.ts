import { registerAs } from '@nestjs/config';

import { loadEnvironment } from './environment';

/**
 * Three logical databases, not one (D10 §Data stores): a cache flush must not
 * be able to drop the job queue, and pub/sub traffic must not evict cache
 * entries. The URLs default to sensible neighbours of `REDIS_URL` so local dev
 * needs one variable, while production sets all three explicitly.
 */
function sibling(url: string, db: number): string {
  try {
    const parsed = new URL(url);
    parsed.pathname = `/${db}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

export const redisConfig = registerAs('redis', () => {
  const env = loadEnvironment();
  return {
    /** db 0 — allkeys-lru. Disposable by design. */
    cacheUrl: env.REDIS_URL,
    /** db 1 — noeviction. Evicting a job loses work. */
    queueUrl: env.REDIS_QUEUE_URL || sibling(env.REDIS_URL, 1),
    /** db 2 — pub/sub fan-out for WebSocket subscriptions. */
    pubsubUrl: env.REDIS_PUBSUB_URL || sibling(env.REDIS_URL, 2),
    keyPrefix: env.REDIS_KEY_PREFIX,
  } as const;
});

export type RedisConfig = ReturnType<typeof redisConfig>;

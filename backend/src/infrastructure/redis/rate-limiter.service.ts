import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

import type { RateLimiterPort, RateLimitVerdict } from '../../shared/contracts';
import { CLOCK, type Clock } from '../../shared/kernel';
import { withDeadline } from './deadline';
import { REDIS_CACHE } from './redis.constants';

/**
 * A **sliding** window, not a fixed one.
 *
 * A fixed window resets on the clock, so "10 per 15 minutes" actually allows 20
 * in two seconds across a boundary — which is the exact burst a credential
 * stuffer wants. A sorted set of hit timestamps, trimmed to the window on every
 * read, has no boundary to straddle: the answer to "how many in the last 15
 * minutes" is always literally that.
 *
 * The cost is one small sorted set per key, expiring on its own. The pipeline
 * below is four commands in one round trip.
 */
@Injectable()
export class RateLimiterService implements RateLimiterPort {
  private readonly logger = new Logger(RateLimiterService.name);

  constructor(
    @Inject(REDIS_CACHE) private readonly redis: Redis,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitVerdict> {
    const now = this.clock.now();
    const windowMs = windowSeconds * 1_000;
    const cutoff = now - windowMs;
    const bucket = this.bucketKey(key);

    try {
      const [, , countReply, oldestReply] = (await withDeadline(
        this.redis
          .multi()
          // Drop everything that has slid out of the window…
          .zremrangebyscore(bucket, 0, cutoff)
          // …record this hit. The member has to be unique or two hits in the same
          // millisecond would collapse into one; the score is what we sort on.
          .zadd(bucket, now, `${now}-${Math.random().toString(36).slice(2, 10)}`)
          .zcard(bucket)
          // Cheap TTL so an idle bucket disappears instead of accumulating.
          .expire(bucket, windowSeconds + 1)
          .zrange(bucket, 0, 0, 'WITHSCORES')
          .exec(),
      )) ?? [[null, 0]];

      const count = Number(countReply?.[1] ?? 0);
      const oldest = Number((oldestReply?.[1] as string[] | undefined)?.[1] ?? now);

      if (count <= limit) {
        return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSeconds: 0 };
      }

      // Room appears when the oldest hit leaves the window, which is a real
      // answer rather than "try again in a minute".
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1_000));
      return { allowed: false, remaining: 0, retryAfterSeconds };
    } catch (error) {
      // Fail open, loudly. See the contract: a Redis outage must not lock every
      // user out of signing in.
      this.logger.warn(
        `rate limit check failed for "${key}", allowing the request: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await withDeadline(this.redis.del(this.bucketKey(key)));
    } catch (error) {
      this.logger.warn(
        `rate limit reset failed for "${key}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private bucketKey(key: string): string {
    return `rl:${key}`;
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

import { withDeadline } from './deadline';
import { REDIS_CACHE } from './redis.constants';

/**
 * A cache read that fails is a cache miss, never a request failure. Every
 * method here swallows Redis errors and falls through to the source — the
 * cache is an optimisation, and an optimisation that can take the site down is
 * a liability.
 *
 * Every call is also bounded by `withDeadline`, which is what makes that true when
 * Redis is *unreachable* rather than merely erroring: ioredis would otherwise spend
 * ~17 s on its retry budget before rejecting, so the call would not fail, it would
 * hang — and three of those on one authenticated request exceeds the request timeout.
 * A slow miss is still a miss. See `deadline.ts`.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CACHE) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await withDeadline(this.redis.get(key));
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (error) {
      this.miss('get', key, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number, tags: string[] = []): Promise<void> {
    try {
      const payload = JSON.stringify(value);
      if (tags.length === 0) {
        await withDeadline(this.redis.set(key, payload, 'EX', ttlSeconds));
        return;
      }
      // Tag sets outlive their entries slightly; `invalidateTag` tolerates keys
      // that have already expired, so the drift is harmless.
      const pipeline = this.redis.multi().set(key, payload, 'EX', ttlSeconds);
      for (const tag of tags) {
        pipeline.sadd(this.tagKey(tag), key).expire(this.tagKey(tag), ttlSeconds + 60);
      }
      await withDeadline(pipeline.exec());
    } catch (error) {
      this.miss('set', key, error);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await withDeadline(this.redis.del(...keys));
    } catch (error) {
      this.miss('del', keys.join(','), error);
    }
  }

  /**
   * Read-through with a stampede lock.
   *
   * Without the lock, a popular key expiring at lunchtime sends every in-flight
   * request to the database at once — the cache stops protecting the thing it
   * exists to protect at exactly the moment it matters. The losers of the lock
   * compute the value themselves rather than waiting, so a slow producer costs
   * duplicated work rather than a stalled request.
   */
  async wrap<T>(
    key: string,
    ttlSeconds: number,
    produce: () => Promise<T>,
    tags: string[] = [],
  ): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;

    const lockKey = `lock:${key}`;
    let holdsLock = false;
    try {
      holdsLock = (await withDeadline(this.redis.set(lockKey, '1', 'EX', 30, 'NX'))) === 'OK';
    } catch (error) {
      this.miss('lock', key, error);
    }

    const value = await produce();
    if (holdsLock) {
      await this.set(key, value, ttlSeconds, tags);
      await this.del(lockKey);
    }
    return value;
  }

  /**
   * Invalidation by tag is what makes caching the public read path safe: the
   * mutation that edits a vendor drops `vendor:ven_x` without needing to know
   * which twelve query results embedded it (D5 §Performance).
   */
  async invalidateTag(tag: string): Promise<void> {
    try {
      const key = this.tagKey(tag);
      const members = await withDeadline(this.redis.smembers(key));
      if (members.length) await withDeadline(this.redis.del(...members));
      await withDeadline(this.redis.del(key));
    } catch (error) {
      this.miss('invalidateTag', tag, error);
    }
  }

  async ping(): Promise<void> {
    await this.redis.ping();
  }

  private tagKey(tag: string): string {
    return `tag:${tag}`;
  }

  private miss(operation: string, key: string, error: unknown): void {
    this.logger.warn(
      `cache ${operation} failed for "${key}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

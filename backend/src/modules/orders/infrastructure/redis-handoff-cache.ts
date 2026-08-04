import { Injectable } from '@nestjs/common';

import { CacheService } from '../../../infrastructure/redis';
import type { HandoffCachePort } from '../domain';

const key = (orderId: string) => `order:handoff:${orderId}`;

/**
 * The readable copy of the hand-off code, in Redis.
 *
 * Deliberately the only place a live code exists in plaintext: `orders.otpHash` holds a
 * SHA-256 and nothing else, so this is a display convenience with an expiry rather than a
 * store of record. Losing it costs the customer's tracker its four digits; the rider's
 * verify path compares against the hash and keeps working.
 *
 * A TTL of zero would mean "never expires" in Redis, which is the wrong direction for
 * this of all values, so the caller's hours are converted to seconds and clamped to at
 * least one before they reach `set`.
 */
@Injectable()
export class RedisHandoffCache implements HandoffCachePort {
  constructor(private readonly cache: CacheService) {}

  async remember(orderId: string, code: string, ttlSeconds: number): Promise<void> {
    await this.cache.set(key(orderId), code, Math.max(1, Math.floor(ttlSeconds)));
  }

  async recall(orderId: string): Promise<string | null> {
    return (await this.cache.get<string>(key(orderId))) ?? null;
  }

  async forget(orderId: string): Promise<void> {
    await this.cache.del(key(orderId));
  }
}

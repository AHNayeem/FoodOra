import { Injectable } from '@nestjs/common';

import { CacheService } from '../../../infrastructure/redis';
import type { AuthorizationCachePort, ResolvedAuthorization } from '../domain';

/** Five minutes: long enough to matter under load, short enough that a missed
 * invalidation self-heals rather than persisting until a deploy. */
const TTL_SECONDS = 300;

@Injectable()
export class RedisAuthorizationCache implements AuthorizationCachePort {
  constructor(private readonly cache: CacheService) {}

  async read(userId: string): Promise<ResolvedAuthorization | null> {
    return this.cache.get<ResolvedAuthorization>(key(userId));
  }

  async write(userId: string, value: ResolvedAuthorization): Promise<void> {
    await this.cache.set(key(userId), value, TTL_SECONDS);
  }

  async invalidate(userId: string): Promise<void> {
    await this.cache.del(key(userId));
  }
}

/**
 * One key per user, with no epoch in it — so invalidation is a single `DEL`
 * rather than a `SCAN` for a pattern, which is the operation that quietly gets
 * expensive on a busy instance.
 */
function key(userId: string): string {
  return `perm:${userId}`;
}

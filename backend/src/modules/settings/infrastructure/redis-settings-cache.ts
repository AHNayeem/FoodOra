import { Injectable } from '@nestjs/common';

import { CacheService } from '../../../infrastructure/redis';
import type { SettingRecord, SettingsCachePort } from '../domain';

const KEY = 'settings:rows';

/**
 * Ten minutes — shorter than reference data's hour and longer than authorization's five.
 *
 * Same reasoning as elsewhere: the TTL is the blast radius of a *missed* invalidation,
 * not a freshness policy. A stale setting is more consequential than a stale country
 * (it can be a cancellation window or a minimum order value) and less than a stale
 * permission, and it is written by an admin who wants to see the effect straight away —
 * which the explicit `invalidate()` on write already gives them.
 */
const TTL_SECONDS = 600;

@Injectable()
export class RedisSettingsCache implements SettingsCachePort {
  constructor(private readonly cache: CacheService) {}

  /**
   * `updatedAt` is revived, because a cache round trip is `JSON.stringify` followed by
   * `JSON.parse` and a `Date` does not survive it — it comes back as an ISO *string* that
   * satisfies the TypeScript type and then fails at the GraphQL scalar. The bug only
   * appears on a cache *hit*, which is exactly the path that works in development and
   * breaks under load.
   */
  async read(): Promise<SettingRecord[] | null> {
    const rows = await this.cache.get<SettingRecord[]>(KEY);
    return rows?.map((row) => ({ ...row, updatedAt: new Date(row.updatedAt) })) ?? null;
  }

  async write(rows: readonly SettingRecord[]): Promise<void> {
    await this.cache.set(KEY, rows, TTL_SECONDS);
  }

  async invalidate(): Promise<void> {
    await this.cache.del(KEY);
  }
}

import { Injectable } from '@nestjs/common';

import { CacheService } from '../../../infrastructure/redis';
import type { RegionsCachePort, RegionSnapshot } from '../domain';

/** One key, one entry: the whole active catalogue. */
const KEY = 'regions:snapshot';

/**
 * An hour, which is much longer than the five minutes used for authorization — and the
 * asymmetry is the interesting part.
 *
 * The TTL on a cache with explicit invalidation is not a freshness policy, it is the
 * blast radius of a *missed* invalidation. For permissions, a stale grant is a security
 * problem, so five minutes. Here the writer is a human on an admin screen who will see
 * the change reflected immediately (the write invalidates), and the only way the entry
 * goes stale is a Redis error during that `del` — after which an hour of a country
 * showing as active is a cosmetic problem. Paying for that with twelve times the
 * database load would be the wrong trade.
 */
const TTL_SECONDS = 3_600;

@Injectable()
export class RedisRegionsCache implements RegionsCachePort {
  constructor(private readonly cache: CacheService) {}

  async read(): Promise<RegionSnapshot | null> {
    return this.cache.get<RegionSnapshot>(KEY);
  }

  async write(snapshot: RegionSnapshot): Promise<void> {
    await this.cache.set(KEY, snapshot, TTL_SECONDS);
  }

  async invalidate(): Promise<void> {
    await this.cache.del(KEY);
  }
}

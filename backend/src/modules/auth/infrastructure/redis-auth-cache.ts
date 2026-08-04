import { Inject, Injectable } from '@nestjs/common';

import { jwtConfig, type JwtConfig } from '../../../config';
import { CacheService } from '../../../infrastructure/redis';
import type { AuthCachePort, RotationReplay } from '../domain';

/**
 * Five minutes on the epoch. It is not a correctness window — a stale epoch is
 * *deleted* on a password change, not waited out — it is a bound on how long a
 * missed delete could linger.
 */
const EPOCH_TTL_SECONDS = 300;

@Injectable()
export class RedisAuthCache implements AuthCachePort {
  constructor(
    private readonly cache: CacheService,
    @Inject(jwtConfig.KEY) private readonly config: JwtConfig,
  ) {}

  async readEpoch(userId: string): Promise<number | null> {
    return this.cache.get<number>(`epoch:${userId}`);
  }

  async writeEpoch(userId: string, epoch: number): Promise<void> {
    await this.cache.set(`epoch:${userId}`, epoch, EPOCH_TTL_SECONDS);
  }

  async forgetEpoch(userId: string): Promise<void> {
    await this.cache.del(`epoch:${userId}`);
  }

  /**
   * The mark lives exactly as long as an access token could — after that the token
   * is expired on its own terms and there is nothing left to revoke, so letting the
   * key go is not a lapse.
   */
  async markSessionRevoked(sessionId: string): Promise<void> {
    await this.cache.set(`revoked:${sessionId}`, 1, this.config.accessTtlSeconds);
  }

  async isSessionRevoked(sessionId: string): Promise<boolean> {
    return (await this.cache.get<number>(`revoked:${sessionId}`)) !== null;
  }

  /**
   * Keyed by the **hash** of the spent token, never the token itself, so the key
   * space here is no more sensitive than `refresh_tokens.token_hash` already is.
   */
  async rememberRotation(spentTokenHash: string, replay: RotationReplay): Promise<void> {
    await this.cache.set(
      `rotate:${spentTokenHash}`,
      replay,
      Math.max(1, Math.ceil(this.config.refreshReplayWindowMs / 1_000)),
    );
  }

  async recallRotation(spentTokenHash: string): Promise<RotationReplay | null> {
    return this.cache.get<RotationReplay>(`rotate:${spentTokenHash}`);
  }
}

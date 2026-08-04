import { Inject, Injectable } from '@nestjs/common';
import { type HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import type Redis from 'ioredis';

import { appConfig, type AppConfig } from '../../config';
import { REDIS_CACHE, REDIS_PUBSUB, REDIS_QUEUE } from '../../infrastructure/redis';
import { describeFailure } from '../describe-failure';

/**
 * All three connections, reported separately.
 *
 * They are separate logical databases with different eviction policies, so they
 * fail independently: the cache can be full and evicting while the queue is
 * perfectly healthy, and "Redis is up" would hide that.
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly health: HealthIndicatorService,
    @Inject(REDIS_CACHE) private readonly cache: Redis,
    @Inject(REDIS_QUEUE) private readonly queue: Redis,
    @Inject(REDIS_PUBSUB) private readonly pubsub: Redis,
    @Inject(appConfig.KEY) private readonly app: AppConfig,
  ) {}

  check(key = 'redis-cache'): Promise<HealthIndicatorResult> {
    return this.ping(key, this.cache);
  }

  async checkAll(): Promise<HealthIndicatorResult> {
    const results = await Promise.all([
      this.ping('redis-cache', this.cache),
      this.ping('redis-queue', this.queue),
      this.ping('redis-pubsub', this.pubsub),
    ]);
    const merged: HealthIndicatorResult = {};
    for (const result of results) Object.assign(merged, result);
    return merged;
  }

  private async ping(key: string, client: Redis): Promise<HealthIndicatorResult> {
    const indicator = this.health.check(key);
    const startedAt = Date.now();
    try {
      await client.ping();
      return indicator.up({ latencyMs: Date.now() - startedAt, state: client.status });
    } catch (error) {
      return indicator.down({
        state: client.status,
        message: describeFailure(error, this.app.isProduction),
      });
    }
  }
}

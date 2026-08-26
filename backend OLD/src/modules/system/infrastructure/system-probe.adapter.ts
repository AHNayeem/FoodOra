import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';

import { PrismaService } from '../../../infrastructure/prisma';
import { REDIS_CACHE } from '../../../infrastructure/redis';
import {
  type DependencyState,
  type SystemProbePort,
} from '../domain/ports/system-probe.port';

/** The adapter — the only file in this module that knows Prisma and Redis exist. */
@Injectable()
export class SystemProbeAdapter implements SystemProbePort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CACHE) private readonly cache: Redis,
  ) {}

  async probeDependencies(): Promise<DependencyState[]> {
    // In parallel: a status page that takes the sum of its checks is a status
    // page nobody waits for.
    return Promise.all([
      timed('database', () => this.prisma.ping()),
      timed('redis-cache', async () => {
        await this.cache.ping();
      }),
    ]);
  }
}

async function timed(name: string, check: () => Promise<void>): Promise<DependencyState> {
  const startedAt = Date.now();
  try {
    await check();
    return { name, status: 'up', latencyMs: Date.now() - startedAt };
  } catch {
    return { name, status: 'down', latencyMs: null };
  }
}

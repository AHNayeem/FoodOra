import { Inject, Injectable } from '@nestjs/common';
import { type HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';

import { appConfig, type AppConfig } from '../../config';
import { PrismaService } from '../../infrastructure/prisma';
import { describeFailure } from '../describe-failure';

@Injectable()
export class PrismaHealthIndicator {
  constructor(
    private readonly health: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @Inject(appConfig.KEY) private readonly app: AppConfig,
  ) {}

  /**
   * `SELECT 1` through the pool, not a cached flag — a connection that died
   * quietly still reports "connected" until something tries to use it.
   */
  async check(key = 'database'): Promise<HealthIndicatorResult> {
    const indicator = this.health.check(key);
    const startedAt = Date.now();
    try {
      await this.prisma.ping();
      return indicator.up({ latencyMs: Date.now() - startedAt });
    } catch (error) {
      return indicator.down({
        latencyMs: Date.now() - startedAt,
        message: describeFailure(error, this.app.isProduction),
      });
    }
  }

  /**
   * Schema readiness, which is a different question from connectivity: a pod
   * running new code against an un-migrated database will fail on its first
   * real query, and it should refuse traffic before that rather than after.
   *
   * Migrations are applied by a pre-deploy Job, never by the pods themselves
   * (D10 §CI/CD) — so a pending migration here means the rollout started early,
   * and withholding traffic is exactly the right response.
   */
  async checkMigrations(key = 'migrations'): Promise<HealthIndicatorResult> {
    const indicator = this.health.check(key);
    try {
      const rows = await this.prisma.$queryRaw<
        { applied: bigint; pending: bigint; failed: bigint }[]
      >`
        SELECT
          count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied,
          count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)     AS pending,
          count(*) FILTER (WHERE rolled_back_at IS NOT NULL)                         AS failed
        FROM _prisma_migrations
      `;

      const row = rows[0];
      const applied = Number(row?.applied ?? 0);
      const pending = Number(row?.pending ?? 0);
      const failed = Number(row?.failed ?? 0);
      const detail = { applied, pending, failed };

      if (applied === 0) {
        return indicator.down({ ...detail, message: 'no migrations have been applied' });
      }
      if (pending > 0 || failed > 0) {
        return indicator.down({ ...detail, message: 'migrations are pending or rolled back' });
      }
      return indicator.up(detail);
    } catch (error) {
      // The table itself is missing — `prisma migrate deploy` has never run here.
      return indicator.down({
        message:
          error instanceof Error && error.message.includes('_prisma_migrations')
            ? 'the migrations table does not exist; run prisma migrate deploy'
            : 'could not read migration state',
      });
    }
  }
}

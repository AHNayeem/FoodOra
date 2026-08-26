import { Controller, Get, Inject, UseFilters } from '@nestjs/common';
import { HealthCheck, HealthCheckService, type HealthCheckResult } from '@nestjs/terminus';

import { Public } from '../common/decorators';
import { appConfig, type AppConfig } from '../config';
import { HealthResponseFilter } from './health-response.filter';
import { PrismaHealthIndicator } from './indicators/prisma.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { StorageHealthIndicator } from './indicators/storage.health';

/**
 * Three probes, three different questions (D10 §Health checks).
 *
 * The distinction is the whole point. Liveness answers "is this process
 * wedged?" and must therefore touch **nothing** — if a database blip failed
 * liveness, every pod in the fleet would restart at once, turning a two-second
 * failover into an outage. Readiness answers "should traffic come here?" and is
 * allowed to say no while the process stays up. Deep is for monitoring, and is
 * never wired to an orchestrator.
 */
/**
 * `@Public()` at the class level, because E2 made authentication the default: a
 * Kubernetes probe presents no bearer token, and an orchestrator that gets a 401 from
 * `/health/live` restarts every pod in the fleet.
 */
@Controller('health')
@Public()
@UseFilters(HealthResponseFilter)
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly storage: StorageHealthIndicator,
    @Inject(appConfig.KEY) private readonly app: AppConfig,
  ) {}

  /** Liveness. No dependencies, by design. */
  @Get('live')
  live(): { status: string; service: string; version: string; uptimeSeconds: number } {
    return {
      status: 'ok',
      service: this.app.name,
      version: this.app.version,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  /**
   * Readiness: can this pod serve a request correctly *right now*?
   *
   * Postgres, Redis and the migration state — the three things whose absence
   * makes a correct response impossible. Storage and the payment gateways are
   * excluded on purpose: their failure degrades a feature, not the service.
   */
  @Get('ready')
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prisma.check(),
      () => this.prisma.checkMigrations(),
      () => this.redis.check(),
    ]);
  }

  /**
   * Everything, including the optional dependencies. For monitoring and for a
   * human debugging an incident — never for a probe, because it is slow and its
   * failures are not reasons to stop serving traffic.
   */
  @Get('deep')
  @HealthCheck()
  deep(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prisma.check(),
      () => this.prisma.checkMigrations(),
      () => this.redis.checkAll(),
      () => this.storage.check(),
    ]);
  }
}

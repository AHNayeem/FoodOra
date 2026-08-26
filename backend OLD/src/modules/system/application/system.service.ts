import { Inject, Injectable } from '@nestjs/common';

import { appConfig, type AppConfig } from '../../../config';
import { CLOCK, type Clock } from '../../../shared/kernel';
import type { ServiceStatus } from '../../../shared/enums';
import {
  type DependencyState,
  SYSTEM_PROBE,
  type SystemProbePort,
} from '../domain/ports/system-probe.port';

export interface ApiStatus {
  name: string;
  version: string;
  environment: string;
  status: ServiceStatus;
  serverTime: Date;
  uptimeSeconds: number;
  dependencies: DependencyState[];
  defaults: { countryCode: string; currency: string; locale: string; timezone: string };
}

/**
 * Depends on the **port**, not on Prisma or Redis — which is what lets a unit
 * test hand it a fake probe and assert the aggregation rule without a database.
 */
@Injectable()
export class SystemService {
  constructor(
    @Inject(SYSTEM_PROBE) private readonly probe: SystemProbePort,
    @Inject(appConfig.KEY) private readonly app: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async status(): Promise<ApiStatus> {
    const dependencies = await this.probe.probeDependencies();

    return {
      name: this.app.name,
      version: this.app.version,
      environment: this.app.env,
      status: aggregate(dependencies),
      serverTime: this.clock.date(),
      uptimeSeconds: Math.round(process.uptime()),
      dependencies,
      defaults: this.app.defaults,
    };
  }
}

/**
 * Postgres down is `down`; anything else down is `degraded`.
 *
 * The distinction is the product's, not the infrastructure's: without the
 * database nothing can be answered, whereas a cold cache or a stalled queue
 * makes the API slower and some things later, not wrong.
 */
function aggregate(dependencies: DependencyState[]): ServiceStatus {
  if (dependencies.some((d) => d.name === 'database' && d.status === 'down')) return 'down';
  if (dependencies.some((d) => d.status !== 'up')) return 'degraded';
  return 'up';
}

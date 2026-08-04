import { Inject, Injectable } from '@nestjs/common';
import { type HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';

import { appConfig, type AppConfig, storageConfig, type StorageConfig } from '../../config';
import { describeFailure } from '../describe-failure';

/**
 * Object storage reachability, for `/health/deep` only.
 *
 * Deliberately **not** part of readiness: uploads being unavailable should not
 * take the ordering API out of the load balancer. A probe that couples every
 * dependency to traffic admission turns a degraded feature into an outage.
 *
 * The full `StoragePort` adapter arrives in E4; until then this checks that the
 * endpoint answers, which is the only claim E1 can honestly make.
 */
@Injectable()
export class StorageHealthIndicator {
  constructor(
    private readonly health: HealthIndicatorService,
    @Inject(storageConfig.KEY) private readonly config: StorageConfig,
    @Inject(appConfig.KEY) private readonly app: AppConfig,
  ) {}

  async check(key = 'storage'): Promise<HealthIndicatorResult> {
    const indicator = this.health.check(key);

    if (!this.config.configured) {
      // Production cannot reach here — `validation.schema.ts` refuses to boot
      // without S3 credentials. Locally it just means MinIO has not been set up.
      return indicator.up({ configured: false, note: 'no credentials; skipped' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(`${this.config.endpoint}/minio/health/live`, {
        method: 'GET',
        signal: controller.signal,
      });
      // Any answer at all proves the endpoint is up; a 404 means it is S3 rather
      // than MinIO, which is fine.
      return indicator.up({ configured: true, httpStatus: response.status });
    } catch (error) {
      return indicator.down({
        configured: true,
        message: describeFailure(error, this.app.isProduction),
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { CLOCK, SystemClock } from '../shared/kernel';
import { RequestContextMiddleware, RequestContextService } from './context';
import { LoaderRegistry } from './dataloader';
import { IdService } from './ids';

/**
 * The cross-cutting layer: framework-aware, domain-free, and available
 * everywhere without an import (D1 §common).
 *
 * `Clock` is provided by token rather than by class so a test can swap in
 * `FakeClock` and drive derived state — expired coupons, completed sittings,
 * a subscription's pause self-expiring — without waiting for real time.
 */
@Global()
@Module({
  providers: [
    RequestContextService,
    IdService,
    LoaderRegistry,
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [RequestContextService, IdService, LoaderRegistry, CLOCK],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Everything, including /graphql and /health: an error in a probe is still
    // worth a requestId.
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}

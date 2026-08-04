import { Module } from '@nestjs/common';

import { SystemService } from './application/system.service';
import { SYSTEM_PROBE } from './domain/ports/system-probe.port';
import { SystemProbeAdapter } from './infrastructure/system-probe.adapter';
import { SystemResolver } from './presentation/system.resolver';

/**
 * Wiring is by **token**, never by concrete class (D1 §The dependency rule):
 * `SystemService` asks for `SYSTEM_PROBE` and this module decides that a
 * Prisma-and-Redis adapter satisfies it. Swapping the adapter — for a fake in a
 * test, for a different store later — touches this one line.
 */
@Module({
  providers: [
    SystemService,
    SystemResolver,
    { provide: SYSTEM_PROBE, useClass: SystemProbeAdapter },
  ],
  exports: [SystemService],
})
export class SystemModule {}

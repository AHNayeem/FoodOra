import { Global, Inject, Logger, Module, type OnModuleInit } from '@nestjs/common';

import { routingConfig, type RoutingConfig } from '../../config';
import { ROUTING_PROVIDER } from '../../shared/contracts';
import { HaversineRoutingProvider } from './haversine-routing.provider';

/**
 * Binds `ROUTING_PROVIDER` to whichever implementation the environment selected.
 *
 * Global because more than one module needs distance and none of them should have to
 * import a provider: the catalog needs it for a listing label today, and delivery will
 * need it for fares and rider ETAs. Both get the same instance, which is what makes
 * "we switched to OSRM" a one-line environment change rather than an audit.
 *
 * The factory refuses to substitute haversine for an unimplemented provider. That
 * refusal is the point of the file: a deployment that sets `ROUTING_PROVIDER=google`
 * has decided that straight-line distance is not good enough for what it is about to
 * charge people, and quietly giving it straight-line distance anyway would be worse
 * than not booting.
 */
@Global()
@Module({
  providers: [
    HaversineRoutingProvider,
    {
      provide: ROUTING_PROVIDER,
      inject: [routingConfig.KEY, HaversineRoutingProvider],
      useFactory: (config: RoutingConfig, haversine: HaversineRoutingProvider) => {
        if (config.provider === 'haversine') return haversine;
        throw new Error(
          `ROUTING_PROVIDER="${config.provider}" is declared in the environment contract ` +
            `but not implemented yet — only "haversine" is. Implement it behind ` +
            `RoutingProviderPort (shared/contracts/routing.contract.ts) and register it here. ` +
            `Falling back to haversine silently is refused: a routed distance and a ` +
            `great-circle distance differ by a factor of three in a river delta, and a ` +
            `delivery fare would be built on the difference.`,
        );
      },
    },
  ],
  exports: [ROUTING_PROVIDER],
})
export class RoutingModule implements OnModuleInit {
  private readonly logger = new Logger(RoutingModule.name);

  constructor(@Inject(routingConfig.KEY) private readonly config: RoutingConfig) {}

  /**
   * One line at boot naming the provider in force. Distance is invisible in a response
   * — it arrives as a plausible number whatever produced it — so the log is the only
   * place the answer to "which one was running when this fare was computed" exists.
   */
  onModuleInit(): void {
    this.logger.log(
      `Routing provider: ${this.config.provider}` +
        (this.config.provider === 'haversine'
          ? ' (great-circle distance — a label, not a delivery distance)'
          : ''),
    );
  }
}

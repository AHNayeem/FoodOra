import { Query, Resolver } from '@nestjs/graphql';

import { Public } from '../../../common/decorators';
import { DateTimeScalar } from '../../../common/scalars';
import { SystemService } from '../application/system.service';
import { ApiStatus } from './models/api-status.model';

/**
 * Thin, as a resolver should be: no branching, no data access, no rules. It
 * validates (nothing to validate here), authorizes (public), delegates, and
 * maps. Everything interesting happens a layer down.
 *
 * `@Public()` at the class level is what "authorizes (public)" now means in code: E2
 * registered a global `JwtAuthGuard`, so a status page that anyone can read has to say
 * so out loud.
 */
@Resolver(() => ApiStatus)
@Public()
export class SystemResolver {
  constructor(private readonly system: SystemService) {}

  @Query(() => ApiStatus, {
    name: 'apiStatus',
    description: 'What this API is, and whether its dependencies are reachable.',
  })
  apiStatus(): Promise<ApiStatus> {
    return this.system.status();
  }

  /**
   * The server's clock, which is the one every derived value is computed
   * against — coupon expiry, reservation completion, a subscription's pause
   * expiring. A client that renders "expires in 3 hours" from its own clock
   * will disagree with the server on a device with the wrong time.
   */
  @Query(() => DateTimeScalar, { name: 'serverTime' })
  async serverTime(): Promise<Date> {
    return (await this.system.status()).serverTime;
  }
}

import { Field, Int, ObjectType } from '@nestjs/graphql';

import { DateTimeScalar } from '../../../../common/scalars';
import { ServiceStatusScalar } from '../../../../graphql/scalars.registry';
import type { ServiceStatus } from '../../../../shared/enums';

@ObjectType({ description: 'One external system the API depends on.' })
export class DependencyStatus {
  @Field(() => String)
  name!: string;

  @Field(() => ServiceStatusScalar)
  status!: ServiceStatus;

  @Field(() => Int, { nullable: true, description: 'Round-trip time of the probe.' })
  latencyMs!: number | null;
}

@ObjectType({ description: 'The regional fallbacks applied when a request carries no hint.' })
export class RegionDefaults {
  @Field(() => String) countryCode!: string;
  @Field(() => String) currency!: string;
  @Field(() => String) locale!: string;
  @Field(() => String) timezone!: string;
}

/**
 * E1's only query.
 *
 * It exists so the GraphQL layer is *demonstrably* wired rather than
 * theoretically wired: resolving it exercises the custom scalars, the enum
 * scalar factory, the request context, the ports-and-adapters layering and the
 * error path, all before a single business module is written.
 */
@ObjectType({ description: 'What this API is, and whether it can serve.' })
export class ApiStatus {
  @Field(() => String) name!: string;
  @Field(() => String) version!: string;
  @Field(() => String) environment!: string;

  @Field(() => ServiceStatusScalar, {
    description: 'down when Postgres is unreachable; degraded when anything else is.',
  })
  status!: ServiceStatus;

  @Field(() => DateTimeScalar, { description: 'Server time in UTC — the clock every derived value is computed against.' })
  serverTime!: Date;

  @Field(() => Int) uptimeSeconds!: number;

  @Field(() => [DependencyStatus])
  dependencies!: DependencyStatus[];

  @Field(() => RegionDefaults)
  defaults!: RegionDefaults;
}

import { DateTimeScalar } from './date-time.scalar';
import { JSONObjectScalar } from './json.scalar';
import { MoneyScalar } from './money.scalar';

export { createEnumScalar } from './enum-scalar.factory';
export { DateTimeScalar } from './date-time.scalar';
export { JSONObjectScalar } from './json.scalar';
export { MoneyScalar } from './money.scalar';

/**
 * Registered with the driver so a `@Field(() => DateTimeScalar)` anywhere in the
 * schema resolves. Domain vocabularies (~40 of them) are minted per module by
 * `createEnumScalar` and registered the same way, as each module lands.
 */
export const baseScalars = {
  DateTime: DateTimeScalar,
  Money: MoneyScalar,
  JSONObject: JSONObjectScalar,
} as const;

import { Field, InputType } from '@nestjs/graphql';
import { z } from 'zod';

import { JSONObjectScalar } from '../../../../common/scalars';
import { SettingScopeScalar } from '../../../../graphql';
import { SETTING_SCOPES, type SettingScope } from '../../../../shared/enums';

/**
 * Writing a setting.
 *
 * The value arrives wrapped — `{ value: 15 }` — for the same reason it is returned
 * wrapped: GraphQL cannot type "a string or a number or a boolean or an object", and the
 * two alternatives are four nullable fields or a stringly-typed payload. Zod checks that
 * the wrapper is present and that its `value` key exists; whether the value matches the
 * key's declared type is `SettingsService`'s call, because only the catalogue knows.
 */
// The class is `…InputType` only because `WriteSettingInput` is already the application
// service's input interface; the schema gets the name that belongs to it.
@InputType('WriteSettingInput', { description: 'Set a setting at one scope.' })
export class WriteSettingInputType {
  @Field(() => String, { description: 'A key from the catalogue. Anything else is refused.' })
  key!: string;

  @Field(() => SettingScopeScalar, { defaultValue: 'platform' })
  scope!: SettingScope;

  @Field(() => String, {
    nullable: true,
    description: 'Country code for `country`, vendor id for `vendor`. Must be null for `platform`.',
  })
  scopeId?: string | null;

  @Field(() => JSONObjectScalar, { description: 'Wrapped: `{ "value": 15 }`.' })
  value!: Record<string, unknown>;
}

export const WriteSettingSchema = z.object({
  key: z.string().trim().min(1).max(120),
  scope: z.enum(SETTING_SCOPES),
  scopeId: z.string().trim().min(1).max(40).nullish(),
  // `unknown()` rather than a shape: `{ value: null }` is meaningful input to reject with
  // `settings.errors.invalidValue`, and a Zod refusal here would report it as a malformed
  // request instead of as a value the key does not accept.
  value: z.object({ value: z.unknown() }),
});

@InputType({ description: 'Remove an override so the key falls back to the layer above.' })
export class ClearSettingInput {
  @Field(() => String) key!: string;
  @Field(() => SettingScopeScalar, { defaultValue: 'platform' }) scope!: SettingScope;
  @Field(() => String, { nullable: true }) scopeId?: string | null;
}

export const ClearSettingSchema = z.object({
  key: z.string().trim().min(1).max(120),
  scope: z.enum(SETTING_SCOPES),
  scopeId: z.string().trim().min(1).max(40).nullish(),
});

@InputType({ description: 'Which scope to resolve settings for. All fields optional.' })
export class SettingScopeInput {
  @Field(() => String, { nullable: true }) countryCode?: string | null;
  @Field(() => String, { nullable: true }) vendorId?: string | null;
}

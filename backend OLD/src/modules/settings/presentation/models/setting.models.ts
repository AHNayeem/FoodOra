import { Field, ObjectType } from '@nestjs/graphql';

import { DateTimeScalar, JSONObjectScalar } from '../../../../common/scalars';
import { payloadOf, SettingScopeScalar, SettingValueTypeScalar } from '../../../../graphql';
import type { SettingScope, SettingValueType } from '../../../../shared/enums';

/**
 * A resolved setting: the value in force, and where it came from.
 *
 * `scope` + `isDefault` together are what make an admin screen honest. A vendor's
 * settings page shows thirty fields; without provenance every one of them looks like a
 * local override, "reset to default" has nothing to mean, and an operator changing a
 * platform value cannot tell which vendors have opted out of it.
 */
@ObjectType('Setting', { description: 'A setting resolved for a scope, with its provenance.' })
export class SettingModel {
  @Field(() => String, { description: 'Dotted key, e.g. "orders.cancelWindowMinutes".' })
  key!: string;

  @Field(() => SettingValueTypeScalar) valueType!: SettingValueType;

  /**
   * The value, always wrapped in an object as `{ value: … }`.
   *
   * GraphQL has no union of scalars, so the alternatives were four nullable fields
   * (`stringValue`, `numberValue`, …) that a client has to switch over, or a `String`
   * carrying JSON that every client has to parse. Wrapping in the `JSONObject` scalar
   * keeps a boolean a boolean and a number a number, and `valueType` says which to
   * expect — the client reads `value.value`, once, in the generated hook.
   */
  @Field(() => JSONObjectScalar, { description: 'Wrapped as `{ value: … }`. Read `valueType` first.' })
  value!: Record<string, unknown>;

  @Field(() => SettingScopeScalar, { description: 'Which layer answered.' })
  scope!: SettingScope;

  @Field(() => Boolean, { description: 'True when no row exists and the catalogue answered.' })
  isDefault!: boolean;

  @Field(() => Boolean, { description: 'False for operator-only keys, which `publicSettings` omits.' })
  isPublic!: boolean;

  @Field(() => String, { nullable: true }) description!: string | null;
}

/** A row that actually exists — the admin's "what has been overridden, where" view. */
@ObjectType('SettingOverride', { description: 'A configured row, as written.' })
export class SettingOverrideModel {
  @Field(() => String) id!: string;
  @Field(() => String) key!: string;
  @Field(() => SettingScopeScalar) scope!: SettingScope;

  @Field(() => String, { nullable: true, description: 'Country code or vendor id, per `scope`.' })
  scopeId!: string | null;

  @Field(() => SettingValueTypeScalar) valueType!: SettingValueType;
  @Field(() => JSONObjectScalar) value!: Record<string, unknown>;
  @Field(() => DateTimeScalar) updatedAt!: Date;
  @Field(() => String, { nullable: true }) updatedBy!: string | null;
}

/**
 * A declared key with no value attached — what the admin screen renders its form from
 * before anything has been configured.
 */
@ObjectType('SettingDefinition', { description: 'A key the platform declares, from the catalogue.' })
export class SettingDefinitionModel {
  @Field(() => String) key!: string;
  @Field(() => SettingValueTypeScalar) valueType!: SettingValueType;
  @Field(() => JSONObjectScalar, { description: 'Wrapped as `{ value: … }`.' })
  defaultValue!: Record<string, unknown>;
  @Field(() => Boolean) isPublic!: boolean;

  @Field(() => [SettingScopeScalar], { description: 'Scopes this key may be overridden at.' })
  scopes!: SettingScope[];

  @Field(() => String) description!: string;
}

export const SettingPayload = payloadOf(SettingModel, 'SettingPayload');

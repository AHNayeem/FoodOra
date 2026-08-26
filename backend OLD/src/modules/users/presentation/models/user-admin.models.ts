import { Field, ObjectType } from '@nestjs/graphql';

import { DateTimeScalar } from '../../../../common/scalars';
import { Paginated } from '../../../../common/pagination';
import { NotificationTopicScalar, payloadOf, User } from '../../../../graphql';
import type { NotificationTopic } from '../../../../shared/enums';

/**
 * `UserPage` — the offset-paginated directory, in the exact shape
 * `frontend/services/http.ts::Paginated<T>` already has: `{ items, total, page, pageSize,
 * hasMore }`. Minted by the same factory every other list will use, so thirty modules do not
 * each hand-write those five fields.
 */
export const UserPage = Paginated(User);

/**
 * Fields an administrator sees that a customer's own `me` does not.
 *
 * A separate type rather than more fields on `User`, because `User` *is*
 * `frontend/types/user.ts::User` and adding `lastLoginAt` to it would put an operational field
 * on the type every component consumes. This one composes: the account, plus what the directory
 * needs to be useful.
 */
@ObjectType('UserAdminView', { description: 'An account with the operational fields an admin needs.' })
export class UserAdminView {
  @Field(() => User) user!: User;

  @Field(() => DateTimeScalar, { nullable: true }) lastLoginAt!: Date | null;
  @Field(() => DateTimeScalar, { nullable: true }) emailVerifiedAt!: Date | null;
  @Field(() => DateTimeScalar, { nullable: true }) phoneVerifiedAt!: Date | null;

  @Field(() => String, { nullable: true, description: 'IANA zone; falls back to the country’s.' })
  timezone!: string | null;

  @Field(() => Boolean, { description: 'Marketing consent, distinct from the per-topic matrix.' })
  marketingOptIn!: boolean;
}

// --- customer settings ------------------------------------------------------

@ObjectType('NotificationChannels', { description: 'Which channels a topic may use.' })
export class NotificationChannelsModel {
  @Field(() => Boolean) email!: boolean;
  @Field(() => Boolean) push!: boolean;
  @Field(() => Boolean) sms!: boolean;
}

/**
 * The matrix as a **list**, not as a map.
 *
 * The frontend holds it as `Record<NotificationTopic, NotificationChannels>`, which GraphQL
 * cannot express — a map with a closed key set is an object type with five hard-coded fields,
 * and adding a sixth topic would then be a schema change plus a client regeneration. A list
 * keyed by `topic` costs the service one `Object.fromEntries` on the way in and survives new
 * topics without either.
 */
@ObjectType('NotificationPreference', { description: 'One topic’s channels.' })
export class NotificationPreferenceModel {
  @Field(() => NotificationTopicScalar) topic!: NotificationTopic;
  @Field(() => NotificationChannelsModel) channels!: NotificationChannelsModel;

  @Field(() => [String], {
    description:
      'Channels that cannot be switched off for this topic, because they carry the transactional record of an order. The UI renders these locked; the server forces them on regardless.',
  })
  requiredChannels!: string[];
}

@ObjectType('PrivacySettings')
export class PrivacySettingsModel {
  @Field(() => Boolean) personalizedRecommendations!: boolean;
  @Field(() => Boolean) shareOrderActivity!: boolean;
  @Field(() => Boolean) saveSearchHistory!: boolean;
}

@ObjectType('SecuritySettings')
export class SecuritySettingsModel {
  @Field(() => Boolean) loginAlerts!: boolean;

  @Field(() => Boolean, {
    description:
      'Second factor on sign-in. Stored and returned; **not yet enforced** — the mfa_pending token is unbuilt (E2 §Not built).',
  })
  twoFactor!: boolean;
}

@ObjectType('CustomerSettings', { description: 'frontend/types/settings.ts::CustomerSettings.' })
export class CustomerSettingsModel {
  @Field(() => [NotificationPreferenceModel]) notifications!: NotificationPreferenceModel[];
  @Field(() => PrivacySettingsModel) privacy!: PrivacySettingsModel;
  @Field(() => SecuritySettingsModel) security!: SecuritySettingsModel;
}

export const UserPayload = payloadOf(User, 'UserPayload');
export const UserAdminPayload = payloadOf(UserAdminView, 'UserAdminPayload');
export const CustomerSettingsPayload = payloadOf(CustomerSettingsModel, 'CustomerSettingsPayload');

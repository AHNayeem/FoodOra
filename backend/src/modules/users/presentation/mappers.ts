import { User } from '../../../graphql';
import {
  isRequiredChannel,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TOPICS,
} from '../../../shared/enums';
import type { CustomerSettings, SettingsPatch, UserProfile } from '../domain';
import type { CustomerSettingsModel, UserAdminView } from './models/user-admin.models';
import type { NotificationPatchInput } from './inputs/user.inputs';

/**
 * Domain ↔ wire. Kept in one file rather than inline in the resolvers, because both resolvers
 * map the same shapes and a duplicated mapper is how two views of one account start disagreeing
 * about what `isVerified` means.
 */

/**
 * `UserProfile` → the frontend's `User`.
 *
 * `permissions` is passed in rather than read from the profile, because it is *resolved* — role
 * grants ∪ direct grants − direct denials — and the resolved set lives on the request context
 * for the actor, or has to be resolved explicitly for anybody else. Making it a parameter means
 * a caller cannot accidentally serve an empty array as though it were an answer.
 */
export function toUserModel(profile: UserProfile, permissions: readonly string[]): User {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    avatar: profile.avatar,
    role: profile.primaryRole,
    permissions: [...permissions],
    status: profile.status,
    countryCode: profile.countryCode,
    currency: profile.currency,
    locale: profile.locale,
    isVerified: profile.isVerified,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    deletedAt: profile.deletedAt,
  };
}

export function toAdminView(profile: UserProfile, permissions: readonly string[]): UserAdminView {
  return {
    user: toUserModel(profile, permissions),
    lastLoginAt: profile.lastLoginAt,
    emailVerifiedAt: profile.emailVerifiedAt,
    phoneVerifiedAt: profile.phoneVerifiedAt,
    timezone: profile.timezone,
    marketingOptIn: profile.marketingOptIn,
  };
}

/**
 * The notification matrix, map → list.
 *
 * `requiredChannels` travels with each topic so the UI can render the locked controls from the
 * server's answer rather than from its own copy of the rule. `frontend/services/settings.ts`
 * exports `REQUIRED_NOTIFICATIONS` today, and that constant can go away once the page reads
 * this — one fewer place for the rule to drift.
 */
export function toSettingsModel(settings: CustomerSettings): CustomerSettingsModel {
  return {
    notifications: NOTIFICATION_TOPICS.map((topic) => ({
      topic,
      channels: settings.notifications[topic],
      requiredChannels: NOTIFICATION_CHANNELS.filter((channel) =>
        isRequiredChannel(topic, channel),
      ),
    })),
    privacy: settings.privacy,
    security: settings.security,
  };
}

/** The list → map direction, for a patch on the way in. */
export function toSettingsPatch(input: {
  notifications?: NotificationPatchInput[];
  privacy?: SettingsPatch['privacy'];
  security?: SettingsPatch['security'];
}): SettingsPatch {
  return {
    notifications: input.notifications
      ? Object.fromEntries(input.notifications.map((entry) => [entry.topic, entry.channels]))
      : undefined,
    privacy: input.privacy,
    security: input.security,
  };
}

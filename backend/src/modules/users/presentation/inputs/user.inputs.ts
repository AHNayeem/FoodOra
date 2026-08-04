import { Field, InputType } from '@nestjs/graphql';
import { z } from 'zod';

import { NotificationTopicScalar, UserRoleScalar, UserStatusScalar } from '../../../../graphql';
import {
  NOTIFICATION_TOPICS,
  type NotificationTopic,
  USER_ROLES,
  type UserRole,
  USER_STATUSES,
  type UserStatus,
} from '../../../../shared/enums';
import { UserError } from '../../domain';

/**
 * Inputs for the account and directory surfaces.
 *
 * The phone rule is lenient on shape and copied from E2's registration schema deliberately: a
 * real number's format depends on the country, and a regex strict enough to be useful in
 * Bangladesh rejects valid numbers in Germany. What matters is the length cap and that it
 * contains only plausible characters.
 */

const phone = z
  .string()
  .trim()
  .min(6, UserError.invalidPhone)
  .max(24)
  .regex(/^\+?[\d\s()-]+$/, UserError.invalidPhone);

const localeCode = z
  .string()
  .trim()
  .max(8)
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, UserError.unknownLocale);

const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, UserError.unknownCurrency);

// --- profile ----------------------------------------------------------------

@InputType({ description: 'Edit your own profile. frontend/services/account.ts::ProfilePatch.' })
export class ProfilePatchInput {
  @Field(() => String, { nullable: true }) name?: string;

  @Field(() => String, {
    nullable: true,
    description: 'Changing it clears the phone verification — a new number has not been proved.',
  })
  phone?: string | null;

  @Field(() => String, { nullable: true }) avatar?: string;
  @Field(() => String, { nullable: true, description: 'BCP-47. Must be an active language.' })
  locale?: string;
  @Field(() => String, { nullable: true, description: 'ISO 4217. Must be an active currency.' })
  currency?: string;
  @Field(() => String, { nullable: true, description: 'IANA zone.' }) timezone?: string | null;
  @Field(() => Boolean, { nullable: true }) marketingOptIn?: boolean;
}

export const ProfilePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: phone.nullish(),
  avatar: z.string().trim().max(500).optional(),
  locale: localeCode.optional(),
  currency: currencyCode.optional(),
  timezone: z.string().trim().max(64).nullish(),
  marketingOptIn: z.boolean().optional(),
});

@InputType({ description: 'Edit another account’s profile. Requires users:write.' })
export class AdminProfilePatchInput extends ProfilePatchInput {
  @Field(() => String) userId!: string;

  @Field(() => String, { nullable: true, description: 'Must be an active country.' })
  countryCode?: string;
}

export const AdminProfilePatchSchema = ProfilePatchSchema.extend({
  userId: z.string().trim().min(1).max(40),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, UserError.unknownCountry)
    .optional(),
});

// --- settings ---------------------------------------------------------------

@InputType({ description: 'A partial channel update for one topic. Omitted channels are left alone.' })
export class NotificationChannelsPatchInput {
  @Field(() => Boolean, { nullable: true }) email?: boolean;
  @Field(() => Boolean, { nullable: true }) push?: boolean;
  @Field(() => Boolean, { nullable: true }) sms?: boolean;
}

@InputType({ description: 'One topic’s channels.' })
export class NotificationPatchInput {
  @Field(() => NotificationTopicScalar) topic!: NotificationTopic;
  @Field(() => NotificationChannelsPatchInput) channels!: NotificationChannelsPatchInput;
}

@InputType()
export class PrivacyPatchInput {
  @Field(() => Boolean, { nullable: true }) personalizedRecommendations?: boolean;
  @Field(() => Boolean, { nullable: true }) shareOrderActivity?: boolean;
  @Field(() => Boolean, { nullable: true }) saveSearchHistory?: boolean;
}

@InputType()
export class SecurityPatchInput {
  @Field(() => Boolean, { nullable: true }) loginAlerts?: boolean;
  @Field(() => Boolean, { nullable: true }) twoFactor?: boolean;
}

/**
 * A settings write is a **patch**, and every branch is optional.
 *
 * The settings page saves one toggle at a time. A whole-object replacement would let two tabs
 * silently undo each other — the second save carrying a stale copy of everything the first one
 * changed — which is the kind of bug that looks like the server randomly reverting things.
 */
@InputType({ description: 'Partial settings update. Every branch optional.' })
export class SettingsPatchInput {
  @Field(() => [NotificationPatchInput], { nullable: true })
  notifications?: NotificationPatchInput[];

  @Field(() => PrivacyPatchInput, { nullable: true }) privacy?: PrivacyPatchInput;
  @Field(() => SecurityPatchInput, { nullable: true }) security?: SecurityPatchInput;
}

export const SettingsPatchSchema = z.object({
  notifications: z
    .array(
      z.object({
        topic: z.enum(NOTIFICATION_TOPICS),
        channels: z.object({
          email: z.boolean().optional(),
          push: z.boolean().optional(),
          sms: z.boolean().optional(),
        }),
      }),
    )
    .max(NOTIFICATION_TOPICS.length)
    .optional(),
  privacy: z
    .object({
      personalizedRecommendations: z.boolean().optional(),
      shareOrderActivity: z.boolean().optional(),
      saveSearchHistory: z.boolean().optional(),
    })
    .optional(),
  security: z
    .object({ loginAlerts: z.boolean().optional(), twoFactor: z.boolean().optional() })
    .optional(),
});

// --- directory --------------------------------------------------------------

@InputType({ description: 'Narrow the user directory. Every field optional.' })
export class UserFilterInput {
  @Field(() => String, { nullable: true, description: 'Matched against name, email and phone.' })
  q?: string;

  @Field(() => UserRoleScalar, { nullable: true }) role?: UserRole;
  @Field(() => UserStatusScalar, { nullable: true }) status?: UserStatus;
  @Field(() => String, { nullable: true }) countryCode?: string;
  @Field(() => Boolean, { nullable: true }) isVerified?: boolean;

  @Field(() => Boolean, {
    nullable: true,
    defaultValue: false,
    description: 'Include closed accounts. Off by default — a tombstone is not a user.',
  })
  includeDeleted?: boolean;
}

export const UserFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  countryCode: z.string().trim().toUpperCase().length(2).optional(),
  isVerified: z.boolean().optional(),
  includeDeleted: z.boolean().optional(),
});

@InputType({ description: 'Suspend, ban or reinstate an account.' })
export class SetUserStatusInput {
  @Field(() => String) userId!: string;
  @Field(() => UserStatusScalar) status!: UserStatus;
}

export const SetUserStatusSchema = z.object({
  userId: z.string().trim().min(1).max(40),
  status: z.enum(USER_STATUSES),
});

@InputType({ description: 'Change an account’s primary role.' })
export class SetPrimaryRoleInput {
  @Field(() => String) userId!: string;

  @Field(() => UserRoleScalar, {
    description: 'Must be strictly below your own highest rank, and so must the account’s current one.',
  })
  role!: UserRole;
}

export const SetPrimaryRoleSchema = z.object({
  userId: z.string().trim().min(1).max(40),
  role: z.enum(USER_ROLES),
});

@InputType({ description: 'Close your own account.' })
export class CloseAccountInput {
  @Field(() => String, {
    nullable: true,
    defaultValue: '',
    description: 'Optional. Logged for support, not stored on the account.',
  })
  reason?: string;
}

export const CloseAccountSchema = z.object({ reason: z.string().trim().max(500).optional() });

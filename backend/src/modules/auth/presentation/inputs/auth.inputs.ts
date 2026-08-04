import { Field, InputType } from '@nestjs/graphql';
import { z } from 'zod';

import { DevicePlatformScalar, OtpChannelScalar, OtpPurposeScalar, UserRoleScalar } from '../../../../graphql';
import {
  DEVICE_PLATFORMS,
  type DevicePlatform,
  OTP_CHANNELS,
  type OtpChannel,
  OTP_PURPOSES,
  type OtpPurpose,
  SELF_SERVICE_ROLES,
  type SelfServiceRole,
} from '../../../../shared/enums';

/**
 * Inputs, and the Zod schema that validates each one.
 *
 * Two declarations of one shape, deliberately: the class is what GraphQL needs to
 * *type* the argument, the schema is what actually *checks* it. GraphQL will confirm
 * that `email` is a String; only Zod will refuse `"nope"`.
 *
 * Every message is an **i18n key**, and the keys are the ones the Phase C forms
 * already render — `errors.emailInvalid`, `errors.passwordShort` — so a validation
 * failure lands on the right field in the right language with no server-side
 * knowledge of which language that is (D5 §Validation).
 */

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'errors.emailRequired')
  .max(191)
  .email('errors.emailInvalid');

/**
 * Eight characters, matching `errors.passwordShort` and the Phase C form.
 *
 * No composition rules — no "one uppercase, one digit, one symbol". NIST dropped
 * them because they push people towards `Password1!`, which is shorter in real entropy
 * than three ordinary words. Length is the requirement that survives contact with
 * human beings; the 200-character cap exists only so nobody can post a megabyte for
 * Argon2 to chew on.
 */
const password = z.string().min(8, 'errors.passwordShort').max(200);

/** Lenient on shape, because a real number's shape depends on the country. */
const phone = z
  .string()
  .trim()
  .min(6, 'errors.phoneInvalid')
  .max(24)
  .regex(/^\+?[\d\s()-]+$/, 'errors.phoneInvalid');

const deviceSchema = z
  .object({
    installId: z.string().trim().min(1).max(120).optional(),
    platform: z.enum(DEVICE_PLATFORMS).optional(),
    name: z.string().trim().max(120).optional(),
    model: z.string().trim().max(120).optional(),
    appVersion: z.string().trim().max(24).optional(),
    pushToken: z.string().trim().max(400).optional(),
  })
  .optional();

/**
 * What the client knows about itself. Entirely optional — a `curl` request has none of
 * it, and a sign-in must not require a client to describe itself before it is allowed
 * to happen.
 */
@InputType({ description: 'Optional client description. Identifies a device for the security screen and for push.' })
export class DeviceInput {
  @Field(() => String, {
    nullable: true,
    description: 'Stable client-generated installation id. Without it the device is not recorded.',
  })
  installId?: string;

  @Field(() => DevicePlatformScalar, { nullable: true }) platform?: DevicePlatform;
  @Field(() => String, { nullable: true }) name?: string;
  @Field(() => String, { nullable: true }) model?: string;
  @Field(() => String, { nullable: true }) appVersion?: string;
  @Field(() => String, { nullable: true, description: 'FCM registration token, if push was granted.' })
  pushToken?: string;
}

@InputType()
export class LoginInput {
  @Field(() => String) email!: string;
  @Field(() => String) password!: string;

  @Field(() => Boolean, {
    defaultValue: false,
    description: 'Extends the refresh family from 7 days to 30. Nothing else.',
  })
  rememberMe!: boolean;

  @Field(() => DeviceInput, { nullable: true }) device?: DeviceInput;
}

export const LoginSchema = z.object({
  email,
  // No `min(8)` here: an existing account may predate a rule change, and refusing to
  // even *check* a short password would lock its owner out over a policy they never
  // agreed to. Length is a registration rule, not a sign-in rule.
  password: z.string().min(1, 'errors.passwordRequired').max(200),
  rememberMe: z.boolean().default(false),
  device: deviceSchema,
});

@InputType()
export class RegisterInput {
  @Field(() => String) name!: string;
  @Field(() => String) email!: string;
  @Field(() => String, { nullable: true }) phone?: string;
  @Field(() => String) password!: string;

  @Field(() => UserRoleScalar, {
    description: `Self-service only: ${SELF_SERVICE_ROLES.join(' | ')}. Every other role is granted, never claimed.`,
  })
  role!: SelfServiceRole;

  @Field(() => Boolean, { defaultValue: false }) marketingOptIn!: boolean;
  @Field(() => DeviceInput, { nullable: true }) device?: DeviceInput;
}

export const RegisterSchema = z.object({
  name: z.string().trim().min(1, 'errors.nameRequired').max(120),
  email,
  phone: phone.optional(),
  password,
  // The gate, in the schema as well as in the service. A request naming
  // `super-admin` fails here as `BAD_USER_INPUT` and never reaches the handler.
  role: z.enum(SELF_SERVICE_ROLES),
  marketingOptIn: z.boolean().default(false),
  device: deviceSchema,
});

@InputType()
export class RequestOtpInput {
  @Field(() => String, { description: 'Phone in E.164, or an email address, per `channel`.' })
  destination!: string;

  @Field(() => OtpChannelScalar, { defaultValue: 'sms' }) channel!: OtpChannel;
  @Field(() => OtpPurposeScalar, { defaultValue: 'login' }) purpose!: OtpPurpose;
}

export const RequestOtpSchema = z.object({
  destination: z.string().trim().min(3).max(191),
  channel: z.enum(OTP_CHANNELS).default('sms'),
  purpose: z.enum(OTP_PURPOSES).default('login'),
});

@InputType()
export class VerifyOtpInput {
  @Field(() => String) destination!: string;
  @Field(() => String) code!: string;
  @Field(() => OtpChannelScalar, { defaultValue: 'sms' }) channel!: OtpChannel;
  @Field(() => OtpPurposeScalar, { defaultValue: 'login' }) purpose!: OtpPurpose;
  @Field(() => DeviceInput, { nullable: true }) device?: DeviceInput;
}

export const VerifyOtpSchema = z.object({
  destination: z.string().trim().min(3).max(191),
  // Digits only, and exactly the issued length — a code with a letter in it is not a
  // near miss worth spending an attempt on.
  code: z.string().trim().regex(/^\d{4,8}$/, 'errors.invalidOtp'),
  channel: z.enum(OTP_CHANNELS).default('sms'),
  purpose: z.enum(OTP_PURPOSES).default('login'),
  device: deviceSchema,
});

@InputType()
export class ChangePasswordInput {
  @Field(() => String) currentPassword!: string;
  @Field(() => String) newPassword!: string;
}

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'errors.passwordRequired').max(200),
    newPassword: password,
  })
  // Checked here as well as in the service: catching it in the form saves an Argon2
  // verification, and the service still checks because it is the one that knows what
  // the *stored* password is.
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'errors.samePassword',
    path: ['newPassword'],
  });

@InputType()
export class ResetPasswordInput {
  @Field(() => String, { description: 'The single-use token from the reset link.' })
  token!: string;

  @Field(() => String) newPassword!: string;
}

export const ResetPasswordSchema = z.object({
  token: z.string().trim().min(20).max(200),
  newPassword: password,
});

import type {
  DevicePlatform,
  OtpChannel,
  OtpPurpose,
  SessionRevokeReason,
  UserRole,
  UserStatus,
} from '../../../shared/enums';

/**
 * The identity records, as the domain sees them — plain data, no Prisma types,
 * no `Decimal`, no client enums. The repositories map; nothing above them knows
 * that `restaurant-owner` is stored as `RESTAURANT_OWNER`.
 */

/**
 * `frontend/types/user.ts::User` plus the fields the frontend never sees.
 *
 * `isVerified` is a stored column rather than a derived one, and that is a
 * deliberate exception to "derived state is never stored": it is the frontend's
 * existing contract (Phase C reads `user.isVerified`), and it is maintained in
 * the same write that sets `emailVerifiedAt` / `phoneVerifiedAt`, so the two
 * cannot drift.
 */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string;
  /** Backs the frontend's single-valued `User.role`. */
  primaryRole: UserRole;
  status: UserStatus;
  countryCode: string;
  currency: string;
  locale: string;
  timezone: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  isVerified: boolean;
  lastLoginAt: Date | null;
  marketingOptIn: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * The value stored in `Credential.passwordHash` for an account that has no
 * password — one created through phone OTP, or one whose token epoch had to be
 * bumped before it ever had a credential row.
 *
 * A sentinel rather than a nullable column, because `Credential` exists to answer
 * "what is this account's token epoch?" as well as "what is its password hash?",
 * and the epoch has to be storable for an account that has neither. It is
 * deliberately not a valid Argon2 encoding, and `Argon2Hasher.verify` refuses
 * anything that does not start with `$argon2`, so no input can ever match it.
 * (Django's `!` prefix, for the same reason.)
 */
export const UNUSABLE_PASSWORD_HASH = '!';

/**
 * Password material, split off `User` so a `SELECT *` on the account table
 * cannot leak a hash.
 *
 * `tokenEpoch` is the kill switch: bumping it invalidates every access token
 * ever minted for this user, inside the request that bumps it.
 */
export interface CredentialRecord {
  userId: string;
  passwordHash: string;
  algorithm: string;
  tokenEpoch: number;
  failedCount: number;
  lockedUntil: Date | null;
  changedAt: Date;
}

export interface NewAccount {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  primaryRole: UserRole;
  status: UserStatus;
  countryCode: string;
  currency: string;
  locale: string;
  timezone: string | null;
  /** Absent for a phone-first account, which has no password at all. */
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  marketingOptIn: boolean;
  /** Id for the `UserRoleAssignment` that mirrors `primaryRole`. */
  roleAssignmentId: string;
}

export interface DeviceRecord {
  id: string;
  userId: string;
  installId: string;
  platform: DevicePlatform;
  name: string | null;
  lastSeenAt: Date;
  /** Whether this `(userId, installId)` pair had ever been seen before this call. */
  isNew: boolean;
}

/** What a client tells us about itself. Every field optional — a curl request has none. */
export interface DeviceHint {
  installId?: string;
  platform?: DevicePlatform;
  name?: string;
  model?: string;
  appVersion?: string;
  pushToken?: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  deviceId: string | null;
  rememberMe: boolean;
  ip: string | null;
  userAgent: string | null;
  location: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: SessionRevokeReason | null;
  /** Joined from `Device`, for the account's security screen. */
  devicePlatform: DevicePlatform | null;
  deviceName: string | null;
}

export interface NewSession {
  id: string;
  userId: string;
  deviceId: string | null;
  rememberMe: boolean;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * One link in a rotation chain. Only the SHA-256 of the token is stored, so a
 * database dump does not hand over live sessions.
 */
export interface RefreshTokenRecord {
  id: string;
  sessionId: string;
  tokenHash: string;
  parentId: string | null;
  issuedAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

export interface NewRefreshToken {
  id: string;
  sessionId: string;
  tokenHash: string;
  parentId: string | null;
  issuedAt: Date;
  expiresAt: Date;
  ip: string | null;
}

export interface OtpChallengeRecord {
  id: string;
  userId: string | null;
  purpose: OtpPurpose;
  channel: OtpChannel;
  destination: string;
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  consumedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface NewOtpChallenge {
  id: string;
  userId: string | null;
  purpose: OtpPurpose;
  channel: OtpChannel;
  destination: string;
  codeHash: string;
  maxAttempts: number;
  expiresAt: Date;
  ip: string | null;
  createdAt: Date;
}

export interface PasswordResetRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface NewPasswordReset {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ip: string | null;
  createdAt: Date;
}

/**
 * Append-only, and it records attempts on accounts that **do not exist** — which
 * is most of what a credential-stuffing run looks like, and therefore the rows
 * that make it visible.
 */
export interface NewLoginAttempt {
  id: string;
  /** Email or phone as typed. */
  identifier: string;
  userId: string | null;
  /** `password`, `otp`, `refresh`, `social`. */
  method: string;
  success: boolean;
  /** The i18n key it failed with, or null on success. */
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
  at: Date;
}

/** What a successful sign-in hands back. */
export interface IssuedTokens {
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  /** The opaque secret. Stored only as a hash; this is the only time it exists. */
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface SignedIn {
  user: AuthUser;
  /** Resolved slugs, so the frontend's `User.permissions` needs no second call. */
  permissions: readonly string[];
  tokens: IssuedTokens;
}

/**
 * `auth`'s published surface — a sibling module may import this and nothing else.
 *
 * In practice a sibling wants two things from here: nothing at all (authorization
 * arrives on the request context, put there by a guard), or `AuthUser` to hang a
 * profile off. That is the shape a well-drawn boundary has.
 */
export { AuthError, type AuthErrorKey, ENUMERATION_SAFE_LOGIN_ERROR } from './auth-errors';
export type {
  AuthUser,
  CredentialRecord,
  DeviceHint,
  DeviceRecord,
  IssuedTokens,
  NewAccount,
  NewLoginAttempt,
  NewOtpChallenge,
  NewPasswordReset,
  NewRefreshToken,
  NewSession,
  OtpChallengeRecord,
  PasswordResetRecord,
  RefreshTokenRecord,
  SessionRecord,
  SignedIn,
} from './models';
export { UNUSABLE_PASSWORD_HASH } from './models';
export {
  isLocked,
  LOCKOUT_STEPS,
  type LockoutStep,
  lockUntil,
  unlockInSeconds,
} from './policies/lockout.policy';
export {
  type ChallengeVerdict,
  inspectChallenge,
  normaliseEmail,
  normalisePhone,
  OTP_CODE_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  resendAfterSeconds,
} from './policies/otp.policy';
export { AUTH_RATE_LIMITS, type RateLimitRule } from './policies/rate-limits';
export { AUTH_CACHE, type AuthCachePort, type RotationReplay } from './ports/auth-cache.port';
export {
  CHALLENGE_REPOSITORY,
  type ChallengeRepositoryPort,
} from './ports/challenge.repository.port';
export {
  type JsonWebKey,
  PASSWORD_HASHER,
  type PasswordHasherPort,
  SECRET_GENERATOR,
  type SecretGeneratorPort,
  TOKEN_SIGNER,
  type TokenSignerPort,
} from './ports/crypto.ports';
export {
  IDENTITY_REPOSITORY,
  type IdentityRepositoryPort,
} from './ports/identity.repository.port';
export {
  AUTH_AUDIT,
  type AuthAuditEvent,
  type AuthAuditPort,
  OTP_SENDER,
  type OtpMessage,
  type OtpSenderPort,
} from './ports/notifier.ports';
export {
  SESSION_REPOSITORY,
  type SessionRepositoryPort,
} from './ports/session.repository.port';

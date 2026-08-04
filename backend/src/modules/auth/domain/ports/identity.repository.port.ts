import type { SessionRevokeReason } from '../../../../shared/enums';
import type {
  AuthUser,
  CredentialRecord,
  DeviceHint,
  DeviceRecord,
  NewAccount,
} from '../models';

export const IDENTITY_REPOSITORY = Symbol('IDENTITY_REPOSITORY');

/**
 * Everything about *who* — the account, its password material, its devices.
 *
 * Three tables behind one port because they are one concern with one lifetime: an
 * account's credential and its device list are meaningless without it and are
 * cascade-deleted with it. Splitting them into three ports would produce three
 * adapters that only ever get injected together.
 *
 * No method here opens a transaction. The application handler declares the
 * boundary and these enlist through `AsyncLocalStorage` (D1 §Transactions).
 */
export interface IdentityRepositoryPort {
  findById(userId: string): Promise<AuthUser | null>;
  /** Case-insensitive — `email` is `citext`, so this needs no `lower()`. */
  findByEmail(email: string): Promise<AuthUser | null>;
  findByPhone(phone: string): Promise<AuthUser | null>;

  /**
   * Existence checks for the registration form. Separate from `findByEmail`
   * because they must see **soft-deleted** rows too: the unique index still
   * covers a tombstoned account, so "available" has to mean available to the
   * database, not merely absent from the active set.
   */
  emailTaken(email: string): Promise<boolean>;
  phoneTaken(phone: string): Promise<boolean>;

  /**
   * The account, its credential, its settings row and the `UserRoleAssignment`
   * mirroring `primaryRole` — one atomic act, because an account that exists
   * without the role behind it is an account that can sign in and do nothing.
   */
  createAccount(input: NewAccount): Promise<AuthUser>;

  findCredential(userId: string): Promise<CredentialRecord | null>;

  /** Returns the new consecutive-failure count, which decides the lockout step. */
  incrementFailedCount(userId: string): Promise<number>;
  applyLock(userId: string, lockedUntil: Date | null): Promise<void>;
  /** A correct password forgives everything before it. */
  clearFailures(userId: string): Promise<void>;

  /**
   * Replaces the hash **and bumps `tokenEpoch`**, in one statement. Two
   * statements would leave a window in which the old password was gone and the
   * old tokens were still live. Returns the new epoch.
   */
  setPassword(userId: string, passwordHash: string, algorithm: string): Promise<number>;

  /**
   * Replaces the hash **without** touching the epoch — for a transparent upgrade
   * when the Argon2 parameters have been raised since the account last signed in.
   *
   * Deliberately separate from `setPassword`: re-hashing the same password is not a
   * credential change, and bumping the epoch for it would silently sign the user
   * out of every other device because an operator tuned a cost parameter.
   */
  rehashPassword(userId: string, passwordHash: string, algorithm: string): Promise<void>;

  /**
   * Bumps the epoch alone — "sign out everywhere" without touching the password.
   * Creates the credential row if the account has none, so a phone-only account
   * can still be forcibly signed out.
   */
  bumpTokenEpoch(userId: string): Promise<number>;

  /** `0` for an account that has never had a password. */
  currentTokenEpoch(userId: string): Promise<number>;

  recordLogin(userId: string, at: Date): Promise<void>;
  markEmailVerified(userId: string, at: Date): Promise<void>;
  markPhoneVerified(userId: string, at: Date): Promise<void>;

  /**
   * Upserts on `(userId, installId)` and reports whether the pair is new — which
   * is the signal behind `loginAlerts`, and the reason the check is on a
   * client-generated install id rather than on a user-agent string. Comparing
   * user agents would fire on every browser update.
   *
   * `null` when the client sent no `installId`; a device we cannot identify is not
   * a device, and inventing an id per request would fill the table with one-offs.
   */
  upsertDevice(userId: string, hint: DeviceHint, at: Date): Promise<DeviceRecord | null>;

  revokeDevice(userId: string, deviceId: string, reason: SessionRevokeReason, at: Date): Promise<boolean>;
}

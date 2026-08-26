import type { OtpPurpose } from '../../../../shared/enums';
import type {
  NewLoginAttempt,
  NewOtpChallenge,
  NewPasswordReset,
  OtpChallengeRecord,
  PasswordResetRecord,
} from '../models';

export const CHALLENGE_REPOSITORY = Symbol('CHALLENGE_REPOSITORY');

/**
 * Everything *in flight* — one-time codes, reset tokens, and the log of attempts
 * against both.
 *
 * All three are short-lived, append-mostly, and hashed at rest. Grouping them
 * keeps the retention story in one place: these are the tables a cleanup job
 * prunes, and none of them is ever read by a feature module.
 */
export interface ChallengeRepositoryPort {
  createOtpChallenge(input: NewOtpChallenge): Promise<OtpChallengeRecord>;

  /**
   * The newest challenge for this destination and purpose, used or not.
   *
   * "Used or not" matters: the resend cooldown has to count from the last code
   * *issued*, otherwise consuming a code immediately buys a free extra send.
   */
  findLatestOtpChallenge(
    destination: string,
    purpose: OtpPurpose,
  ): Promise<OtpChallengeRecord | null>;

  /**
   * Records one wrong guess. Returns the new attempt count so the caller can tell
   * "wrong code" from "that was your last try".
   */
  recordOtpAttempt(challengeId: string): Promise<number>;

  /**
   * Marks it used. `false` if it already was — a conditional update, so a code
   * cannot be redeemed twice by two simultaneous requests.
   */
  consumeOtpChallenge(challengeId: string, at: Date): Promise<boolean>;

  createPasswordReset(input: NewPasswordReset): Promise<PasswordResetRecord>;
  findPasswordResetByHash(tokenHash: string): Promise<PasswordResetRecord | null>;
  /** Conditional, like the OTP: single-use means single-use under concurrency. */
  consumePasswordReset(resetId: string, at: Date): Promise<boolean>;
  /**
   * Invalidates every outstanding reset for a user. A successful sign-in does
   * this, so a reset link sitting in an inbox stops being a way in once the owner
   * proves they never needed it (D6 §Password reset).
   */
  invalidatePasswordResets(userId: string, at: Date): Promise<number>;

  recordLoginAttempt(input: NewLoginAttempt): Promise<void>;
}

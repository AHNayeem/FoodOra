import type { SessionRevokeReason } from '../../../../shared/enums';
import type {
  NewRefreshToken,
  NewSession,
  RefreshTokenRecord,
  SessionRecord,
} from '../models';

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

/**
 * Everything about *this sign-in* — the session and its refresh chain.
 *
 * The two belong together because rotation reads and writes both in one
 * transaction, and because the invariant that matters spans them: revoking a
 * session must revoke every token in its chain, or the chain outlives the thing it
 * was scoped to.
 */
export interface SessionRepositoryPort {
  createSession(input: NewSession): Promise<SessionRecord>;
  findSession(sessionId: string): Promise<SessionRecord | null>;

  /**
   * Live sessions for the account's security screen — not revoked and not past
   * `expiresAt`, judged against the passed `now` rather than by a sweep job.
   */
  listActiveSessions(userId: string, now: Date): Promise<SessionRecord[]>;

  touchSession(sessionId: string, at: Date): Promise<void>;

  /** `false` when the session is already gone or belongs to someone else. */
  revokeSession(
    sessionId: string,
    userId: string,
    reason: SessionRevokeReason,
    at: Date,
  ): Promise<boolean>;

  /**
   * Revokes every live session for the user, optionally sparing one — "sign out
   * my other devices". Returns the ids revoked, because each one needs a
   * short-lived Redis mark so `@FreshSession()` handlers see it immediately
   * rather than in fifteen minutes.
   */
  revokeUserSessions(
    userId: string,
    reason: SessionRevokeReason,
    at: Date,
    exceptSessionId?: string,
  ): Promise<string[]>;

  createRefreshToken(input: NewRefreshToken): Promise<RefreshTokenRecord>;
  /** The lookup is by SHA-256; the token itself is never stored. */
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;

  /**
   * Marks the token used — the write that makes a second presentation detectable
   * as theft rather than merely suspicious (D6 §Rotation).
   *
   * Returns `false` if it was **already** used, and that return value is the
   * whole point: as a conditional update (`WHERE used_at IS NULL`) the check and
   * the claim are one atomic step, so two simultaneous refreshes cannot both
   * believe they won.
   */
  markRefreshTokenUsed(tokenId: string, at: Date): Promise<boolean>;

  /** Kills the whole chain — used on logout and on reuse detection. */
  revokeSessionTokens(sessionId: string, at: Date): Promise<number>;
}

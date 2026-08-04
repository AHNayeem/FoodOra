export const AUTH_CACHE = Symbol('AUTH_CACHE');

/** What a replayed refresh gets handed back. See `AuthCachePort.rememberRotation`. */
export interface RotationReplay {
  refreshToken: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
}

/**
 * The short-lived authentication state that belongs in Redis rather than Postgres.
 *
 * Three distinct jobs, one port, because all three have the same property: losing
 * them costs correctness in a *recoverable* direction. A lost epoch reads through
 * to the database; a lost revocation mark falls back to the 15-minute token
 * lifetime; a lost rotation replay turns one racing tab into one re-login. Nothing
 * here is the security boundary — those are Postgres columns.
 */
export interface AuthCachePort {
  /**
   * The authorization epoch, read on every authenticated request.
   *
   * Deliberately **deleted** on a password change rather than left to expire —
   * that delete is what makes "changing your password signs out every other
   * device" true within the same request instead of within five minutes.
   */
  readEpoch(userId: string): Promise<number | null>;
  writeEpoch(userId: string, epoch: number): Promise<void>;
  forgetEpoch(userId: string): Promise<void>;

  /**
   * Marks a session revoked for as long as an access token could still be alive.
   *
   * A revoked session is already gone from Postgres; this exists so a
   * `@FreshSession()` handler can see it without a database read, and it expires
   * on its own because after one access-token lifetime there is nothing left to
   * revoke.
   */
  markSessionRevoked(sessionId: string): Promise<void>;
  isSessionRevoked(sessionId: string): Promise<boolean>;

  /**
   * Remembers the outcome of a rotation against the token that was spent.
   *
   * Two tabs refreshing at the same moment both present the same valid refresh
   * token. One wins; without this, the other looks exactly like a stolen token
   * being replayed and would nuke a session belonging to a user who did nothing
   * wrong. So the winner's result is replayable for a few seconds — which is what
   * D6 means by "the loser waits and receives the winner's token".
   *
   * The window is short and the stored value is a token that is already live, so
   * this widens no attack surface: an attacker holding the old token needs to
   * present it inside that window *and* the legitimate client's new token is
   * already in the same Redis. What it buys is that reuse detection can stay
   * ruthless outside the window.
   */
  rememberRotation(spentTokenHash: string, replay: RotationReplay): Promise<void>;
  recallRotation(spentTokenHash: string): Promise<RotationReplay | null>;
}

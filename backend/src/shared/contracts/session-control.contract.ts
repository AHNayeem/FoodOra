import type { SessionRevokeReason } from '../enums';

export const SESSION_CONTROL = Symbol('SESSION_CONTROL');

/**
 * "End every session this account has."
 *
 * Three E3 operations need it and none of them is about authentication: suspending
 * an account, banning one, and closing one. A suspension that leaves the suspended
 * person signed in for another fifteen minutes is not a suspension, so this cannot
 * be left to token expiry.
 *
 * It is a contract rather than a direct call because `AuthModule` owns sessions and
 * the token epoch, and a module may not reach into another module's `application/`
 * layer. `UsersModule` asks for the *capability*; `AuthModule`'s `SessionService`
 * happens to be what satisfies it.
 *
 * Implementations must be **total**: bump the epoch (so stateless access tokens die
 * inside the current request rather than at expiry), revoke the session rows, and
 * drop the Redis marks. A partial revocation is worse than none, because it reads
 * as done.
 */
export interface SessionControlPort {
  /** Returns how many live sessions were ended. Safe to call for an account with none. */
  revokeAllSessions(userId: string, reason: SessionRevokeReason): Promise<number>;
}

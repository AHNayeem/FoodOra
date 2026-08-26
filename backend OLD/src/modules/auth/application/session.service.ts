import { Inject, Injectable } from '@nestjs/common';

import {
  type SessionControlPort,
  UNIT_OF_WORK,
  type UnitOfWorkPort,
} from '../../../shared/contracts';
import type { SessionRevokeReason } from '../../../shared/enums';
import { CLOCK, type Clock, fail, ok, type Result } from '../../../shared/kernel';
import {
  AUTH_AUDIT,
  AUTH_CACHE,
  type AuthAuditPort,
  type AuthCachePort,
  AuthError,
  IDENTITY_REPOSITORY,
  type IdentityRepositoryPort,
  SESSION_REPOSITORY,
  type SessionRecord,
  type SessionRepositoryPort,
} from '../domain';

/**
 * The account's security screen, and signing out.
 *
 * Every method here revokes in Postgres **and** marks in Redis, and the pairing is
 * the point: the row is the truth, and the mark is what makes the truth visible to
 * a stateless access token that has not expired yet. Doing only the first leaves a
 * signed-out session working for fifteen minutes; doing only the second loses the
 * revocation on a cache restart.
 *
 * E3 added `SessionControlPort` to the list of things this class is: the users module needs to
 * end every session when an account is suspended, banned or closed, and it may not reach into
 * this module's `application/` layer to do it. It asks for the *capability* — one method on a
 * token in `shared/contracts` — and this is what satisfies it.
 */
@Injectable()
export class SessionService implements SessionControlPort {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    @Inject(IDENTITY_REPOSITORY) private readonly identity: IdentityRepositoryPort,
    @Inject(AUTH_CACHE) private readonly cache: AuthCachePort,
    @Inject(AUTH_AUDIT) private readonly audit: AuthAuditPort,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWorkPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Live sessions, newest first — "signed in on iPhone, Dhaka, 2 minutes ago".
   *
   * Liveness is judged against the clock rather than by a sweep job, the same way
   * every other derived state on this platform is: nothing has to run for an
   * expired session to stop being listed.
   */
  listSessions(userId: string): Promise<SessionRecord[]> {
    return this.sessions.listActiveSessions(userId, this.clock.date());
  }

  /** Sign out. `allDevices` is the "it wasn't me" button. */
  async logout(
    userId: string,
    sessionId: string,
    allDevices: boolean,
  ): Promise<Result<{ revoked: number }>> {
    const now = this.clock.date();

    if (allDevices) {
      const revoked = await this.unitOfWork.runInTransaction(async () => {
        const ids = await this.sessions.revokeUserSessions(userId, 'logout', now);
        for (const id of ids) await this.sessions.revokeSessionTokens(id, now);
        return ids;
      });
      await Promise.all(revoked.map((id) => this.cache.markSessionRevoked(id)));
      await this.audit.record({
        action: 'auth.sessions.revokedAll',
        userId,
        details: { count: revoked.length },
      });
      return ok({ revoked: revoked.length });
    }

    const closed = await this.unitOfWork.runInTransaction(async () => {
      const done = await this.sessions.revokeSession(sessionId, userId, 'logout', now);
      if (done) await this.sessions.revokeSessionTokens(sessionId, now);
      return done;
    });

    // Idempotent on purpose: a client signing out twice, or signing out a session
    // that has already expired, has got what it wanted.
    if (closed) await this.cache.markSessionRevoked(sessionId);
    return ok({ revoked: closed ? 1 : 0 });
  }

  /**
   * `SESSION_CONTROL`: end every session this account has, whatever the reason.
   *
   * Three things, and all three are needed for the word "every" to be true:
   *
   * 1. **Revoke the rows**, so nothing lists or refreshes.
   * 2. **Mark each session in Redis**, so a `@FreshSession()` handler refuses immediately.
   * 3. **Bump the token epoch**, which is the part that matters and the part that is easy to
   *    forget. An access token is stateless and lives ~15 minutes; without an epoch bump, a
   *    suspended account keeps working for the rest of that window on every handler that is not
   *    marked `@FreshSession()` — which is most of them, deliberately, because paying a Redis read
   *    on every menu request is not a trade worth making. The epoch is what turns "revoked" into
   *    "revoked now" for a token nobody can recall.
   *
   * Total by construction, because a partial revocation is worse than none: it reads as done.
   */
  async revokeAllSessions(userId: string, reason: SessionRevokeReason): Promise<number> {
    const now = this.clock.date();

    const revoked = await this.unitOfWork.runInTransaction(async () => {
      const ids = await this.sessions.revokeUserSessions(userId, reason, now);
      for (const id of ids) await this.sessions.revokeSessionTokens(id, now);
      return ids;
    });

    await Promise.all(revoked.map((id) => this.cache.markSessionRevoked(id)));

    await this.identity.bumpTokenEpoch(userId);
    // `forget`, not `write`: deleting the entry forces the next request to read the bumped value
    // from Postgres, so the revocation is live inside this request rather than five minutes later
    // — the same reason `PasswordService.afterEpochBump` does it this way.
    await this.cache.forgetEpoch(userId);

    await this.audit.record({
      action: 'auth.sessions.revokedAll',
      userId,
      details: { count: revoked.length, reason },
    });

    return revoked.length;
  }

  /**
   * Revoke one *other* session from the security screen.
   *
   * Scoped by `userId` in the repository's `where`, not checked after the fact, so
   * passing somebody else's session id reads as "no such session" rather than as a
   * refusal that confirms it exists.
   */
  async revokeSession(
    userId: string,
    sessionId: string,
  ): Promise<Result<{ sessionId: string }>> {
    const now = this.clock.date();

    const done = await this.unitOfWork.runInTransaction(async () => {
      const revoked = await this.sessions.revokeSession(sessionId, userId, 'admin', now);
      if (revoked) await this.sessions.revokeSessionTokens(sessionId, now);
      return revoked;
    });

    if (!done) return fail(AuthError.sessionNotFound);
    await this.cache.markSessionRevoked(sessionId);
    return ok({ sessionId });
  }

  /**
   * Forget a device: revokes its sessions and clears its push registration, since
   * `Device` is deliberately one row for both facts (D6 §Session and device
   * management).
   */
  async revokeDevice(userId: string, deviceId: string): Promise<Result<{ deviceId: string }>> {
    const now = this.clock.date();

    const removed = await this.unitOfWork.runInTransaction(() =>
      this.identity.revokeDevice(userId, deviceId, 'device-removed', now),
    );
    if (!removed) return fail(AuthError.sessionNotFound);

    // Its sessions go with it — a device you no longer trust must not keep a live
    // session just because nobody signed out on it.
    const sessions = await this.sessions.listActiveSessions(userId, now);
    const affected = sessions.filter((session) => session.deviceId === deviceId);
    await this.unitOfWork.runInTransaction(async () => {
      for (const session of affected) {
        await this.sessions.revokeSession(session.id, userId, 'device-removed', now);
        await this.sessions.revokeSessionTokens(session.id, now);
      }
    });
    await Promise.all(affected.map((session) => this.cache.markSessionRevoked(session.id)));

    return ok({ deviceId });
  }
}

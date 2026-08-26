import { Inject, Injectable, Logger } from '@nestjs/common';

import { SESSION_CONTROL, type SessionControlPort } from '../../../shared/contracts';
import type { UserRole, UserStatus } from '../../../shared/enums';
import { fail, ok, type Result } from '../../../shared/kernel';
import { UNIT_OF_WORK, type UnitOfWorkPort } from '../../../shared/contracts';
import {
  builtinRole,
  highestRank,
  PERMISSION_RESOLUTION,
  type PermissionResolutionPort,
} from '../../rbac/domain';
import {
  type AdminActor,
  canAdminister,
  isSuperAdminRole,
  statusEndsSessions,
  USER_REPOSITORY,
  UserError,
  type UserFilter,
  type UserPage,
  type UserProfile,
  type UserRepositoryPort,
  type UserSortKey,
} from '../domain';

/** The actor, as the resolver hands it over — already resolved by the guard. */
export interface DirectoryActor {
  id: string;
  roles: readonly string[];
  permissions: readonly string[];
}

/**
 * The administrative view of accounts: the directory, and the three things an operator does
 * to somebody else's account — change their status, change their role, close or reopen it.
 *
 * Every mutation runs `canAdminister` against the target's **rank**, resolved from their
 * roles. That is the rule doing the real work here: `@Permissions('users:status')` establishes
 * that the caller is an administrator, and says nothing about whom they may administer. Without
 * the rank check, a moderator could suspend a finance manager, or a super-admin.
 *
 * Two operations also cut access, and both go through `SESSION_CONTROL` rather than touching
 * sessions directly:
 *
 * - **Suspending or banning.** A suspension that leaves the person signed in for another
 *   fifteen minutes is not a suspension. `revokeAllSessions` bumps the token epoch too, so the
 *   stateless access token stops verifying inside the same request.
 * - **Changing a primary role.** Not to lock them out, but because the *permission cache* is
 *   now wrong — and a stale entry would let a demoted administrator keep their old permissions
 *   for up to five minutes. Note that sessions are deliberately **not** revoked for a role
 *   change: a rider promoted to vendor-manager should not be signed out mid-shift, and E2's
 *   design already guarantees the new permissions apply on their next request because
 *   authorization is resolved per request rather than read from the token.
 */
@Injectable()
export class UserDirectoryService {
  private readonly logger = new Logger(UserDirectoryService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PERMISSION_RESOLUTION) private readonly permissions: PermissionResolutionPort,
    @Inject(SESSION_CONTROL) private readonly sessions: SessionControlPort,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWorkPort,
  ) {}

  // --- reads ----------------------------------------------------------------

  async list(
    filter: UserFilter,
    sort: UserSortKey,
    window: { skip: number; take: number; page: number; pageSize: number },
  ): Promise<UserPage> {
    return this.users.list(filter, sort, window);
  }

  /**
   * One account.
   *
   * `includeDeleted` is honoured here and nowhere on the customer paths: support needs to look
   * at a closed account to answer "what happened to my order", and the alternative is querying
   * the database by hand.
   */
  async find(userId: string, includeDeleted = false): Promise<UserProfile | null> {
    return this.users.findById(userId, includeDeleted);
  }

  // --- status ---------------------------------------------------------------

  async setStatus(
    actor: DirectoryActor,
    userId: string,
    status: UserStatus,
  ): Promise<Result<UserProfile>> {
    const authorised = await this.authorise(actor, userId);
    if (!authorised.ok) return authorised;

    const target = authorised.data;
    if (target.status === status) {
      return fail(UserError.statusUnchanged, { params: { status } });
    }

    const updated = await this.users.setStatus(userId, status);

    if (statusEndsSessions(status)) {
      await this.sessions.revokeAllSessions(userId, 'admin');
    }
    // Always, not only when sessions are cut: `canHoldSession` is checked by the guard against
    // the *resolved* status, so a stale cache would keep a suspended account working.
    await this.permissions.invalidate(userId);

    this.logger.log(`${actor.id} set ${userId} to ${status}.`);
    return ok(updated);
  }

  // --- role -----------------------------------------------------------------

  /**
   * Change an account's primary role.
   *
   * Bounded from **both** ends: the actor must out-rank the target's current role *and* the
   * role being granted. Checking only the target would let a moderator promote a customer to
   * super-admin — the target is rank 10, so the first check passes, and the platform has a new
   * administrator appointed by someone who could not have appointed themselves.
   */
  async setPrimaryRole(
    actor: DirectoryActor,
    userId: string,
    role: UserRole,
  ): Promise<Result<UserProfile>> {
    const authorised = await this.authorise(actor, userId);
    if (!authorised.ok) return authorised;

    const granted = builtinRole(role);
    if (!granted) return fail(UserError.notFound, { path: 'input.role', params: { role } });

    const actorRank = this.rankOfActor(actor);
    if (!isSuperAdminRole(actor.roles) && granted.rank >= actorRank) {
      return fail(UserError.cannotAdminister, {
        path: 'input.role',
        params: { actorRank, targetRank: granted.rank },
      });
    }

    const updated = await this.unitOfWork.runInTransaction(async () =>
      // The column and the mirroring assignment row are one fact; the repository writes both.
      this.users.setPrimaryRole(userId, role),
    );

    await this.permissions.invalidate(userId);
    this.logger.log(`${actor.id} set ${userId}'s primary role to ${role}.`);
    return ok(updated);
  }

  // --- closing and reopening ------------------------------------------------

  async closeAccount(actor: DirectoryActor, userId: string): Promise<Result<null>> {
    const authorised = await this.authorise(actor, userId);
    if (!authorised.ok) return authorised;

    const closed = await this.users.close(userId);
    if (!closed) return fail(UserError.alreadyClosed);

    await this.sessions.revokeAllSessions(userId, 'admin');
    await this.permissions.invalidate(userId);

    this.logger.log(`${actor.id} closed ${userId}.`);
    return ok(null);
  }

  /**
   * Reopen a closed account.
   *
   * Authority is checked against the closed row, which is why `authorise` reads with
   * `includeDeleted` — a tombstone the actor may not administer must not become reopenable
   * simply because closing it made it invisible to the check.
   */
  async reopenAccount(actor: DirectoryActor, userId: string): Promise<Result<UserProfile>> {
    const authorised = await this.authorise(actor, userId, true);
    if (!authorised.ok) return authorised;

    const reopened = await this.users.reopen(userId);
    if (!reopened) return fail(UserError.notClosed);

    await this.permissions.invalidate(userId);
    this.logger.log(`${actor.id} reopened ${userId}.`);

    const updated = await this.users.findById(userId);
    return updated ? ok(updated) : fail(UserError.notFound);
  }

  // --- internals ------------------------------------------------------------

  /**
   * Find the target and check that this actor may act on it — one step, because doing them
   * separately invites a call site that does the first and forgets the second.
   */
  private async authorise(
    actor: DirectoryActor,
    userId: string,
    includeDeleted = false,
  ): Promise<Result<UserProfile>> {
    const target = await this.users.findById(userId, includeDeleted);
    if (!target) return fail(UserError.notFound);

    const resolved = await this.permissions.resolve(userId);
    // An account whose authorization cannot be resolved is treated as rank 0. Safe in this
    // direction: it means the actor's own rank has to clear the lowest bar, not that an
    // unresolvable account becomes untouchable.
    const targetRank = resolved ? highestRank(resolved.roles) : 0;

    const admin: AdminActor = {
      id: actor.id,
      rank: this.rankOfActor(actor),
      isSuperAdmin: isSuperAdminRole(actor.roles),
    };

    const verdict = canAdminister(admin, {
      id: target.id,
      rank: targetRank,
      status: target.status,
      isDeleted: target.deletedAt !== null,
    });
    if (!verdict.ok) return verdict;

    return ok(target);
  }

  private rankOfActor(actor: DirectoryActor): number {
    return highestRank(actor.roles);
  }
}

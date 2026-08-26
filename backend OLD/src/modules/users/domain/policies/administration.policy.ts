import { SUPER_ADMIN_ROLE, type UserStatus } from '../../../../shared/enums';
import { fail, ok, type Result } from '../../../../shared/kernel';
import { UserError } from '../user-errors';

/**
 * "May this administrator act on this account?" — the users-module twin of the RBAC
 * escalation policy, and pure for the same reason.
 *
 * `@Permissions('users:status')` establishes that somebody is an administrator. It says
 * nothing about *whom* they may administer, and without a second rule a moderator could
 * suspend a super-admin. Rank answers it: the same ladder that governs role editing governs
 * acting on a person, so there is one notion of "above me" rather than two that could
 * disagree.
 */

export interface AdminActor {
  id: string;
  /** Highest rank among the actor's roles, from `rbac`'s `highestRank`. */
  rank: number;
  isSuperAdmin: boolean;
}

export interface AdminTarget {
  id: string;
  rank: number;
  status: UserStatus;
  isDeleted: boolean;
}

/**
 * Strictly below, with one exception: a super-admin may act on another super-admin.
 *
 * That exception exists because the alternative is worse. With rank 100 at the top of the
 * ladder, "strictly below" would mean no super-admin can ever suspend a compromised
 * super-admin account — the exact incident where you most need to. Self-action is still
 * refused (see `notSelf`), so the last remaining administrator cannot lock themselves out.
 */
export function canAdminister(actor: AdminActor, target: AdminTarget): Result<null> {
  if (actor.id === target.id) return fail(UserError.cannotAdministerSelf);
  if (actor.isSuperAdmin) return ok(null);

  if (target.rank < actor.rank) return ok(null);
  return fail(UserError.cannotAdminister, {
    params: { actorRank: actor.rank, targetRank: target.rank },
  });
}

/**
 * Statuses that end every session when an account arrives at them.
 *
 * A suspension that leaves the suspended person signed in for another fifteen minutes is not
 * a suspension. This is the list `SESSION_CONTROL` is invoked for, and it is here rather
 * than inline at the call site so "which statuses cut access" is one fact in one place.
 */
export function statusEndsSessions(status: UserStatus): boolean {
  return status === 'suspended' || status === 'banned';
}

export function isSuperAdminRole(roles: readonly string[]): boolean {
  return roles.includes(SUPER_ADMIN_ROLE);
}

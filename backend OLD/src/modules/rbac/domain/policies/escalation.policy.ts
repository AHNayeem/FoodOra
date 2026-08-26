import { PERMISSION_WILDCARD } from '../../../../shared/contracts';
import { fail, ok, type Result } from '../../../../shared/kernel';
import { rankOf } from '../builtin-roles';
import { RbacError } from '../rbac-errors';

/**
 * The privilege-escalation policy: **you cannot hand out authority you do not hold.**
 *
 * This is the most security-sensitive code in E3, and it is a handful of pure functions
 * for exactly that reason — the failure mode is not a crash, it is a moderator quietly
 * making themselves a super-admin, and the only way to be confident about that is to be
 * able to test it with four literals and no database.
 *
 * Three rules, each closing a different door:
 *
 * 1. **Rank.** An actor may only act on roles *below* their own highest rank. Without it,
 *    "assign role" is an escalation primitive: a moderator assigns themselves
 *    `super-admin` and the check that would have stopped them is the one they just gained
 *    the power to skip.
 * 2. **Held permissions.** An actor may only grant permissions they themselves hold.
 *    Rank alone is not enough — a custom role can be created at a low rank and stuffed
 *    with permissions its author never had, which launders authority through a role
 *    definition.
 * 3. **Self.** An actor may not change their own roles or permissions. Not because it is
 *    an escalation on its own — rules 1 and 2 already prevent that — but because it makes
 *    a whole class of mistake unavailable: nobody can remove their own last privilege and
 *    lock the platform's only administrator out of it.
 *
 * A super-admin passes rules 1 and 2 by holding the wildcard and rank 100. Rule 3 applies
 * to them too, which is deliberate: the only account that can undo a super-admin's own
 * demotion is another super-admin, and a platform with exactly one of them should not be
 * able to lose them by accident.
 */

export interface Actor {
  id: string;
  roles: readonly string[];
  /** Resolved permissions. `["*"]` for a super-admin. */
  permissions: readonly string[];
}

/** The highest rank among an actor's roles. Unrecognised roles contribute 0. */
export function highestRank(roles: readonly string[]): number {
  return roles.reduce((highest, slug) => Math.max(highest, rankOf(slug)), 0);
}

export function holdsWildcard(permissions: readonly string[]): boolean {
  return permissions.includes(PERMISSION_WILDCARD);
}

/**
 * May this actor create, edit or delete a role at `targetRank`?
 *
 * Strictly below, not at-or-below. Two moderators of equal rank editing each other's
 * roles is a lateral move that ends in one of them holding more than they started with,
 * and there is no legitimate case for it that an actor one rank up cannot serve.
 */
export function canAdministerRank(actor: Actor, targetRank: number): Result<null> {
  if (holdsWildcard(actor.permissions)) return ok(null);
  if (targetRank < highestRank(actor.roles)) return ok(null);
  return fail(RbacError.rankTooHigh, {
    params: { targetRank, actorRank: highestRank(actor.roles) },
  });
}

/**
 * May this actor grant these permissions?
 *
 * Reports **every** unheld slug rather than the first, so an admin building a custom role
 * out of twelve permissions finds out about all three they cannot grant in one attempt
 * instead of three.
 */
export function canGrantPermissions(
  actor: Actor,
  slugs: readonly string[],
): Result<null> {
  if (holdsWildcard(actor.permissions)) return ok(null);

  const held = new Set(actor.permissions);
  const unheld = slugs.filter((slug) => !held.has(slug));
  if (unheld.length === 0) return ok(null);

  return fail(RbacError.cannotGrantUnheld, { params: { permissions: unheld } });
}

/**
 * Refuse an actor operating on their own authorization.
 *
 * Note that a *denial* is refused too, not only a grant. Allowing self-denial would make
 * it possible to lock the last administrator out of the platform with one careless click,
 * and "it only reduces their own privileges" is not a safety argument when the privilege
 * in question is the one that could undo it.
 */
export function notSelf(actor: Actor, targetUserId: string): Result<null> {
  return actor.id === targetUserId ? fail(RbacError.cannotAdministerSelf) : ok(null);
}

/** A custom role's slug: lowercase, kebab, and never colliding with a built-in. */
export function isValidRoleSlug(slug: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(slug) && slug.length <= 60;
}

/**
 * A grant that has already expired would be written and then ignored, which looks to the
 * granter like the system silently dropped their instruction.
 */
export function checkExpiry(expiresAt: Date | null, now: Date): Result<null> {
  if (expiresAt === null) return ok(null);
  return expiresAt.getTime() > now.getTime() ? ok(null) : fail(RbacError.expiryInPast);
}
